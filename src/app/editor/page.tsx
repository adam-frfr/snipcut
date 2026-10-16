"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Scissors,
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  Type,
  Layout,
  Layers,
  Sparkles,
  Download,
  Trash2,
  Check,
  Flame,
  ArrowLeft,
  Smile,
  Sliders,
  Maximize2,
  Video,
  Clock,
  Palette,
  ShieldAlert,
} from "lucide-react";
import { MOCK_CLIPS, CAPTION_PRESETS, GeneratedClip } from "@/lib/mockData";
import confetti from "canvas-confetti";

function EditorContent() {
  const searchParams = useSearchParams();
  const clipId = searchParams.get("clip") || searchParams.get("clipId") || "";

  // Editor State
  const [clip, setClip] = useState<any>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(30);

  // Styling state
  const [captionStyle, setCaptionStyle] = useState<"hormozi" | "neon" | "beast" | "clean">("hormozi");
  const [captionPosition, setCaptionPosition] = useState<"top" | "center" | "bottom">("bottom");
  const [fontSize, setFontSize] = useState<"sm" | "md" | "lg" | "xl">("lg");
  const [highlightColor, setHighlightColor] = useState("#22C55E"); // emerald
  const [showEmojis, setShowEmojis] = useState(true);
  const [isUppercase, setIsUppercase] = useState(true);

  // Layout state
  const [layoutMode, setLayoutMode] = useState<"single-focus" | "split-screen" | "blurred-fit">("single-focus");
  const [showBRoll, setShowBRoll] = useState(false);

  // Transcript state for text-based editing
  const [transcriptWords, setTranscriptWords] = useState<any[]>([]);

  // Load real clip on mount from localStorage
  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("opus_user_clips");
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const match = parsed.find((c: any) => c.id === clipId) || parsed[0];
            setClip(match);
            setDuration(match.duration || 30);
            if (match.transcript && match.transcript.length > 0) {
              setTranscriptWords(
                match.transcript.map((t: any, idx: number) => ({
                  id: idx + 1,
                  text: t.text,
                  time: t.start || idx * 1.5,
                  deleted: false,
                  emoji: t.emoji || "",
                }))
              );
            }
          }
        } catch (e) {}
      }
    }
  }, [clipId]);

  // Active word calculation
  const activeWord =
    transcriptWords.find(
      (w, idx) =>
        !w.deleted &&
        currentTime >= w.time &&
        (idx === transcriptWords.length - 1 || currentTime < transcriptWords[idx + 1].time)
    ) || transcriptWords[0];

  // Playback timer simulation
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isPlaying) {
      timer = setInterval(() => {
        setCurrentTime((prev) => {
          if (prev >= duration) {
            setIsPlaying(false);
            return 0;
          }
          return prev + 1;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isPlaying, duration]);

  // Export Modal state
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportResolution, setExportResolution] = useState("1080p");
  const [isExporting, setIsExporting] = useState(false);

  const handleExport = async () => {
    if (!clip?.videoFilePath) {
      alert("No source video file path found for rendering.");
      return;
    }

    setIsExporting(true);
    try {
      const res = await fetch("/api/render-clip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inputPath: clip.videoFilePath,
          startTime: clip.startTime || 0,
          duration: clip.duration || duration,
          aspectRatio: "9:16",
          reframeMode:
            layoutMode === "single-focus"
              ? "auto-tracker"
              : layoutMode === "split-screen"
              ? "split-screen"
              : layoutMode === "blurred-fit"
              ? "blurred-fit"
              : "auto-tracker",
          splitScreen: layoutMode === "split-screen",
          transcript: clip.transcript,
          headline: clip.hookHeadline || clip.title,
          captionStyle,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "FFmpeg render failed");
      }

      // Download the rendered file
      const a = document.createElement("a");
      a.href = data.downloadUrl;
      a.download = data.filename || `${clip.title}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      setShowExportModal(false);
      try {
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 },
        });
      } catch (e) {}
    } catch (err: any) {
      alert(`Render Error: ${err.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  const toggleDeleteWord = (id: number) => {
    setTranscriptWords((prev) =>
      prev.map((w) => (w.id === id ? { ...w, deleted: !w.deleted } : w))
    );
  };

  const removeAllFillers = () => {
    setTranscriptWords((prev) =>
      prev.map((w) => (w.isFiller ? { ...w, deleted: true } : w))
    );
    alert("Removed all detected verbal fillers and dead pauses!");
  };

  return (
    <div className="min-h-screen bg-[#F5EFEB] text-[#2B1D16] flex flex-col h-screen overflow-hidden">
      {/* Top Header */}
      <header className="h-14 bg-white border-b border-[#E8DDD2] px-4 flex items-center justify-between flex-shrink-0 z-30 shadow-sm">
        <div className="flex items-center gap-3.5">
          <Link
            href="/dashboard"
            className="p-1.5 rounded-full bg-[#FAF6F1] hover:bg-[#EAE1D7] text-[#2B1D16] border border-[#E8DDD2] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>

          <div className="flex items-center gap-2">
            <span className="font-extrabold text-sm tracking-tight text-[#2B1D16]">Opus Clip Studio</span>
            <span className="text-[10px] bg-[#EAE1D7] text-[#2B1D16] px-2 py-0.5 rounded-full font-bold">
              Editor 2.0
            </span>
          </div>

          <span className="text-[#DDD3C7]">|</span>

          <span className="text-xs font-bold text-[#7A695F] truncate max-w-xs">
            {clip.title}
          </span>
        </div>

        <div className="flex items-center gap-2.5">
          <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#FAF6F1] border border-[#E8DDD2] text-xs font-bold text-[#3A7D44]">
            <Flame className="w-3.5 h-3.5 fill-[#3A7D44]" />
            <span>Virality Score: {clip.viralityScore}/100</span>
          </div>

          <button
            onClick={() => setShowExportModal(true)}
            className="bg-[#C87A47] hover:bg-[#B66D3D] px-4 py-1.5 rounded-full font-bold text-xs text-white flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Clip (1080p)</span>
          </button>
        </div>
      </header>

      {/* Main 3-Column Editor Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Column 1: Subtitles & Layout Controls Panel */}
        <aside className="w-80 bg-white border-r border-[#E8DDD2] p-4 overflow-y-auto space-y-5 flex-shrink-0">
          {/* Subtitle Preset Selector */}
          <div>
            <label className="text-xs font-extrabold text-[#2B1D16] uppercase tracking-wider block mb-2.5 flex items-center gap-1.5">
              <Type className="w-3.5 h-3.5 text-[#C87A47]" />
              <span>Subtitle Style Presets</span>
            </label>
            <div className="grid grid-cols-2 gap-2">
              {CAPTION_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => {
                    setCaptionStyle(preset.id as any);
                    setHighlightColor(preset.highlightColor);
                    setIsUppercase(preset.uppercase);
                  }}
                  className={`p-2.5 rounded-2xl border text-left transition-all ${
                    captionStyle === preset.id
                      ? "bg-[#2B1D16] border-[#2B1D16] text-white shadow-sm"
                      : "bg-[#FAF6F1] border-[#E8DDD2] text-[#7A695F] hover:text-[#2B1D16]"
                  }`}
                >
                  <div className="text-xs font-bold flex items-center justify-between">
                    <span>{preset.name}</span>
                    {captionStyle === preset.id && <Check className="w-3 h-3 text-[#C87A47]" />}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Subtitle Position */}
          <div>
            <label className="text-xs font-extrabold text-[#2B1D16] uppercase tracking-wider block mb-2">
              Caption Position
            </label>
            <div className="grid grid-cols-3 gap-1 bg-[#EAE1D7] p-1 rounded-full border border-[#DDD3C7]">
              <button
                onClick={() => setCaptionPosition("top")}
                className={`py-1 text-xs font-bold rounded-full transition-all ${
                  captionPosition === "top" ? "bg-[#2B1D16] text-white shadow-sm" : "text-[#7A695F] hover:text-[#2B1D16]"
                }`}
              >
                Top
              </button>
              <button
                onClick={() => setCaptionPosition("center")}
                className={`py-1 text-xs font-bold rounded-full transition-all ${
                  captionPosition === "center" ? "bg-[#2B1D16] text-white shadow-sm" : "text-[#7A695F] hover:text-[#2B1D16]"
                }`}
              >
                Center
              </button>
              <button
                onClick={() => setCaptionPosition("bottom")}
                className={`py-1 text-xs font-bold rounded-full transition-all ${
                  captionPosition === "bottom" ? "bg-[#2B1D16] text-white shadow-sm" : "text-[#7A695F] hover:text-[#2B1D16]"
                }`}
              >
                Bottom
              </button>
            </div>
          </div>

          {/* Subtitle Typography Customizer */}
          <div className="space-y-3 bg-[#FAF6F1] p-3.5 rounded-2xl border border-[#E8DDD2]">
            {/* Highlight color picker */}
            <div>
              <label className="text-[11px] font-bold text-[#7A695F] block mb-1.5">
                Keyword Highlight Color
              </label>
              <div className="flex items-center gap-2">
                {["#3A7D44", "#C87A47", "#2B1D16", "#EAB308", "#EF4444", "#06B6D4"].map((hex) => (
                  <button
                    key={hex}
                    onClick={() => setHighlightColor(hex)}
                    style={{ backgroundColor: hex }}
                    className={`w-6 h-6 rounded-full transition-transform ${
                      highlightColor === hex ? "scale-125 ring-2 ring-[#2B1D16]" : "opacity-80"
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* Font Size */}
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs font-bold text-[#2B1D16]">Font Size</span>
              <div className="flex gap-1 bg-[#EAE1D7] p-0.5 rounded-full">
                {(["sm", "md", "lg", "xl"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setFontSize(s)}
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase transition-all ${
                      fontSize === s ? "bg-[#2B1D16] text-white shadow-sm" : "text-[#7A695F] hover:text-[#2B1D16]"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Auto Emojis toggle */}
            <div className="flex items-center justify-between pt-2 border-t border-[#E8DDD2]">
              <span className="text-xs font-bold text-[#2B1D16] flex items-center gap-1.5">
                <Smile className="w-3.5 h-3.5 text-[#C87A47]" />
                <span>Auto-Insert Emojis</span>
              </span>
              <button
                onClick={() => setShowEmojis(!showEmojis)}
                className={`w-9 h-5 rounded-full relative transition-colors ${
                  showEmojis ? "bg-[#C87A47]" : "bg-[#DDD3C7]"
                }`}
              >
                <div
                  className={`w-3.5 h-3.5 bg-white rounded-full absolute top-0.75 transition-all ${
                    showEmojis ? "right-1" : "left-1"
                  }`}
                />
              </button>
            </div>

            {/* All Caps toggle */}
            <div className="flex items-center justify-between pt-2 border-t border-[#E8DDD2]">
              <span className="text-xs font-bold text-[#2B1D16]">Uppercase All Text</span>
              <button
                onClick={() => setIsUppercase(!isUppercase)}
                className={`w-9 h-5 rounded-full relative transition-colors ${
                  isUppercase ? "bg-[#C87A47]" : "bg-[#DDD3C7]"
                }`}
              >
                <div
                  className={`w-3.5 h-3.5 bg-white rounded-full absolute top-0.75 transition-all ${
                    isUppercase ? "right-1" : "left-1"
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Camera & Speaker Layout Selector */}
          <div>
            <label className="text-xs font-extrabold text-[#2B1D16] uppercase tracking-wider block mb-2 flex items-center gap-1.5">
              <Layout className="w-3.5 h-3.5 text-[#C87A47]" />
              <span>Camera Reframe Mode</span>
            </label>
            <div className="space-y-2">
              <button
                onClick={() => setLayoutMode("split-screen")}
                className={`w-full p-2.5 rounded-2xl border text-left text-xs font-bold flex items-center justify-between transition-all ${
                  layoutMode === "split-screen"
                    ? "bg-[#2B1D16] border-[#2B1D16] text-white shadow-sm"
                    : "bg-[#FAF6F1] border-[#E8DDD2] text-[#7A695F] hover:text-[#2B1D16]"
                }`}
              >
                <span>Split Screen (Dual Speaker Stack)</span>
                {layoutMode === "split-screen" && <Check className="w-3.5 h-3.5 text-[#C87A47]" />}
              </button>

              <button
                onClick={() => setLayoutMode("single-focus")}
                className={`w-full p-2.5 rounded-2xl border text-left text-xs font-bold flex items-center justify-between transition-all ${
                  layoutMode === "single-focus"
                    ? "bg-[#2B1D16] border-[#2B1D16] text-white shadow-sm"
                    : "bg-[#FAF6F1] border-[#E8DDD2] text-[#7A695F] hover:text-[#2B1D16]"
                }`}
              >
                <span>Single Face Auto-Center</span>
                {layoutMode === "single-focus" && <Check className="w-3.5 h-3.5 text-[#C87A47]" />}
              </button>

              <button
                onClick={() => setLayoutMode("blurred-fit")}
                className={`w-full p-2.5 rounded-2xl border text-left text-xs font-bold flex items-center justify-between transition-all ${
                  layoutMode === "blurred-fit"
                    ? "bg-[#2B1D16] border-[#2B1D16] text-white shadow-sm"
                    : "bg-[#FAF6F1] border-[#E8DDD2] text-[#7A695F] hover:text-[#2B1D16]"
                }`}
              >
                <span>Fit 16:9 with Blurred Backdrop</span>
                {layoutMode === "blurred-fit" && <Check className="w-3.5 h-3.5 text-[#C87A47]" />}
              </button>
            </div>
          </div>

          {/* AI B-Roll Cutaway toggle */}
          <div className="flex items-center justify-between p-3.5 rounded-2xl bg-[#FAF6F1] border border-[#E8DDD2]">
            <div>
              <div className="text-xs font-bold text-[#2B1D16] flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-[#C87A47]" />
                <span>AI B-Roll Cutaway</span>
              </div>
              <div className="text-[10px] text-[#7A695F] mt-0.5">Neural cluster stock footage</div>
            </div>
            <button
              onClick={() => setShowBRoll(!showBRoll)}
              className={`w-9 h-5 rounded-full relative transition-colors ${
                showBRoll ? "bg-[#C87A47]" : "bg-[#DDD3C7]"
              }`}
            >
              <div
                className={`w-3.5 h-3.5 bg-white rounded-full absolute top-0.75 transition-all ${
                  showBRoll ? "right-1" : "left-1"
                }`}
              />
            </button>
          </div>
        </aside>

        {/* Column 2: Central 9:16 Video Player Viewport */}
        <div className="flex-1 bg-[#F5EFEB] flex flex-col items-center justify-between p-4 overflow-hidden">
          {/* Video Phone Frame Canvas */}
          <div className="relative flex-1 flex items-center justify-center w-full min-h-0">
            <div className="relative h-full max-h-[560px] aspect-[9/16] bg-[#1C130E] rounded-[28px] overflow-hidden shadow-xl border border-[#E8DDD2] flex flex-col">
              {/* Brand Watermark Overlay */}
              <div className="absolute top-3 right-3 z-30 px-2.5 py-0.5 rounded-full bg-[#2B1D16]/80 backdrop-blur-md text-[10px] text-white font-bold border border-white/20">
                OpusClip
              </div>

              {/* Video Content Layer according to layout */}
              <div className="relative flex-1 bg-[#1C130E] overflow-hidden flex flex-col">
                {layoutMode === "single-focus" ? (
                  <div className="relative w-full h-full flex items-center justify-center bg-[#1C130E] overflow-hidden">
                    {clip?.videoUrl ? (
                      <video
                        src={clip.videoUrl}
                        className="w-full h-full object-cover transition-all duration-700 ease-in-out"
                        style={{
                          objectPosition: currentTime < 1.5 ? "15% center" : "50% center",
                        }}
                        muted={isMuted}
                        loop
                        playsInline
                        ref={(el) => {
                          if (el) {
                            if (isPlaying) el.play().catch(() => {});
                            else el.pause();
                          }
                        }}
                      />
                    ) : (
                      <div className="text-xs text-[#A09085]">No video loaded</div>
                    )}
                  </div>
                ) : layoutMode === "split-screen" ? (
                  <div className="flex-1 flex flex-col h-full bg-[#1C130E]">
                    <div className="relative flex-1 overflow-hidden border-b border-white/20">
                      {clip?.videoUrl && (
                        <>
                          <video
                            src={clip.videoUrl}
                            className="w-full h-full object-cover"
                            style={{ objectPosition: "75% center" }}
                            muted
                            loop
                          />
                          <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-black/80 border border-white/10 text-[8px] font-bold text-amber-200">
                            TOP: MAIN CONTENT
                          </div>
                        </>
                      )}
                    </div>
                    <div className="relative flex-1 overflow-hidden">
                      {clip?.videoUrl && (
                        <>
                          <video
                            src={clip.videoUrl}
                            className="w-full h-full object-cover"
                            style={{ objectPosition: "15% center" }}
                            muted={isMuted}
                            loop
                          />
                          <div className="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-black/80 border border-white/10 text-[8px] font-bold text-[#C87A47]">
                            BOTTOM: REACTION CAM
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                ) : (
                  /* Blurred fit */
                  <div className="relative w-full h-full flex items-center justify-center bg-[#1C130E] overflow-hidden">
                    {clip?.videoUrl && (
                      <>
                        <video
                          src={clip.videoUrl}
                          className="absolute inset-0 w-full h-full object-cover blur-2xl opacity-60 scale-125"
                          muted
                          loop
                        />
                        <video
                          src={clip.videoUrl}
                          className="relative w-full aspect-video object-contain z-10 shadow-2xl"
                          muted={isMuted}
                          loop
                        />
                      </>
                    )}
                  </div>
                )}

                {/* AI B-Roll Overlay if active */}
                {showBRoll && currentTime >= 12 && currentTime <= 18 && (
                  <div className="absolute inset-x-2 top-8 h-36 rounded-2xl overflow-hidden border border-[#C87A47] shadow-xl z-20 animate-in fade-in zoom-in-95 duration-200">
                    <img
                      src="https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80"
                      alt="Neural Compute Cluster"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute top-1.5 left-2 px-2 py-0.5 rounded-full bg-[#2B1D16]/80 text-[8px] font-bold text-white">
                      B-ROLL: AI COMPUTE
                    </div>
                  </div>
                )}

                {/* Dynamic Captions Canvas Engine */}
                <div
                  className={`absolute inset-x-3 z-30 text-center pointer-events-none ${
                    captionPosition === "top"
                      ? "top-14"
                      : captionPosition === "center"
                      ? "top-1/2 -translate-y-1/2"
                      : "bottom-14"
                  }`}
                >
                  <div className="inline-block px-3.5 py-1.5 rounded-2xl bg-[#2B1D16]/80 backdrop-blur-sm shadow-lg">
                    <span
                      style={{
                        color: highlightColor,
                        textTransform: isUppercase ? "uppercase" : "none",
                      }}
                      className={`font-black ${
                        fontSize === "sm"
                          ? "text-lg"
                          : fontSize === "md"
                          ? "text-xl"
                          : fontSize === "lg"
                          ? "text-2xl"
                          : "text-3xl"
                      } ${
                        captionStyle === "hormozi"
                          ? "caption-hormozi"
                          : captionStyle === "neon"
                          ? "caption-neon"
                          : ""
                      }`}
                    >
                      {activeWord?.text || "Viral Moment"}{" "}
                      {showEmojis && activeWord?.emoji && <span>{activeWord.emoji}</span>}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Timeline & Player Bar */}
          <div className="w-full max-w-xl bg-white p-3.5 rounded-2xl border border-[#E8DDD2] shadow-sm mt-3">
            {/* Scrub bar */}
            <div className="relative w-full h-2 bg-[#EAE1D7] rounded-full overflow-hidden cursor-pointer mb-2">
              <div
                className="bg-[#C87A47] h-full rounded-full transition-all"
                style={{ width: `${(currentTime / duration) * 100}%` }}
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  className="p-2 rounded-xl bg-[#C87A47] hover:bg-[#B66D3D] text-white shadow-sm transition-colors cursor-pointer"
                >
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                </button>
                <button
                  onClick={() => setCurrentTime(0)}
                  className="p-2 rounded-xl bg-[#FAF6F1] hover:bg-[#EAE1D7] text-[#2B1D16] border border-[#E8DDD2] transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setIsMuted(!isMuted)}
                  className="p-2 rounded-xl bg-[#FAF6F1] hover:bg-[#EAE1D7] text-[#2B1D16] border border-[#E8DDD2] transition-colors cursor-pointer"
                >
                  {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                </button>
              </div>

              <div className="text-xs font-mono text-[#7A695F] font-bold">
                00:{currentTime < 10 ? `0${currentTime}` : currentTime} / 00:{duration}
              </div>
            </div>
          </div>
        </div>

        {/* Column 3: Text-Based Script & Transcript Trimmer */}
        <aside className="w-80 bg-white border-l border-[#E8DDD2] p-4 flex flex-col justify-between flex-shrink-0">
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-extrabold text-[#2B1D16] uppercase tracking-wider flex items-center gap-1.5">
                <Scissors className="w-3.5 h-3.5 text-[#C87A47]" />
                <span>Text-Based Editing</span>
              </label>
              <button
                onClick={removeAllFillers}
                className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-[#FAF6F1] text-[#C87A47] hover:bg-[#EAE1D7] border border-[#E8DDD2] transition-colors"
              >
                Auto-Cut Fillers
              </button>
            </div>

            <p className="text-[11px] text-[#7A695F] mb-3 leading-relaxed">
              Click any word to scrub to that second. Click the trash icon to cut that sentence from the video!
            </p>

            {/* Interactive Words Cloud */}
            <div className="bg-[#FAF6F1] p-3 rounded-2xl border border-[#E8DDD2] max-h-[380px] overflow-y-auto space-y-1.5">
              {transcriptWords.map((word) => {
                const isActive = activeWord?.id === word.id;
                return (
                  <div
                    key={word.id}
                    onClick={() => setCurrentTime(Math.floor(word.time))}
                    className={`p-2 rounded-xl text-xs flex items-center justify-between cursor-pointer transition-colors ${
                      isActive
                        ? "bg-[#2B1D16] text-white font-bold shadow-sm"
                        : word.deleted
                        ? "line-through text-[#A09085] bg-transparent"
                        : "text-[#2B1D16] hover:bg-white"
                    }`}
                  >
                    <span className="flex items-center gap-1">
                      <span>{word.text}</span>
                      {word.emoji && <span>{word.emoji}</span>}
                      {word.isFiller && (
                        <span className="text-[9px] bg-red-100 text-red-600 px-1 rounded-full font-bold">filler</span>
                      )}
                    </span>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleDeleteWord(word.id);
                      }}
                      className="p-1 rounded text-[#A09085] hover:text-red-500"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Virality Score Advice in Editor */}
          <div className="p-3.5 rounded-2xl border border-[#E8DDD2] bg-[#FAF6F1] mt-4">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold text-[#2B1D16] flex items-center gap-1">
                <Flame className="w-3.5 h-3.5 text-[#3A7D44] fill-[#3A7D44]" />
                <span>Hook Retention Status</span>
              </span>
              <span className="text-xs font-extrabold text-[#3A7D44]">EXCELLENT</span>
            </div>
            <p className="text-[11px] text-[#7A695F]">
              Trimming filler pauses has boosted predicted retention from 88% to 96%.
            </p>
          </div>
        </aside>
      </div>

      {/* Export Modal */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 bg-[#2B1D16]/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white max-w-md w-full p-7 rounded-[32px] border border-[#E8DDD2] shadow-2xl animate-in zoom-in-95 duration-200 text-[#2B1D16]">
            <h3 className="text-lg font-extrabold text-[#2B1D16] mb-1">Export Viral Short</h3>
            <p className="text-xs text-[#7A695F] mb-5">
              Render with hardcoded dynamic captions, active speaker reframe, and audio leveling.
            </p>

            <div className="space-y-3 mb-6">
              <div>
                <label className="text-xs font-bold text-[#2B1D16] block mb-1.5">
                  Resolution
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setExportResolution("1080p")}
                    className={`py-2 rounded-2xl text-xs font-bold border transition-all ${
                      exportResolution === "1080p"
                        ? "bg-[#2B1D16] border-[#2B1D16] text-white shadow-sm"
                        : "bg-[#FAF6F1] border-[#E8DDD2] text-[#7A695F]"
                    }`}
                  >
                    1080p Full HD
                  </button>
                  <button
                    onClick={() => setExportResolution("4K")}
                    className={`py-2 rounded-2xl text-xs font-bold border transition-all ${
                      exportResolution === "4K"
                        ? "bg-[#2B1D16] border-[#2B1D16] text-white shadow-sm"
                        : "bg-[#FAF6F1] border-[#E8DDD2] text-[#7A695F]"
                    }`}
                  >
                    4K Ultra HD
                  </button>
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-[#FAF6F1] border border-[#E8DDD2] text-xs text-[#2B1D16]">
                <div className="flex justify-between mb-1">
                  <span className="text-[#7A695F]">Frame Rate:</span>
                  <span className="font-bold text-[#2B1D16]">60 FPS</span>
                </div>
                <div className="flex justify-between mb-1">
                  <span className="text-[#7A695F]">Format:</span>
                  <span className="font-bold text-[#2B1D16]">MP4 (H.264 High Profile)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#7A695F]">Watermark:</span>
                  <span className="font-bold text-[#3A7D44]">None (Full Clean Render)</span>
                </div>
              </div>
            </div>

            <div className="flex gap-2.5">
              <button
                onClick={() => setShowExportModal(false)}
                className="flex-1 py-3 rounded-full border border-[#E8DDD2] bg-[#FAF6F1] text-[#2B1D16] text-xs font-bold hover:bg-[#EAE1D7] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleExport}
                disabled={isExporting}
                className="flex-1 bg-[#C87A47] hover:bg-[#B66D3D] py-3 rounded-full text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 shadow-md shadow-[#C87A47]/20 transition-all"
              >
                {isExporting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Rendering...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    <span>Start Download</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function EditorPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#F5EFEB] text-[#2B1D16] p-8 flex items-center justify-center font-bold">Loading Opus Studio Editor...</div>}>
      <EditorContent />
    </Suspense>
  );
}
