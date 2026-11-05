"use client";

import React, { useState, useEffect, useRef, Suspense, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Scissors,
  Play,
  Pause,
  Volume2,
  VolumeX,
  Download,
  ArrowLeft,
  Sliders,
  Type,
  Wand2,
  Check,
  AlertCircle,
  Scissors as TrimIcon,
  Pencil,
  RotateCcw,
} from "lucide-react";
import confetti from "canvas-confetti";
import { computeKeepRanges, keptDuration, toOutputTime, toSourceTime, Range } from "@/lib/timeline";

/**
 * Studio Editor — fully wired to the real pipeline.
 *
 * - Loads the user's generated clips from localStorage ("snipcut_user_clips",
 *   written by the dashboard). No mock clips, no fabricated transcripts.
 * - Preview is a real <video> element playing the rendered clip file; the
 *   playhead, seek bar and duration all come from the element itself.
 * - Transcript words are the clip's real word timings (clip-relative).
 *   Clicking a word seeks; words also drive trim in/out points.
 * - Layout / captions / trim changes are applied by RE-RENDERING from the
 *   source video through POST /api/render-clip (the same engine the job
 *   pipeline uses: tracking, karaoke captions, split-screen). The preview
 *   then swaps to the newly rendered file and the stored clip is updated
 *   so the dashboard sees the edited version too.
 */

type LayoutMode = "auto-tracker" | "split-screen" | "blurred-fit" | "center";
type CaptionStyle = "hormozi" | "neon" | "beast" | "clean" | "kinetic" | "snipcut";
type Aspect = "9:16" | "1:1" | "16:9";

/** A word on the SOURCE clock (seconds into the original video). */
interface EditorWord {
  start: number;
  end: number;
  text: string;
  deleted?: boolean;
}

interface ClipFx {
  removeSilences: boolean;
  broll: boolean;
  musicBed: boolean;
  hookTitle: boolean;
  keywordHighlights: boolean;
}

