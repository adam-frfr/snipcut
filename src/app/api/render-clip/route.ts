import { NextRequest, NextResponse } from "next/server";
import {
  renderVideoClip,
  generatePreviewClip,
  generatePosterImage,
  applyPostEffects,
  pickPunchZooms,
} from "@/lib/videoService";
import { buildSentences, planBroll, fetchBrollAssets } from "@/lib/brollService";
import path from "path";
import fs from "fs";
import os from "os";
import { verifyAuthAndRateLimit } from "@/lib/authRateLimit";

export async function POST(req: NextRequest) {
  const authError = verifyAuthAndRateLimit(req);
  if (authError) return authError;

  const renderStartTime = Date.now();
  try {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Request body was cut off or invalid — please retry." },
        { status: 400 }
      );
    }
    const {
      inputPath,
      startTime,
      duration,
      aspectRatio,
      splitScreen,
      splitScreenOptions,
      captionPositionY,
      reframeMode,
      transcript,
      headline,
      captionStyle,
      broll,
      music,
      pexelsKey,
      groqKey,
      openaiKey,
      claudeKey,
    } = body;

    if (!inputPath || startTime === undefined || !duration) {
      return NextResponse.json(
        { error: "inputPath, startTime, and duration are required" },
        { status: 400 }
      );
    }

    // Non-numeric values would otherwise flow into ffmpeg as NaN and fail
    // with an opaque 500.
    if (
      typeof startTime !== "number" || !Number.isFinite(startTime) || startTime < 0 ||
      typeof duration !== "number" || !Number.isFinite(duration) || duration <= 0
    ) {
      return NextResponse.json(
        { error: "startTime and duration must be valid numbers" },
        { status: 400 }
      );
    }

    const outputDir = path.join(process.cwd(), "public", "rendered_clips");
    const outputFilename = `clip-${Date.now()}.mp4`;
    const outputPath = path.join(outputDir, outputFilename);

    console.log(
      `[Stage: Render Clip API] Rendering clip from ${startTime}s (${duration}s) -> ${outputFilename}`
    );

    const start2 = Number(Number(startTime).toFixed(2));
    const dur2 = Number(Number(duration).toFixed(2));
    const clipEnd = start2 + dur2;
    const renderOpts = {
      inputPath,
      startTime: start2,
      duration: dur2,
      aspectRatio: aspectRatio || "9:16",
      reframeMode: reframeMode || "auto-tracker",
      splitScreen: Boolean(splitScreen),
      splitScreenOptions,
      captionPositionY,
      transcript,
      headline,
      captionStyle,
    };

    // Reference FX on downloads too (previously only job renders got
    // them, so a clip downloaded from the dashboard was a plain crop +
    // captions while the same clip auto-rendered by a job had B-roll,
    // punch zooms and music). Opt-in per request: the dashboard sends
    // its B-Roll / Music toggles; the editor does not, so editor
    // re-renders stay plain. Any FX failure falls back to the standard
    // captioned render — a download must never fail because of FX.
    const absWords: { text: string; start: number; end: number }[] = Array.isArray(transcript)
      ? transcript
          .map((w: any) => ({
            text: String(w?.text || w?.word || ""),
            start: Number(w?.start),
            end: Number(w?.end),
          }))
          .filter((w: any) => w.text && Number.isFinite(w.start) && Number.isFinite(w.end))
      : [];
    const wantFx = Boolean(broll || music) && absWords.length >= 3;
    let renderResult: Awaited<ReturnType<typeof renderVideoClip>> | null = null;
    let fxApplied = false;

    if (wantFx) {
      const baseFilename = `clip-${Date.now()}-fxbase.mp4`;
      const basePath = path.join(outputDir, baseFilename);
      try {
        const base = await renderVideoClip({
          ...renderOpts,
          outputPath: basePath,
          skipCaptions: true,
        } as any);
        const relWords = absWords
          .filter((w) => w.start >= start2 && w.end <= clipEnd)
          .map((w) => ({
            text: w.text,
            start: Math.max(0, Number((w.start - start2).toFixed(2))),
            end: Math.max(0.05, Number((w.end - start2).toFixed(2))),
          }));
        let cues: { start: number; end: number; assetPath: string; kind: "image" | "video" }[] = [];
        if (broll) {
          // Sentence-ish segments from the word stream for the planner.
          const pseudoSegments: { start: number; end: number; text: string }[] = [];
          let cur: typeof absWords = [];
          const flush = () => {
            if (cur.length) {
              pseudoSegments.push({
                start: cur[0].start,
                end: cur[cur.length - 1].end,
                text: cur.map((w) => w.text).join(" "),
              });
              cur = [];
            }
          };
          for (const w of absWords) {
            if (cur.length && (w.start - cur[cur.length - 1].end > 0.8 || w.start - cur[0].start > 7)) flush();
            cur.push(w);
            if (/[.!?]$/.test(w.text)) flush();
          }
          flush();
          const sentences = buildSentences(pseudoSegments, start2, clipEnd);
          if (sentences.length) {
            const plan = await planBroll(sentences, {
              groqKey: groqKey || process.env.GROQ_API_KEY,
              openaiKey: openaiKey,
              claudeKey: claudeKey,
            });
            if (plan.length) {
              const assets = await fetchBrollAssets(plan, {
                pexelsKey: pexelsKey || process.env.PEXELS_API_KEY,
                destDir: path.join(process.cwd(), "data", "broll"),
                tag: `broll-dl-${Date.now().toString(36)}`,
              });
              cues = assets.map((a) => ({ start: a.start, end: a.end, assetPath: a.assetPath, kind: a.kind }));
            }
          }
        }
        await applyPostEffects({
          basePath,
          outputPath,
          duration: dur2,
          aspectRatio: (aspectRatio || "9:16") as any,
          words: relWords,
          captionStyle: (captionStyle || "kinetic") as any,
          broll: cues,
          punches: pickPunchZooms(relWords),
          musicBed: Boolean(music),
        });
        renderResult = { outputPath, tracking: (base as any).tracking };
        fxApplied = true;
        console.log(
          `[Stage: Render Clip API] FX download render: ${cues.length} B-roll cue(s), music=${Boolean(music)}`
        );
      } catch (fxErr) {
        console.warn("[Stage: Render Clip API] FX path failed; standard render instead:", fxErr);
        renderResult = null;
      } finally {
        try {
          if (fs.existsSync(basePath)) fs.unlinkSync(basePath);
        } catch {}
      }
    }

    if (!renderResult) {
      renderResult = await renderVideoClip({ ...renderOpts, outputPath });
    }

    // Lightweight preview rendition for smooth in-browser playback (never fatal)
    const previewName = await generatePreviewClip(outputPath).catch(() => null);
    const posterName = await generatePosterImage(outputPath).catch(() => null);
    // Exact byte sizes so the dashboard's downloader can show real
    // progress/ETA (the hosting proxy strips Content-Length, so the
    // browser's own download bar cannot).
    const fileSize = (() => { try { return fs.statSync(outputPath).size; } catch { return undefined; } })();
    const previewFileSize = (() => {
      try {
        return previewName ? fs.statSync(path.join(path.dirname(outputPath), previewName)).size : undefined;
      } catch { return undefined; }
    })();

    const elapsedMs = Date.now() - renderStartTime;
    return NextResponse.json({
      success: true,
      downloadUrl: `/api/media?file=rendered_clips/${outputFilename}`,
      previewDownloadUrl: previewName
        ? `/api/media?file=rendered_clips/${previewName}`
        : undefined,
      posterUrl: posterName
        ? `/api/media?file=rendered_clips/${posterName}`
        : undefined,
      fileSize,
      previewFileSize,
      fxApplied,
      filename: outputFilename,
      tracking: renderResult.tracking,
      timingMs: elapsedMs,
    });
  } catch (error: any) {
    console.error("[Stage: Render Clip API] FFmpeg Render Error:", error);
    return NextResponse.json(
      { error: error?.message || "FFmpeg video rendering failed" },
      { status: 500 }
    );
  }
}
