import fs from "fs";
import path from "path";
import {
  renderVideoClip,
  cutKeepRanges,
  applyPostEffects,
  pickPunchZooms,
  shapeBrollCues,
  captionCenterSpans,
  SplitScreenCustomOptions,
  TrackingResult,
} from "./videoService";
import { buildSentences, planBroll, fetchBrollAssets, hasBrollSource } from "./brollService";
import { measureBackgroundAudio, shotMap, coverage, inside, overlaps, Span } from "./adaptiveFx";
import { computeKeepRanges, toOutputTime, wordsOnOutput, keptDuration, inSpokenOrder, Range, TimelineWord } from "./timeline";

/**
 * One clip, start to finish — the SAME path for job renders, dashboard
 * downloads and editor re-renders (they used to be three copies, and the
 * editor's skipped B-roll, music, zooms and silence removal):
 *
 *   1. keep-ranges: the source window minus pauses / fillers (Remove
 *      silences) and words deleted in the editor;
 *   2. ONE render of the kept span (one tracking pass, one layout);
 *   3. cut the kept ranges out of it, frame-exact;
 *   4. B-roll / punch zooms / music on the final timeline, captions last.
 */

type CaptionStyle = "hormozi" | "neon" | "beast" | "clean" | "kinetic" | "snipcut";

export interface ProduceClipOptions {
  inputPath: string;
  outputPath: string;
  /** Source window, seconds. */
  startTime: number;
  endTime: number;
  /** Source-absolute words (text already edited; `deleted` = cut). */
  words: TimelineWord[];
  aspectRatio: "9:16" | "1:1" | "16:9";
  reframeMode?: any;
  splitScreen?: boolean;
  splitScreenOptions?: SplitScreenCustomOptions;
  captionPositionY?: number;
  captionStyle: CaptionStyle;
  /** Hook title text (headline); shown in the upper third when hookTitle. */
  headline?: string;
  hookTitle?: boolean;
  /** AI key phrases coloured in the captions (null/[] = numbers only). */
  keywords?: string[] | null;
  removeSilences?: boolean;
  broll?: boolean;
  musicBed?: boolean;
  keys?: { groqKey?: string; openaiKey?: string; claudeKey?: string; pexelsKey?: string; pixabayKey?: string };
  brollTag?: string;
}

export interface ProduceClipResult {
  tracking: TrackingResult | null;
  /** Final clip length (seconds). */
  duration: number;
  /** Kept parts of the source (source seconds); one range = no cuts. */
  keepRanges: Range[];
  fillersRemoved: number;
  deletedRemoved: number;
  fxSummary?: string;
  /** Why effects were used or skipped for this clip. */
  fxDecisions?: { music: boolean; musicReason?: string; talkingHead: number; notes: string[] };
  /** Caption words on the output clock. */
  outputWords: { start: number; end: number; text: string }[];
}

const wordText = (w: TimelineWord) => String(w.text ?? w.word ?? "");