function fmt(t: number): string {
  if (!isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
}

const draftKey = (id: string) => `snipcut_editor_draft_${id}`;

/** Source-absolute words for a stored clip (older clips only carry clip-relative ones). */
function sourceWordsOf(c: any): EditorWord[] {
  if (Array.isArray(c?.sourceWords) && c.sourceWords.length) {
    return c.sourceWords.map((w: any) => ({
      start: Number(w.start),
      end: Number(w.end),
      text: String(w.text ?? ""),
      deleted: Boolean(w.deleted),
    }));
  }
  const base = Number(c?.startTime) || 0;
  return (Array.isArray(c?.transcript) ? c.transcript : []).map((w: any) => ({
    start: Number(w.start) + base,
    end: Number(w.end) + base,
    text: String(w.text ?? ""),
  }));
}

function EditorContent() {
  const searchParams = useSearchParams();
  const wantedClipId = searchParams.get("clip") || searchParams.get("clipId") || "";

  const [allClips, setAllClips] = useState<any[]>([]);
  const [clip, setClip] = useState<any>(null);
  const [loaded, setLoaded] = useState(false);

  // Playback (all from the real <video> element)
  const videoRef = useRef<HTMLVideoElement>(null);
  const [previewUrl, setPreviewUrl] = useState("");
  const [masterUrl, setMasterUrl] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  // Words + trim live on the SOURCE clock, so trims can reach past the AI's
  // cut and edits survive silence removal. The preview video plays the
  // kept ranges of the source back to back (renderedRanges).
  const [words, setWords] = useState<EditorWord[]>([]);
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [previewTrimOnly, setPreviewTrimOnly] = useState(true);
  const [selA, setSelA] = useState<number | null>(null);
  const [selB, setSelB] = useState<number | null>(null);
  const [editText, setEditText] = useState("");
  const [dirty, setDirty] = useState(false);

  // Render settings
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("auto-tracker");
  const [aspectRatio, setAspectRatio] = useState<Aspect>("9:16");
  const [splitRatio, setSplitRatio] = useState(50);
  const [topCropX, setTopCropX] = useState(25);
  const [botCropX, setBotCropX] = useState(75);
  const [captionStyle, setCaptionStyle] = useState<CaptionStyle>("hormozi");
  const [headline, setHeadline] = useState("");
  // null = the style's own default height (same as the generated clip).
  const [captionPosY, setCaptionPosY] = useState<number | null>(null);
  const [fx, setFx] = useState<ClipFx>({
    removeSilences: false,
    broll: false,
    musicBed: false,
    hookTitle: true,
    keywordHighlights: true,
  });

  // Render state
  const [isRendering, setIsRendering] = useState(false);
  const [renderError, setRenderError] = useState("");
  const [renderNote, setRenderNote] = useState("");

  const getAuthHeaders = (): Record<string, string> => {
    if (typeof window === "undefined") return {};
    const t = localStorage.getItem("app_access_token");
    return t ? { "x-app-access-token": t } : {};
  };

  // /api/render-clip is async: POST starts the render (202 + renderId)
  // and this polls GET until the result lands. A single synchronous
  // request used to sit open for the whole 30-60s render, which the
  // Cloudflare Worker front door cut at ~30s with a 502. Throws with
  // the server's message on failure, like the old inline fetch did.
  // A 401 keeps the editor's friendlier token message.
  const renderClipWithPolling = async (body: any): Promise<any> => {
    const res = await fetch("/api/render-clip", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      body: JSON.stringify(body),
    });
    if (res.status === 401) {
      throw new Error("Access token required — set your APP_ACCESS_TOKEN on the dashboard first (it appears as a prompt there), then come back.");
    }
    let data: any = {};
    try {
      data = await res.json();
    } catch {
      throw new Error("The server reply was cut off — please retry the render.");
    }
    if (!res.ok || data.error) throw new Error(data.error || "FFmpeg rendering failed");
    if (data.status !== "rendering") return data;
    const renderId = data.renderId;
    const deadline = Date.now() + 12 * 60 * 1000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 2500));
      const pr = await fetch(`/api/render-clip?id=${encodeURIComponent(renderId)}`, {
        headers: getAuthHeaders(),
      });
      let pd: any = {};
      try {
        pd = await pr.json();
      } catch {
        continue;
      }
      if (pd.status === "completed") return pd;
      if (pd.status === "failed") throw new Error(pd.error || "FFmpeg rendering failed");
      if (!pr.ok && pd.error) throw new Error(pd.error);
    }
    throw new Error(
      "The render is taking unusually long — it may still finish on the server. Press the button again in a moment to pick up the result."
    );
  };

  // Source ranges the current preview video is made of.
  const clipStart = Number(clip?.startTime) || 0;
  const clipEnd = Number(clip?.endTime) || clipStart + (Number(clip?.duration) || 0);
  const renderedRanges: Range[] =
    Array.isArray(clip?.keepRanges) && clip.keepRanges.length
      ? clip.keepRanges
      : clip
        ? [{ start: clipStart, end: clipEnd }]
        : [];
  const renderedFrom = renderedRanges.length ? renderedRanges[0].start : 0;
  const renderedTo = renderedRanges.length ? renderedRanges[renderedRanges.length - 1].end : 0;
  const inRendered = (t: number) => renderedRanges.some((r) => t >= r.start - 0.05 && t <= r.end + 0.05);
  const outOf = (srcT: number) => toOutputTime(renderedRanges, Math.max(renderedFrom, Math.min(renderedTo, srcT)));

  // Editable window: the clip plus the surrounding source words.
  const winStart = Math.min(clipStart, words.length ? words[0].start : clipStart);
  const winEnd = Math.max(clipEnd, words.length ? words[words.length - 1].end : clipEnd);

  const applyClip = useCallback((c: any) => {
    setClip(c);
    // Playback prefers the lightweight preview rendition (smooth on slow
    // connections); downloads always use the full-quality master.
    setPreviewUrl(c.previewUrl || c.renderedVideoUrl || c.videoUrl || "");
    setMasterUrl(c.renderedVideoUrl || c.videoUrl || "");
    setDuration(Number(c.duration) || 0);
    setWords(sourceWordsOf(c));
    const s0 = Number(c.startTime) || 0;
    setTrimStart(s0);
    setTrimEnd(Number(c.endTime) || s0 + (Number(c.duration) || 0));
    setHeadline(c.hookHeadline || c.title || "");
    if (c.captionStyle) setCaptionStyle(c.captionStyle);
    if (c.aspectRatio) setAspectRatio(c.aspectRatio);
    setFx({
      removeSilences: Boolean(c.fx?.removeSilences),
      broll: Boolean(c.fx?.broll),
      musicBed: Boolean(c.fx?.musicBed),
      hookTitle: c.fx ? c.fx.hookTitle !== false : true,
      keywordHighlights: c.fx ? c.fx.keywordHighlights !== false : true,
    });
    setCurrentTime(0);
    setSelA(null);
    setSelB(null);
    setEditText("");
    setDirty(false);
    setRenderError("");
    setRenderNote("");
    // Unsaved edits from an earlier visit (refresh, closed tab) come back.
    try {
      const raw = localStorage.getItem(draftKey(c.id));
      const d = raw ? JSON.parse(raw) : null;
      if (d && Array.isArray(d.words) && d.words.length) {
        setWords(d.words);
        if (Number.isFinite(d.trimStart)) setTrimStart(d.trimStart);
        if (Number.isFinite(d.trimEnd)) setTrimEnd(d.trimEnd);
        if (d.fx) setFx(d.fx);
        if (d.captionStyle) setCaptionStyle(d.captionStyle);
        if (d.aspectRatio) setAspectRatio(d.aspectRatio);
        if (d.layoutMode) setLayoutMode(d.layoutMode);
        if (typeof d.headline === "string") setHeadline(d.headline);
        if (d.captionPosY === null || Number.isFinite(d.captionPosY)) setCaptionPosY(d.captionPosY);
        setDirty(true);
        setRenderNote("Restored your unsaved edits from last time — re-render to apply them.");
      }
    } catch {}
  }, []);

  // Autosave unsaved edits per clip, and warn before leaving the page with
  // them (they used to vanish on a refresh or a closed tab).
  useEffect(() => {
    if (!clip || !dirty) return;
    try {
      localStorage.setItem(
        draftKey(clip.id),
        JSON.stringify({ words, trimStart, trimEnd, fx, captionStyle, aspectRatio, layoutMode, headline, captionPosY, savedAt: Date.now() })
      );
    } catch {}
  }, [clip, dirty, words, trimStart, trimEnd, fx, captionStyle, aspectRatio, layoutMode, headline, captionPosY]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // Load the user's clips (dashboard writes them to snipcut_user_clips)
  useEffect(() => {
    let parsed: any[] = [];
    try {
      const saved = localStorage.getItem("snipcut_user_clips");
      if (saved) {
        const arr = JSON.parse(saved);
        if (Array.isArray(arr)) parsed = arr;
      }
    } catch {}
    setAllClips(parsed);
    const found = parsed.find((c: any) => c.id === wantedClipId) || parsed[0] || null;
    if (found) applyClip(found);
    setLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantedClipId]);

  // Keep the element's playback rate in sync
  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = playbackSpeed;
  }, [playbackSpeed, previewUrl]);

  const srcNow = renderedRanges.length ? toSourceTime(renderedRanges, currentTime) : 0;
  const activeWordIdx = words.findIndex(
    (w, i) => !w.deleted && inRendered(w.start) && srcNow >= w.start && (i === words.length - 1 || srcNow < words[i + 1].start)
  );
  const selLo = selA === null ? null : Math.min(selA, selB ?? selA);
  const selHi = selA === null ? null : Math.max(selA, selB ?? selA);
  const selection = selLo === null || selHi === null ? [] : words.slice(selLo, selHi + 1);
  const selectionAllDeleted = selection.length > 0 && selection.every((w) => w.deleted);

  // Preview-only playback bounds (output clock) for the current trim.
  const pStart = outOf(trimStart);
  const pEnd = trimEnd >= renderedTo ? duration : outOf(trimEnd);

  // What the next render will produce (pauses, fillers, deletions cut).
  const plannedLength = (() => {
    const inTrim = words.filter((w) => w.end > trimStart && w.start < trimEnd);
    if (!fx.removeSilences && !inTrim.some((w) => w.deleted)) return trimEnd - trimStart;
    const k = computeKeepRanges(inTrim, trimStart, trimEnd, {
      pauseGap: fx.removeSilences ? 0.55 : Infinity,
      cutFillers: fx.removeSilences,
      tightEdges: fx.removeSilences,
    });
    return keptDuration(k.ranges);
  })();

  const seekTo = (t: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(t, duration || t));
    setCurrentTime(v.currentTime);
  };

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      if (previewTrimOnly && pEnd > pStart && (currentTime < pStart || currentTime >= pEnd)) seekTo(pStart);
      v.play().catch(() => {});
    } else {
      v.pause();
    }
  };

  const handleTimeUpdate = () => {
    const v = videoRef.current;
    if (!v) return;
    const t = v.currentTime;
    setCurrentTime(t);
    if (previewTrimOnly && pEnd > pStart && t >= pEnd) {
      v.pause();
      v.currentTime = pStart;
      setCurrentTime(pStart);
    }
  };

  const clickWord = (idx: number, extend: boolean) => {
    if (extend && selA !== null) {
      setSelB(idx);
    } else {
      setSelA(idx);
      setSelB(idx);
      setEditText(words[idx]?.text || "");
    }
    const w = words[idx];
    if (w && inRendered(w.start)) seekTo(outOf(w.start) + 0.01);
  };

  const setTrimStartAtWord = (idx: number) => {
    const w = words[idx];
    if (!w) return;
    setTrimStart(Number(Math.max(winStart, Math.min(w.start, trimEnd - 0.5)).toFixed(2)));
    setDirty(true);
  };

  const setTrimEndAtWord = (idx: number) => {
    const w = words[idx];
    if (!w) return;
    setTrimEnd(Number(Math.min(winEnd, Math.max(w.end, trimStart + 0.5)).toFixed(2)));
    setDirty(true);
  };

  const toggleDeleteSelection = () => {
    if (selLo === null || selHi === null) return;
    const restore = selectionAllDeleted;
    setWords((ws) => ws.map((w, i) => (i >= selLo && i <= selHi ? { ...w, deleted: !restore } : w)));
    setDirty(true);
  };

  const saveWordText = () => {
    if (selLo === null || selLo !== selHi) return;
    const t = editText.trim();
    if (!t) return;
    setWords((ws) => ws.map((w, i) => (i === selLo ? { ...w, text: t } : w)));
    setDirty(true);
  };

  const handleRender = async () => {
    if (!clip) return;
    if (!clip.videoFilePath) {
      setRenderError("This clip doesn't carry its source video path, so it can't be re-rendered. Re-generate it from the dashboard first.");
      return;
    }
    if (trimEnd - trimStart < 1) {
      setRenderError("Trim is too short — pick a range of at least 1 second.");
      return;
    }
    if (plannedLength < 1) {
      setRenderError("Less than a second would be left after the cuts — restore some words or widen the trim.");
      return;
    }
    setIsRendering(true);
    setRenderError("");
    setRenderNote("");
    try {
      const sendWords = words
        .filter((w) => w.end > trimStart && w.start < trimEnd)
        .map((w) => ({
          start: Number(w.start.toFixed(3)),
          end: Number(w.end.toFixed(3)),
          text: w.text,
          ...(w.deleted ? { deleted: true } : {}),
        }));

      const data = await renderClipWithPolling({
        inputPath: clip.videoFilePath,
        startTime: Number(trimStart.toFixed(2)),
        duration: Number((trimEnd - trimStart).toFixed(2)),
        aspectRatio,
        reframeMode: layoutMode,
        splitScreen: layoutMode === "split-screen",
        splitScreenOptions:
          layoutMode === "split-screen"
            ? { splitRatio: splitRatio / 100, topCropXPercent: topCropX, botCropXPercent: botCropX }
            : undefined,
        captionPositionY: captionPosY ?? undefined,
        transcript: sendWords,
        headline: headline.trim() || undefined,
        captionStyle,
        // Same effects as the generated clip (they used to be dropped here).
        removeSilences: fx.removeSilences,
        broll: fx.broll,
        music: fx.musicBed,
        hookTitle: fx.hookTitle,
        keywords: fx.keywordHighlights ? clip.keyPhrases || [] : null,
        pexelsKey: localStorage.getItem("snipcut_pexels_key") || undefined,
        pixabayKey: localStorage.getItem("snipcut_pixabay_key") || undefined,
        openaiKey: localStorage.getItem("snipcut_openai_key") || undefined,
      });

      const start = Number(trimStart.toFixed(2));
      const end = Number(trimEnd.toFixed(2));
      const updated = {
        ...clip,
        startTime: start,
        endTime: end,
        duration: Number(data.duration) || Number((end - start).toFixed(2)),
        keepRanges: Array.isArray(data.keepRanges) ? data.keepRanges : undefined,
        videoUrl: data.downloadUrl,
        renderedVideoUrl: data.downloadUrl,
        previewUrl: data.previewDownloadUrl || undefined,
        posterUrl: data.posterUrl || clip.posterUrl,
        fileSize: data.fileSize,
        previewFileSize: data.previewFileSize,
        hookHeadline: headline.trim() || clip.hookHeadline,
        captionStyle,
        aspectRatio,
        fx,
        // Edits persist: the source words keep their new text / deletions.
        sourceWords: words,
        // Clip-relative words (dashboard caption overlay before a render).
        transcript: words
          .filter((w) => !w.deleted && w.end > start && w.start < end)
          .map((w) => ({
            start: Number(Math.max(0, w.start - start).toFixed(2)),
            end: Number(Math.max(0.3, w.end - start).toFixed(2)),
            text: w.text,
          })),
      };

      try {
        const saved = localStorage.getItem("snipcut_user_clips");
        if (saved) {
          const arr = JSON.parse(saved);
          if (Array.isArray(arr)) {
            const next = arr.map((c: any) => (c.id === clip.id ? updated : c));
            localStorage.setItem("snipcut_user_clips", JSON.stringify(next));
            setAllClips(next);
          }
        }
      } catch {}

      try { localStorage.removeItem(draftKey(clip.id)); } catch {}
      applyClip(updated);
      setPreviewUrl(data.previewDownloadUrl || data.downloadUrl);
      setMasterUrl(data.downloadUrl);
      const cuts = [
        data.deletedRemoved ? `${data.deletedRemoved} deleted word${data.deletedRemoved === 1 ? "" : "s"} cut` : "",
        data.fillersRemoved ? `${data.fillersRemoved} filler${data.fillersRemoved === 1 ? "" : "s"} cut` : "",
        data.fxSummary || "",
      ].filter(Boolean);
      setRenderNote(
        `Re-rendered in ${Math.round((data.timingMs || 0) / 100) / 10}s — ${Number(data.duration || 0).toFixed(1)}s clip${cuts.length ? ` · ${cuts.join(" · ")}` : ""}${data.tracking?.summary ? ` — ${data.tracking.summary}` : ""}`
      );
      try {
        confetti({ particleCount: 70, spread: 65, origin: { y: 0.7 } });
      } catch {}
    } catch (err: any) {
      setRenderError(err.message || "Render failed");
    } finally {
      setIsRendering(false);
    }
  };

  const stageAspect =
    aspectRatio === "9:16" ? "aspect-[9/16] max-w-[340px]" : aspectRatio === "1:1" ? "aspect-square max-w-[440px]" : "aspect-video max-w-[560px]";

  if (loaded && !clip) {
    return (
      <div className="min-h-screen bg-[#F8F7F4] text-black font-sans flex flex-col">
        <header className="bg-white border-b-2 border-black px-4 py-3.5">
          <Link href="/dashboard" className="flex items-center gap-2 font-black uppercase text-sm">
            <ArrowLeft className="w-4 h-4 stroke-[3]" /> Back to Dashboard
          </Link>
        </header>
        <main className="flex-1 flex items-center justify-center p-6">
          <div className="bg-white border-2 border-black shadow-[6px_6px_0px_#000000] p-8 max-w-md text-center">
            <Scissors className="w-8 h-8 mx-auto mb-3" />
            <h1 className="font-black uppercase text-lg mb-2">No clips to edit yet</h1>
            <p className="text-sm font-medium text-neutral-600 mb-5">
              The editor works on clips you've generated. Run a video through the pipeline on the dashboard first — your clips will show up here automatically.
            </p>
            <Link href="/dashboard" className="inline-block px-4 py-2.5 bg-[#FFC700] border-2 border-black font-black text-xs uppercase shadow-[3px_3px_0px_#000000]">
              Go to Dashboard
            </Link>
          </div>
        </main>
      </div>
    );
  }

  if (!clip) {
    return (
      <div className="min-h-screen bg-[#F8F7F4] flex items-center justify-center font-black uppercase text-sm">
        Loading editor…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F7F4] text-black font-sans selection:bg-[#FFC700]">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white border-b-2 border-black px-4 sm:px-6 py-3 shadow-sm">
        <div className="max-w-[1500px] mx-auto flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/dashboard" className="flex items-center gap-1.5 font-black uppercase text-xs hover:text-[#FF5500]">
              <ArrowLeft className="w-4 h-4 stroke-[3]" /> Dashboard
            </Link>
            <span className="font-black uppercase text-sm sm:text-base truncate max-w-[300px]">{clip.title}</span>
            {typeof clip.viralityScore === "number" && (
              <span className="text-[10px] font-black uppercase bg-black text-[#FFC700] px-2 py-0.5 border border-black">
                Score {clip.viralityScore}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[10px] font-black uppercase hidden sm:block">Clip</label>
            <select
              value={clip.id}
              onChange={(e) => {
                const next = allClips.find((c: any) => c.id === e.target.value);
                if (next) applyClip(next);
              }}
              className="neo-input py-1.5 px-2 text-xs font-bold max-w-[220px]"
            >
              {allClips.map((c: any) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
            <a
              href={masterUrl}
              download
              className="px-3 py-1.5 text-xs font-black uppercase bg-white hover:bg-[#FFC700] border-2 border-black shadow-[2px_2px_0px_#000000] flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" /> Download
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-[1500px] mx-auto px-4 sm:px-6 py-5 grid grid-cols-1 lg:grid-cols-[300px_1fr_320px] gap-5 items-start">
        {/* Transcript panel */}
        <section className="bg-white border-2 border-black shadow-[4px_4px_0px_#000000] p-4 order-2 lg:order-1">
          <h2 className="font-black uppercase text-xs mb-1 flex items-center gap-2">
            <Type className="w-4 h-4" /> Transcript & Hooks
          </h2>
          <p className="text-[10px] font-bold text-neutral-500 mb-3 leading-snug">
            Click a word to jump the preview to it (shift-click to select a run of words). Set the trim start or end on it — you can reach up to 30s past the AI's cut — fix its text, or delete it: deleted words are cut from the video and the captions.
          </p>
          <div className="flex gap-2 mb-2">
            <button
              type="button"
              disabled={selLo === null}
              onClick={() => selLo !== null && setTrimStartAtWord(selLo)}
              className="flex-1 px-2 py-1.5 text-[10px] font-black uppercase border-2 border-black bg-[#FFC700] disabled:opacity-40 shadow-[2px_2px_0px_#000000]"
            >
              Set start here
            </button>
            <button
              type="button"
              disabled={selHi === null}
              onClick={() => selHi !== null && setTrimEndAtWord(selHi)}
              className="flex-1 px-2 py-1.5 text-[10px] font-black uppercase border-2 border-black bg-white disabled:opacity-40 shadow-[2px_2px_0px_#000000]"
            >
              Set end here
            </button>
          </div>
          <div className="flex gap-2 mb-2">
            <button
              type="button"
              disabled={selLo === null}
              onClick={toggleDeleteSelection}
              className="flex-1 px-2 py-1.5 text-[10px] font-black uppercase border-2 border-black bg-white disabled:opacity-40 shadow-[2px_2px_0px_#000000] flex items-center justify-center gap-1.5"
            >
              {selectionAllDeleted ? <RotateCcw className="w-3.5 h-3.5" /> : <Scissors className="w-3.5 h-3.5" />}
              {selectionAllDeleted
                ? `Restore${selection.length > 1 ? ` ${selection.length} words` : ""}`
                : `Delete${selection.length > 1 ? ` ${selection.length} words` : ""}`}
            </button>
          </div>
          {selLo !== null && selLo === selHi && (
            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") saveWordText();
                }}
                aria-label="Caption text for the selected word"
                className="flex-1 min-w-0 neo-input py-1.5 px-2 text-base sm:text-xs font-bold"
              />
              <button
                type="button"
                onClick={saveWordText}
                disabled={!editText.trim() || editText.trim() === words[selLo]?.text}
                className="px-2.5 py-1.5 text-[10px] font-black uppercase border-2 border-black bg-[#FFC700] disabled:opacity-40 shadow-[2px_2px_0px_#000000] flex items-center gap-1"
              >
                <Pencil className="w-3 h-3" /> Fix
              </button>
            </div>
          )}
          <div className="max-h-[430px] overflow-y-auto pr-1 leading-[1.9] text-[13px] font-medium">
            {words.length === 0 && (
              <span className="text-neutral-500 font-bold text-xs">This clip has no word timings stored.</span>
            )}
            {words.map((w, i) => {
              const inTrim = w.end > trimStart && w.start < trimEnd;
              const isActive = i === activeWordIdx;
              const isSelected = selLo !== null && selHi !== null && i >= selLo && i <= selHi;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={(e) => clickWord(i, e.shiftKey)}
                  title={w.deleted ? "Deleted — cut from the video" : undefined}
                  className={`px-0.5 mx-px border-b-2 transition-colors ${w.deleted ? "line-through decoration-2 " : ""}${
                    isSelected
                      ? "bg-black text-white border-black"
                      : isActive
                      ? "bg-[#FFC700] border-black font-black"
                      : w.deleted
                      ? "border-transparent text-red-500/70 hover:bg-neutral-100"
                      : inTrim
                      ? "border-transparent hover:bg-[#FFF3C4]"
                      : "border-transparent text-neutral-400 hover:bg-neutral-100"
                  }`}
                >
                  {w.text}
                </button>
              );
            })}
          </div>
        </section>

        {/* Stage */}
        <section className="order-1 lg:order-2">
          <div className={`mx-auto bg-black border-2 border-black shadow-[6px_6px_0px_#000000] ${stageAspect} w-full relative overflow-hidden`}>
            <video
              ref={videoRef}
              src={previewUrl}
              className="absolute inset-0 w-full h-full object-contain bg-black"
              playsInline
              muted={isMuted}
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={(e) => {
                const d = e.currentTarget.duration;
                if (isFinite(d) && d > 0) setDuration(d);
              }}
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
              onEnded={() => setIsPlaying(false)}
            />
          </div>

          {/* Transport */}
          <div className="mt-4 bg-white border-2 border-black shadow-[4px_4px_0px_#000000] p-3.5">
            <div className="flex items-center gap-2.5 sm:gap-3 flex-wrap sm:flex-nowrap">
              <button
                type="button"
                onClick={togglePlay}
                className="w-10 h-10 shrink-0 bg-[#FFC700] border-2 border-black flex items-center justify-center shadow-[2px_2px_0px_#000000] cursor-pointer"
                aria-label={isPlaying ? "Pause" : "Play"}
              >
                {isPlaying ? <Pause className="w-4.5 h-4.5" /> : <Play className="w-4.5 h-4.5 ml-0.5" />}
              </button>
              <span className="font-mono text-xs font-bold whitespace-nowrap">
                {fmt(currentTime)} / {fmt(duration)}
              </span>
              <input
                type="range"
                min={0}
                max={Math.max(0.1, duration)}
                step={0.05}
                value={Math.min(currentTime, duration)}
                onChange={(e) => seekTo(Number(e.target.value))}
                className="flex-1 accent-black order-5 basis-full sm:order-none sm:basis-auto"
              />
              <button
                type="button"
                onClick={() => setIsMuted((m) => !m)}
                className="p-1.5 border-2 border-black bg-white cursor-pointer"
                aria-label={isMuted ? "Unmute" : "Mute"}
              >
                {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
              <select
                value={playbackSpeed}
                onChange={(e) => setPlaybackSpeed(Number(e.target.value))}
                className="neo-input py-1 px-1.5 text-xs font-bold"
                aria-label="Playback speed"
              >
                {[0.5, 0.75, 1, 1.25, 1.5, 2].map((s) => (
                  <option key={s} value={s}>
                    {s}×
                  </option>
                ))}
              </select>
            </div>

            {/* Trim controls (source timestamps) */}
            <div className="mt-3.5 pt-3.5 border-t-2 border-black/15">
              <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
                <span className="text-[10px] font-black uppercase flex items-center gap-1.5">
                  <TrimIcon className="w-3.5 h-3.5" /> Trim — {fmt(trimStart)} → {fmt(trimEnd)} ({(trimEnd - trimStart).toFixed(1)}s
                  {Math.abs(plannedLength - (trimEnd - trimStart)) > 0.15 ? ` → ${plannedLength.toFixed(1)}s after cuts` : ""})
                </span>
                <label className="flex items-center gap-1.5 text-[10px] font-black uppercase cursor-pointer">
                  <input type="checkbox" checked={previewTrimOnly} onChange={(e) => setPreviewTrimOnly(e.target.checked)} className="accent-black" />
                  Preview trim only
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-bold uppercase text-neutral-500">Start</label>
                  <input
                    type="range"
                    min={winStart}
                    max={Math.max(winStart + 0.1, winEnd)}
                    step={0.1}
                    value={trimStart}
                    onChange={(e) => {
                      setTrimStart(Math.min(Number(e.target.value), trimEnd - 0.5));
                      setDirty(true);
                    }}
                    className="w-full accent-black"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase text-neutral-500">End</label>
                  <input
                    type="range"
                    min={winStart}
                    max={Math.max(winStart + 0.1, winEnd)}
                    step={0.1}
                    value={trimEnd}
                    onChange={(e) => {
                      setTrimEnd(Math.max(Number(e.target.value), trimStart + 0.5));
                      setDirty(true);
                    }}
                    className="w-full accent-black"
                  />
                </div>
              </div>
              <div className="flex items-center justify-between mt-1 gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={() => {
                    setTrimStart(clipStart);
                    setTrimEnd(clipEnd);
                  }}
                  className="text-[10px] font-black uppercase underline underline-offset-2"
                >
                  Reset trim
                </button>
                {(trimStart < renderedFrom - 0.05 || trimEnd > renderedTo + 0.05) && (
                  <span className="text-[10px] font-bold text-neutral-500">Extended parts appear after you re-render</span>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Settings panel */}
        <section className="bg-white border-2 border-black shadow-[4px_4px_0px_#000000] p-4 order-3">
          <h2 className="font-black uppercase text-xs mb-3 flex items-center gap-2">
            <Sliders className="w-4 h-4" /> Layout & Captions
          </h2>

          <label className="block text-[10px] font-black uppercase mb-1.5">Layout mode</label>
          <div className="grid grid-cols-2 gap-1.5 mb-4">
            {(
              [
                { id: "auto-tracker", label: "AI Track" },
                { id: "split-screen", label: "Split Screen" },
                { id: "blurred-fit", label: "Blur Fit" },
                { id: "center", label: "Center" },
              ] as { id: LayoutMode; label: string }[]
            ).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setLayoutMode(m.id)}
                className={`py-2 px-1 border-2 border-black text-[11px] font-black uppercase cursor-pointer ${
                  layoutMode === m.id ? "bg-black text-white shadow-[2px_2px_0px_#FFC700]" : "bg-[#F8F7F4] hover:bg-white"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>

          {layoutMode === "split-screen" && (
            <div className="mb-4 space-y-2.5">
              {[
                { label: "Split position", val: splitRatio, set: setSplitRatio, min: 20, max: 80, unit: "%" },
                { label: "Top speaker focus (left ↔ right)", val: topCropX, set: setTopCropX, min: 0, max: 100, unit: "%" },
                { label: "Bottom speaker focus (left ↔ right)", val: botCropX, set: setBotCropX, min: 0, max: 100, unit: "%" },
              ].map((s) => (
                <div key={s.label}>
                  <label className="text-[10px] font-bold uppercase text-neutral-500 flex justify-between">
                    <span>{s.label}</span>
                    <span>
                      {s.val}
                      {s.unit}
                    </span>
                  </label>
                  <input type="range" min={s.min} max={s.max} value={s.val} onChange={(e) => s.set(Number(e.target.value))} className="w-full accent-black" />
                </div>
              ))}
            </div>
          )}

          <label className="block text-[10px] font-black uppercase mb-1.5">Aspect ratio</label>
          <div className="grid grid-cols-3 gap-1.5 mb-4">
            {(["9:16", "1:1", "16:9"] as Aspect[]).map((a) => (
              <button
                key={a}
                type="button"
                onClick={() => setAspectRatio(a)}
                className={`py-1.5 border-2 border-black text-[11px] font-black cursor-pointer ${
                  aspectRatio === a ? "bg-black text-white shadow-[2px_2px_0px_#FFC700]" : "bg-[#F8F7F4] hover:bg-white"
                }`}
              >
                {a}
              </button>
            ))}
          </div>

          <label className="block text-[10px] font-black uppercase mb-1.5">Caption style</label>
          <div className="grid grid-cols-3 gap-1.5 mb-4">
            {(["snipcut", "kinetic", "hormozi", "neon", "beast", "clean"] as CaptionStyle[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setCaptionStyle(s)}
                className={`py-1.5 border-2 border-black text-[10px] font-black uppercase cursor-pointer ${
                  captionStyle === s ? "bg-black text-white shadow-[2px_2px_0px_#FFC700]" : "bg-[#F8F7F4] hover:bg-white"
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          <label className="block text-[10px] font-black uppercase mb-1.5">Headline (top text)</label>
          <input
            type="text"
            value={headline}
            onChange={(e) => setHeadline(e.target.value)}
            placeholder="Hook headline shown on the clip"
            className="w-full neo-input py-2 px-2.5 text-base sm:text-xs font-bold mb-4"
          />

          <label className="text-[10px] font-bold uppercase text-neutral-500 flex justify-between mb-1">
            <span>Caption height</span>
            <span>
              {captionPosY === null ? "Auto (style default)" : `${captionPosY}% from top`}
              {captionPosY !== null && (
                <button type="button" onClick={() => setCaptionPosY(null)} className="ml-1.5 underline underline-offset-2 font-black">
                  Auto
                </button>
              )}
            </span>
          </label>
          <input
            type="range"
            min={15}
            max={90}
            value={captionPosY ?? 75}
            onChange={(e) => setCaptionPosY(Number(e.target.value))}
            className="w-full accent-black mb-1"
          />
          <p className="text-[10px] font-bold text-neutral-500 mb-4 leading-snug">On split-screen parts captions always sit on the seam between the speakers.</p>

          <label className="block text-[10px] font-black uppercase mb-1.5">Effects</label>
          <div className="flex flex-col gap-1.5 mb-5">
            {(
              [
                { key: "removeSilences", label: "Remove silences & fillers" },
                { key: "hookTitle", label: "Hook title (headline card)" },
                { key: "keywordHighlights", label: "AI keyword highlights" },
                { key: "broll", label: "AI B-roll cutaways" },
                { key: "musicBed", label: "Music bed + punch-in zooms" },
              ] as { key: keyof ClipFx; label: string }[]
            ).map((o) => (
              <label key={o.key} className="flex items-center gap-2 text-[11px] font-black uppercase cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={fx[o.key]}
                  onChange={(e) => {
                    setFx((f) => ({ ...f, [o.key]: e.target.checked }));
                    setDirty(true);
                  }}
                  className="w-4 h-4 accent-black cursor-pointer"
                />
                {o.label}
              </label>
            ))}
          </div>

          {renderError && (
            <div className="mb-3 p-2.5 bg-[#FFE5E5] border-2 border-black text-[11px] font-bold flex gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
              <span>{renderError}</span>
            </div>
          )}
          {renderNote && (
            <div className="mb-3 p-2.5 bg-[#DCFCE7] border-2 border-black text-[11px] font-bold flex gap-2">
              <Check className="w-4 h-4 shrink-0 text-green-700" />
              <span>{renderNote}</span>
            </div>
          )}

          <button
            type="button"
            onClick={handleRender}
            disabled={isRendering}
            className="w-full py-3 bg-[#FFC700] hover:bg-black hover:text-white border-2 border-black font-black text-xs uppercase shadow-[3px_3px_0px_#000000] transition flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
          >
            <Wand2 className="w-4 h-4" />
            {isRendering ? "Rendering…" : dirty ? "Re-render with your edits" : "Re-render with these settings"}
          </button>
          <p className="text-[10px] font-bold text-neutral-500 mt-2.5 leading-snug">
            Re-rendering runs the same engine as the original clip on the source video (tracking, captions, effects) with your trim, word edits, layout and caption choices, then swaps the preview to the new file and updates the clip on your dashboard.
          </p>
        </section>
      </main>
    </div>
  );
}

export default function EditorPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#F8F7F4] flex items-center justify-center font-black uppercase text-sm">
          Loading editor…
        </div>
      }
    >
      <EditorContent />
    </Suspense>
  );
}
