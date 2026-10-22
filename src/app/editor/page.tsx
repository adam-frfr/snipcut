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
} from "lucide-react";
import confetti from "canvas-confetti";

/**
 * Studio Editor — fully wired to the real pipeline.
 *
 * - Loads the user's generated clips from localStorage ("opus_user_clips",
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
type CaptionStyle = "hormozi" | "neon" | "beast" | "clean";
type Aspect = "9:16" | "1:1" | "16:9";

interface EditorWord {
  start: number;
  end: number;
  text: string;
}

function fmt(t: number): string {
  if (!isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
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
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  // Trim (clip-relative seconds)
  const [trimStart, setTrimStart] = useState(0);
  const [trimEnd, setTrimEnd] = useState(0);
  const [previewTrimOnly, setPreviewTrimOnly] = useState(true);
  const [selectedWordIdx, setSelectedWordIdx] = useState<number | null>(null);

  // Render settings
  const [layoutMode, setLayoutMode] = useState<LayoutMode>("auto-tracker");
  const [aspectRatio, setAspectRatio] = useState<Aspect>("9:16");
  const [splitRatio, setSplitRatio] = useState(50);
  const [topCropX, setTopCropX] = useState(25);
  const [botCropX, setBotCropX] = useState(75);
  const [captionStyle, setCaptionStyle] = useState<CaptionStyle>("hormozi");
  const [headline, setHeadline] = useState("");
  const [captionPosY, setCaptionPosY] = useState(70);

  // Render state
  const [isRendering, setIsRendering] = useState(false);
  const [renderError, setRenderError] = useState("");
  const [renderNote, setRenderNote] = useState("");

  const getAuthHeaders = (): Record<string, string> => {
    if (typeof window === "undefined") return {};
    const t = localStorage.getItem("app_access_token");
    return t ? { "x-app-access-token": t } : {};
  };

  const words: EditorWord[] = Array.isArray(clip?.transcript) ? clip.transcript : [];

  const applyClip = useCallback((c: any) => {
    setClip(c);
    setPreviewUrl(c.renderedVideoUrl || c.videoUrl || "");
    setDuration(Number(c.duration) || 0);
    setTrimStart(0);
    setTrimEnd(Number(c.duration) || 0);
    setHeadline(c.hookHeadline || c.title || "");
    setCurrentTime(0);
    setSelectedWordIdx(null);
    setRenderError("");
    setRenderNote("");
  }, []);

  // Load the user's clips (dashboard writes them to opus_user_clips)
  useEffect(() => {
    let parsed: any[] = [];
    try {
      const saved = localStorage.getItem("opus_user_clips");
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

  const activeWordIdx = words.findIndex(
    (w, i) => currentTime >= w.start && (i === words.length - 1 || currentTime < words[i + 1].start)
  );

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
      if (previewTrimOnly && (currentTime < trimStart || currentTime >= trimEnd)) seekTo(trimStart);
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
    if (previewTrimOnly && trimEnd > trimStart && t >= trimEnd) {
      v.pause();
      v.currentTime = trimStart;
      setCurrentTime(trimStart);
    }
  };

  const setTrimStartAtWord = (idx: number) => {
    const w = words[idx];
    if (!w) return;
    const s = Math.min(w.start, trimEnd - 0.5);
    setTrimStart(Number(Math.max(0, s).toFixed(2)));
  };

  const setTrimEndAtWord = (idx: number) => {
    const w = words[idx];
    if (!w) return;
    const e = Math.max(w.end, trimStart + 0.5);
    setTrimEnd(Number(Math.min(duration || e, e).toFixed(2)));
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
    setIsRendering(true);
    setRenderError("");
    setRenderNote("");
    try {
      // renderVideoClip expects transcript times ABSOLUTE to the source video
      const absoluteWords = words.map((w) => ({
        start: Number((w.start + (clip.startTime || 0)).toFixed(2)),
        end: Number((w.end + (clip.startTime || 0)).toFixed(2)),
        text: w.text,
      }));

      const res = await fetch("/api/render-clip", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({
          inputPath: clip.videoFilePath,
          startTime: Number(((clip.startTime || 0) + trimStart).toFixed(2)),
          duration: Number((trimEnd - trimStart).toFixed(2)),
          aspectRatio,
          reframeMode: layoutMode,
          splitScreen: layoutMode === "split-screen",
          splitScreenOptions:
            layoutMode === "split-screen"
              ? { splitRatio: splitRatio / 100, topCropXPercent: topCropX, botCropXPercent: botCropX }
              : undefined,
          captionPositionY: captionPosY,
          transcript: absoluteWords,
          headline: headline.trim() || undefined,
          captionStyle,
        }),
      });

      if (res.status === 401) {
        throw new Error("Access token required — set your APP_ACCESS_TOKEN on the dashboard first (it appears as a prompt there), then come back.");
      }
      let data: any;
      try {
        data = await res.json();
      } catch {
        throw new Error("The render reply was cut off (connection dropped). Try the render again.");
      }
      if (!res.ok || data.error) throw new Error(data.error || "Render failed");

      // Rebase the stored clip to the newly rendered segment
      const newDuration = Number((trimEnd - trimStart).toFixed(2));
      const rebasedWords = words
        .filter((w) => w.end > trimStart && w.start < trimEnd)
        .map((w) => ({
          start: Number(Math.max(0, w.start - trimStart).toFixed(2)),
          end: Number(Math.max(0.3, w.end - trimStart).toFixed(2)),
          text: w.text,
        }));
      const updated = {
        ...clip,
        startTime: Number(((clip.startTime || 0) + trimStart).toFixed(2)),
        endTime: Number(((clip.startTime || 0) + trimEnd).toFixed(2)),
        duration: newDuration,
        videoUrl: data.downloadUrl,
        renderedVideoUrl: data.downloadUrl,
        transcript: rebasedWords,
      };

      try {
        const saved = localStorage.getItem("opus_user_clips");
        if (saved) {
          const arr = JSON.parse(saved);
          if (Array.isArray(arr)) {
            const next = arr.map((c: any) => (c.id === clip.id ? updated : c));
            localStorage.setItem("opus_user_clips", JSON.stringify(next));
            setAllClips(next);
          }
        }
      } catch {}

      applyClip(updated);
      setPreviewUrl(data.downloadUrl);
      setRenderNote(
        `Re-rendered in ${Math.round((data.timingMs || 0) / 100) / 10}s${data.tracking?.summary ? ` — ${data.tracking.summary}` : ""}`
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
              href={previewUrl}
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
            Click a word to jump the preview to it. Select a word, then set it as the trim start or end. Words outside the trim are dimmed and won't be in the re-render.
          </p>
          <div className="flex gap-2 mb-3">
            <button
              type="button"
              disabled={selectedWordIdx === null}
              onClick={() => selectedWordIdx !== null && setTrimStartAtWord(selectedWordIdx)}
              className="flex-1 px-2 py-1.5 text-[10px] font-black uppercase border-2 border-black bg-[#FFC700] disabled:opacity-40 shadow-[2px_2px_0px_#000000]"
            >
              Set start here
            </button>
            <button
              type="button"
              disabled={selectedWordIdx === null}
              onClick={() => selectedWordIdx !== null && setTrimEndAtWord(selectedWordIdx)}
              className="flex-1 px-2 py-1.5 text-[10px] font-black uppercase border-2 border-black bg-white disabled:opacity-40 shadow-[2px_2px_0px_#000000]"
            >
              Set end here
            </button>
          </div>
          <div className="max-h-[430px] overflow-y-auto pr-1 leading-[1.9] text-[13px] font-medium">
            {words.length === 0 && (
              <span className="text-neutral-500 font-bold text-xs">This clip has no word timings stored.</span>
            )}
            {words.map((w, i) => {
              const inTrim = w.end > trimStart && w.start < trimEnd;
              const isActive = i === activeWordIdx;
              const isSelected = i === selectedWordIdx;
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    setSelectedWordIdx(i);
                    seekTo(w.start + 0.01);
                  }}
                  className={`px-0.5 mx-px border-b-2 transition-colors ${
                    isActive
                      ? "bg-[#FFC700] border-black font-black"
                      : isSelected
                      ? "bg-black text-white border-black"
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
            <div className="flex items-center gap-3">
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
                className="flex-1 accent-black"
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

            {/* Trim controls */}
            <div className="mt-3.5 pt-3.5 border-t-2 border-black/15">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black uppercase flex items-center gap-1.5">
                  <TrimIcon className="w-3.5 h-3.5" /> Trim — {fmt(trimStart)} → {fmt(trimEnd)} ({(trimEnd - trimStart).toFixed(1)}s)
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
                    min={0}
                    max={Math.max(0.1, duration)}
                    step={0.1}
                    value={trimStart}
                    onChange={(e) => setTrimStart(Math.min(Number(e.target.value), trimEnd - 0.5))}
                    className="w-full accent-black"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold uppercase text-neutral-500">End</label>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(0.1, duration)}
                    step={0.1}
                    value={trimEnd}
                    onChange={(e) => setTrimEnd(Math.max(Number(e.target.value), trimStart + 0.5))}
                    className="w-full accent-black"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setTrimStart(0);
                  setTrimEnd(duration);
                }}
                className="mt-1 text-[10px] font-black uppercase underline underline-offset-2"
              >
                Reset trim
              </button>
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
          <div className="grid grid-cols-4 gap-1.5 mb-4">
            {(["hormozi", "neon", "beast", "clean"] as CaptionStyle[]).map((s) => (
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
            className="w-full neo-input py-2 px-2.5 text-xs font-bold mb-4"
          />

          <label className="text-[10px] font-bold uppercase text-neutral-500 flex justify-between mb-1">
            <span>Caption height</span>
            <span>{captionPosY}% from top</span>
          </label>
          <input type="range" min={15} max={90} value={captionPosY} onChange={(e) => setCaptionPosY(Number(e.target.value))} className="w-full accent-black mb-5" />

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
            {isRendering ? "Rendering…" : "Re-render with these settings"}
          </button>
          <p className="text-[10px] font-bold text-neutral-500 mt-2.5 leading-snug">
            Re-rendering runs the real engine on the source video (tracking + karaoke captions) with your trim, layout and caption choices, then swaps the preview to the new file and updates the clip on your dashboard.
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