export async function produceClip(o: ProduceClipOptions): Promise<ProduceClipResult> {
  const windowDur = o.endTime - o.startTime;
  if (!(windowDur > 0.3)) throw new Error("Clip is too short to render.");

  const inWindow = (o.words || [])
    .filter((w) => Number.isFinite(w.start) && Number.isFinite(w.end) && w.end > o.startTime && w.start < o.endTime)
    .map((w) => ({ ...w, text: wordText(w) }))
    .filter((w) => w.text.trim().length > 0);
  // Spoken order, never time-sorted (see inSpokenOrder).
  inSpokenOrder(inWindow);

  // ---- 1. what to keep ---------------------------------------------------
  const hasDeleted = inWindow.some((w) => w.deleted);
  let ranges: Range[] = [{ start: o.startTime, end: o.endTime }];
  let fillersRemoved = 0;
  let deletedRemoved = 0;
  if (o.removeSilences || hasDeleted) {
    const keep = computeKeepRanges(inWindow, o.startTime, o.endTime, {
      pauseGap: o.removeSilences ? 0.55 : Infinity,
      cutFillers: Boolean(o.removeSilences),
      tightEdges: Boolean(o.removeSilences),
    });
    if (keep.ranges.length > 0) {
      ranges = keep.ranges;
      fillersRemoved = keep.fillersRemoved;
      deletedRemoved = keep.deletedRemoved;
    } else if (hasDeleted && inWindow.every((w) => w.deleted)) {
      throw new Error("Every word in this clip is deleted — restore some words before rendering.");
    }
  }
  const cutting =
    ranges.length > 1 ||
    Math.abs(ranges[0].start - o.startTime) > 0.04 ||
    Math.abs(ranges[0].end - o.endTime) > 0.04;
  const spanStart = ranges[0].start;
  const spanEnd = ranges[ranges.length - 1].end;
  const spanDur = Number((spanEnd - spanStart).toFixed(3));
  const relRanges = ranges.map((r) => ({ start: r.start - spanStart, end: r.end - spanStart }));

  const keptWords = inWindow.filter((w) => {
    if (w.deleted) return false;
    const mid = (w.start + w.end) / 2;
    return ranges.some((r) => mid >= r.start && mid <= r.end);
  });
  const outputWords = wordsOnOutput(keptWords, ranges).map((w) => ({ start: w.start, end: w.end, text: w.text }));
  const hookText = o.hookTitle && o.headline ? o.headline : undefined;
  const keywords = o.keywords || undefined;
  const fx = Boolean(o.broll || o.musicBed);

  const outDir = path.dirname(o.outputPath);
  fs.mkdirSync(outDir, { recursive: true });
  const tag = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const spanPath = path.join(outDir, `span-${tag}.mp4`);
  const basePath = path.join(outDir, `base-${tag}.mp4`);
  const temp: string[] = [];

  const renderSpan = (outputPath: string, skipCaptions: boolean) =>
    renderVideoClip({
      inputPath: o.inputPath,
      outputPath,
      startTime: spanStart,
      duration: spanDur,
      aspectRatio: o.aspectRatio,
      reframeMode: o.reframeMode,
      splitScreen: o.splitScreen,
      splitScreenOptions: o.splitScreenOptions,
      captionPositionY: o.captionPositionY,
      transcript: keptWords.map((w) => ({ start: w.start, end: w.end, text: w.text })),
      headline: o.headline,
      captionStyle: o.captionStyle,
      skipCaptions,
      keywords,
      hookTitle: hookText,
    });

  try {
    // ---- 2-4 ---------------------------------------------------------------
    if (fx) {
      try {
        // Does the clip already carry music / a sound bed? (Checked on the
        // source audio while the picture renders.)
        const bgAudio = o.musicBed
          ? measureBackgroundAudio(o.inputPath, spanStart, spanDur, keptWords)
          : Promise.resolve(null);
        const base = await renderSpan(cutting ? spanPath : basePath, true);
        if (cutting) {
          temp.push(spanPath);
          await cutKeepRanges(spanPath, basePath, relRanges);
        }
        temp.push(basePath);
        const finalDur = cutting ? keptDuration(ranges) : spanDur;
        const mapRel = (t: number) => toOutputTime(ranges, spanStart + t);
        const layoutMode = o.splitScreen ? "split-screen" : o.reframeMode || "auto-tracker";
        const mapSpans = (sp: Span[]) =>
          sp.map((s) => ({ start: mapRel(s.start), end: mapRel(s.end) })).filter((s) => s.end - s.start > 0.05);
        const shotsRel = shotMap(base.tracking, layoutMode, spanDur);
        const shots = { crop: mapSpans(shotsRel.crop), fit: mapSpans(shotsRel.fit), split: mapSpans(shotsRel.split) };
        // Mostly screen recording / slides / split: the frame is the content.
        const talkingHead = coverage(shots.crop, finalDur);
        const notes: string[] = [];

        // Split parts of the clip: tracker split segments, or the whole
        // clip in split-screen mode. Captions go on the seam there, and
        // B-roll stays off them (the split IS the visual — a full-frame
        // cutaway over a chosen split-screen was seen in testing).
        const centerSpans = (layoutMode === "auto-tracker" || layoutMode === "split-screen" ? captionCenterSpans(base.tracking, spanDur, o.aspectRatio) : [])
          .map((s) => ({ start: mapRel(s.start), end: mapRel(s.end) }))
          .filter((s) => s.end > s.start);

        let cues: { start: number; end: number; assetPath: string; kind: "image" | "video" }[] = [];
        const brollKeys = { pexelsKey: o.keys?.pexelsKey, pixabayKey: o.keys?.pixabayKey, openaiKey: o.keys?.openaiKey };
        if (o.broll && talkingHead < 0.4) {
          notes.push(
            shots.fit.length && coverage(shots.fit, finalDur) >= coverage(shots.split, finalDur)
              ? "B-roll skipped: the frame itself is the content (screen/slides/wide shot)"
              : "B-roll skipped: split-screen clip"
          );
        } else if (o.broll && !hasBrollSource(brollKeys)) {
          notes.push("B-roll skipped: add an OpenAI key (AI-generated B-roll) in API Keys");
        } else if (o.broll) {
          const sentences = buildSentences(pseudoSegments(keptWords), spanStart, spanEnd);
          if (sentences.length) {
            const plan = await planBroll(sentences, {
              groqKey: o.keys?.groqKey || process.env.GROQ_API_KEY,
              openaiKey: o.keys?.openaiKey,
              claudeKey: o.keys?.claudeKey,
            });
            // Decide WHERE cutaways go before fetching anything (AI images
            // cost money): output clock, never over a split or a fit shot,
            // then the usual hook-clear / spacing / 20%-coverage rules.
            let wanted = plan
              .map((p) => ({ ...p, start: mapRel(p.start), end: mapRel(p.end) }))
              .filter((p) => p.end - p.start >= 0.6)
              .filter((p) => !overlaps(centerSpans, p.start, p.end, 0.4) && !overlaps(shots.fit, p.start, p.end, 0.4));
            const dropped = plan.length - wanted.length;
            if (dropped > 0 && (shots.fit.length || centerSpans.length)) notes.push(`${dropped} B-roll idea(s) kept off screen/split shots`);
            wanted = shapeBrollCues(wanted, finalDur);
            if (wanted.length) {
              const assets = await fetchBrollAssets(wanted, {
                ...brollKeys,
                pexelsKey: o.keys?.pexelsKey || process.env.PEXELS_API_KEY,
                pixabayKey: o.keys?.pixabayKey || process.env.PIXABAY_API_KEY,
                destDir: path.join(process.cwd(), "data", "broll"),
                tag: o.brollTag || `broll-${tag}`,
              });
              cues = assets.map((a) => ({ start: a.start, end: a.end, assetPath: a.assetPath, kind: a.kind }));
            }
          }
        }
        // Punch zooms only on a talking head: inside a crop shot and not
        // while a cutaway covers it.
        const punches = pickPunchZooms(
          outputWords,
          (s, e) => inside(shots.crop, s, e) && !overlaps(cues, s, e, 0.05) && !overlaps(centerSpans, s, e, 0.05)
        );
        const bg = await bgAudio;
        const music = Boolean(o.musicBed) && !(bg && bg.hasBackground);
        if (o.musicBed && bg) {
          console.log(`[ClipProducer] Music bed ${music ? "on" : "skipped"}: ${bg.reason}`);
          if (!music) notes.push("music skipped: the video already has music/sound");
        }

        await applyPostEffects({
          basePath,
          outputPath: o.outputPath,
          duration: finalDur,
          aspectRatio: o.aspectRatio,
          words: outputWords,
          captionStyle: o.captionStyle,
          broll: cues,
          punches,
          musicBed: music,
          captionPositionY: o.captionPositionY,
          captionOptions: { keywords, centerSpans, hook: hookText ? { text: hookText } : undefined },
        });
        return {
          tracking: base.tracking,
          duration: Number(finalDur.toFixed(2)),
          keepRanges: ranges,
          fillersRemoved,
          deletedRemoved,
          outputWords,
          fxSummary:
            `🎬 ${cues.length} B-roll cutaway${cues.length === 1 ? "" : "s"}, ${punches.length} punch zoom${punches.length === 1 ? "" : "s"}${music ? ", music bed" : ""}` +
            (notes.length ? ` (${notes.join("; ")})` : ""),
          fxDecisions: { music, musicReason: bg?.reason, talkingHead: Number(talkingHead.toFixed(2)), notes },
        };
      } catch (fxErr) {
        // FX must never cost the user the clip: fall through to the plain render.
        console.warn("[ClipProducer] Effects pass failed; rendering without effects:", fxErr);
      }
    }

    let tracking: TrackingResult | null;
    if (cutting) {
      tracking = (await renderSpan(spanPath, false)).tracking;
      temp.push(spanPath);
      await cutKeepRanges(spanPath, o.outputPath, relRanges);
    } else {
      tracking = (await renderSpan(o.outputPath, false)).tracking;
    }
    return {
      tracking,
      duration: Number((cutting ? keptDuration(ranges) : spanDur).toFixed(2)),
      keepRanges: ranges,
      fillersRemoved,
      deletedRemoved,
      outputWords,
    };
  } finally {
    for (const p of temp) {
      try { fs.unlinkSync(p); } catch {}
    }
  }
}

/** Sentence-ish segments from a word stream (input to the B-roll planner). */
function pseudoSegments(words: { start: number; end: number; text: string }[]) {
  const segs: { start: number; end: number; text: string }[] = [];
  let cur: typeof words = [];
  const flush = () => {
    if (cur.length) {
      segs.push({ start: cur[0].start, end: cur[cur.length - 1].end, text: cur.map((w) => w.text).join(" ") });
      cur = [];
    }
  };
  for (const w of words) {
    if (cur.length && (w.start - cur[cur.length - 1].end > 0.8 || w.start - cur[0].start > 7)) flush();
    cur.push(w);
    if (/[.!?]$/.test(w.text)) flush();
  }
  flush();
  return segs;
}
