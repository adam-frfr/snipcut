"use client";

import React, { useState, useEffect, useRef, Suspense } from "react";
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
  Move,
  Crop,
  Sun,
  Eye,
  Zap,
  Music,
  FastForward,
  RotateCw,
  FlipHorizontal,
  Grid,
} from "lucide-react";
import { MOCK_CLIPS, CAPTION_PRESETS } from "@/lib/mockData";
import confetti from "canvas-confetti";

type SidebarTab = "transform" | "reframe" | "captions" | "audio" | "filters";

function EditorContent() {
  const searchParams = useSearchParams();
  const clipId = searchParams.get("clip") || searchParams.get("clipId") || "";

  // Active Sidebar Category
  const [activeTab, setActiveTab] = useState<SidebarTab>("transform");

  // Video & Playback State
  const [clip, setClip] = useState<any>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(30);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [volume, setVolume] = useState<number>(100);
  const [voiceEnhance, setVoiceEnhance] = useState(true);

  // 1. Transform / Canvas (CapCut Basic)
  const [aspectRatio, setAspectRatio] = useState<"9:16" | "1:1" | "16:9" | "4:5">("9:16");
  const [zoom, setZoom] = useState<number>(100); // 50 to 200%
  const [posX, setPosX] = useState<number>(0); // -200 to +200
  const [posY, setPosY] = useState<number>(0); // -200 to +200
  const [rotation, setRotation] = useState<number>(0); // -180 to 180
  const [flipH, setFlipH] = useState<boolean>(false);
  const [canvasBg, setCanvasBg] = useState<"black" | "blur" | "sand" | "white">("blur");

  // 2. Reframe & Tracking (CapCut Auto-Reframe)
  const [layoutMode, setLayoutMode] = useState<"single-focus" | "split-screen" | "blurred-fit" | "manual-pan">("single-focus");
  const [trackingSmoothness, setTrackingSmoothness] = useState<"smooth" | "dynamic" | "cut">("dynamic");
  const [safeZoneOverlay, setSafeZoneOverlay] = useState<boolean>(false);
  const [shotFraming, setShotFraming] = useState<"close" | "medium" | "wide">("medium");

  // 3. Captions & Typography (CapCut Text Style)
  const [captionStyle, setCaptionStyle] = useState<"hormozi" | "neon" | "beast" | "clean" | "vogue" | "karaoke">("hormozi");
  const [fontFamily, setFontFamily] = useState<string>("Plus Jakarta Sans");
  const [fontSize, setFontSize] = useState<"sm" | "md" | "lg" | "xl" | "2xl">("lg");
  const [highlightColor, setHighlightColor] = useState<string>("#C87A47");
  const [textColor, setTextColor] = useState<string>("#FFFFFF");
  const [strokeWidth, setStrokeWidth] = useState<number>(2);
  const [strokeColor, setStrokeColor] = useState<string>("#000000");
  const [bgBox, setBgBox] = useState<"none" | "pill" | "box">("pill");
  const [captionPositionY, setCaptionPositionY] = useState<number>(80); // % from top
  const [showEmojis, setShowEmojis] = useState(true);
  const [isUppercase, setIsUppercase] = useState(true);
  const [captionAnimation, setCaptionAnimation] = useState<"pop" | "bounce" | "fade">("pop");

  // 4. Color & Adjustments (CapCut Filter Grade)
  const [activeFilter, setActiveFilter] = useState<"none" | "viral" | "warm" | "moody" | "cold" | "vibrant">("none");
  const [brightness, setBrightness] = useState<number>(0); // -50 to +50
  const [contrast, setContrast] = useState<number>(0); // -50 to +50
  const [saturation, setSaturation] = useState<number>(0); // -50 to +50
  const [warmth, setWarmth] = useState<number>(0); // -50 to +50
  const [vignette, setVignette] = useState<number>(0); // 0 to 50

  // 5. Transcript & Timeline State
  const [transcriptWords, setTranscriptWords] = useState<any[]>([]);

  // Export Modal
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportResolution, setExportResolution] = useState("1080p");
  const [exportFps, setExportFps] = useState("60");
  const [isExporting, setIsExporting] = useState(false);

  // Video Ref
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoTopRef = useRef<HTMLVideoElement>(null);

  // Load clip on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("opus_user_clips");
      let foundClip: any = null;
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            foundClip = parsed.find((c: any) => c.id === clipId) || parsed[0];
          }
        } catch (e) {}
      }

      if (!foundClip) {
        foundClip = MOCK_CLIPS.find((c) => c.id === clipId) || MOCK_CLIPS[0];
      }

      setClip(foundClip);
      setDuration(foundClip.duration || 30);

      if (foundClip.transcript && foundClip.transcript.length > 0) {
        setTranscriptWords(
          foundClip.transcript.map((t: any, idx: number) => ({
            id: idx + 1,
            text: t.text,
            time: t.start || idx * 1.5,
            deleted: false,
            emoji: t.emoji || "",
          }))
        );
      } else {
        // Fallback default word blocks
        const defaultWords = [
          { id: 1, text: "In", time: 0, deleted: false },
          { id: 2, text: "the", time: 0.4, deleted: false },
          { id: 3, text: "next", time: 0.7, deleted: false },
          { id: 4, text: "decade,", time: 1.1, deleted: false },
          { id: 5, text: "AI", time: 1.8, deleted: false, emoji: "🤖" },
          { id: 6, text: "compute", time: 2.2, deleted: false },
          { id: 7, text: "will", time: 2.6, deleted: false },
          { id: 8, text: "scale", time: 3.0, deleted: false, emoji: "🚀" },
          { id: 9, text: "exponentially", time: 3.5, deleted: false },
          { id: 10, text: "faster", time: 4.2, deleted: false, emoji: "⚡" },
          { id: 11, text: "than", time: 4.8, deleted: false },
          { id: 12, text: "anyone", time: 5.2, deleted: false },
          { id: 13, text: "predicts.", time: 5.7, deleted: false, emoji: "🤯" },
        ];
        setTranscriptWords(defaultWords);
      }
    }
  }, [clipId]);

  // Synchronize playback speed
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = playbackSpeed;
    }
    if (videoTopRef.current) {
      videoTopRef.current.playbackRate = playbackSpeed;
    }
  }, [playbackSpeed]);

  // Synchronize volume
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = isMuted ? 0 : Math.min(1, volume / 100);
    }
  }, [volume, isMuted]);

  // Active word calculation
  const activeWord =
    transcriptWords.find(
      (w, idx) =>
        !w.deleted &&
        currentTime >= w.time &&
        (idx === transcriptWords.length - 1 || currentTime < transcriptWords[idx + 1].time)
    ) || transcriptWords[0];

  // Playback timer simulation / sync
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isPlaying) {
      timer = setInterval(() => {
        setCurrentTime((prev) => {
          if (prev >= duration) {
            setIsPlaying(false);
            if (videoRef.current) videoRef.current.currentTime = 0;
            return 0;
          }
          return prev + 0.25 * playbackSpeed;
        });
      }, 250);
    }
    return () => clearInterval(timer);
  }, [isPlaying, duration, playbackSpeed]);

  // Toggle Play
  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
        if (videoTopRef.current) videoTopRef.current.pause();
        setIsPlaying(false);
      } else {
        videoRef.current.play().catch(() => {});
        if (videoTopRef.current) videoTopRef.current.play().catch(() => {});
        setIsPlaying(true);
      }
    } else {
      setIsPlaying(!isPlaying);
    }
  };

  // Reset Adjustments
  const resetAllAdjustments = () => {
    setZoom(100);
    setPosX(0);
    setPosY(0);
    setRotation(0);
    setFlipH(false);
    setBrightness(0);
    setContrast(0);
    setSaturation(0);
    setWarmth(0);
    setVignette(0);
    setActiveFilter("none");
    setPlaybackSpeed(1.0);
    setVolume(100);
  };

  // Apply Filter Preset
  const handleFilterPreset = (preset: typeof activeFilter) => {
    setActiveFilter(preset);
    if (preset === "none") {
      setBrightness(0);
      setContrast(0);
      setSaturation(0);
      setWarmth(0);
    } else if (preset === "viral") {
      setBrightness(5);
      setContrast(20);
      setSaturation(25);
      setWarmth(5);
    } else if (preset === "warm") {
      setBrightness(0);
      setContrast(10);
      setSaturation(10);
      setWarmth(25);
    } else if (preset === "moody") {
      setBrightness(-10);
      setContrast(25);
      setSaturation(-15);
      setWarmth(-10);
    } else if (preset === "cold") {
      setBrightness(5);
      setContrast(15);
      setSaturation(10);
      setWarmth(-25);
    } else if (preset === "vibrant") {
      setBrightness(10);
      setContrast(20);
      setSaturation(35);
      setWarmth(0);
    }
  };

  // Word-level deletion (CapCut / Descript style text cutting)
  const toggleWordDelete = (id: number) => {
    setTranscriptWords((prev) =>
      prev.map((w) => (w.id === id ? { ...w, deleted: !w.deleted } : w))
    );
  };

  // Export render
  const handleExport = async () => {
    if (!clip?.videoFilePath) {
      // Simulate export if local mock
      setIsExporting(true);
      setTimeout(() => {
        setIsExporting(false);
        setShowExportModal(false);
        try {
          confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
        } catch (e) {}
        alert("Video rendered successfully with your CapCut manual transforms and dynamic captions!");
      }, 2000);
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
          aspectRatio,
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

      const a = document.createElement("a");
      a.href = data.downloadUrl;
      a.download = data.filename || `${clip.title}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      try {
        confetti({ particleCount: 90, spread: 80, origin: { y: 0.6 } });
      } catch (e) {}
      setShowExportModal(false);
    } catch (err: any) {
      alert(`Export failed: ${err.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m < 10 ? "0" : ""}${m}:${s < 10 ? "0" : ""}${s}`;
  };

  return (
    <div className="min-h-screen bg-[#F5EFEB] text-[#2B1D16] flex flex-col select-none font-sans">
      {/* Top Bar: CapCut Editor Header */}
      <header className="h-14 bg-[#FAF6F1]/95 backdrop-blur-md border-b border-[#E8DDD2] px-4 flex items-center justify-between z-40 sticky top-0 shadow-xs">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="p-2 rounded-xl bg-white border border-[#E8DDD2] text-[#2B1D16] hover:bg-[#EAE1D7] transition-colors"
            title="Back to Clips Dashboard"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex items-center gap-2">
            <span className="font-black text-sm tracking-tight text-[#2B1D16]">Opus Studio Pro</span>
            <span className="text-[10px] bg-[#EAE1D7] text-[#2B1D16] px-2.5 py-0.5 rounded-full font-bold">
              CapCut Manual Suite
            </span>
          </div>
          <div className="hidden sm:block h-4 w-px bg-[#DDD3C7]" />
          <input
            type="text"
            value={clip?.title || "Viral Clip #1"}
            onChange={(e) => setClip({ ...clip, title: e.target.value })}
            className="hidden sm:block text-xs font-bold text-[#2B1D16] bg-transparent hover:bg-white/60 focus:bg-white px-2 py-1 rounded-lg border border-transparent focus:border-[#E8DDD2] transition-all max-w-[240px] truncate"
            title="Click to rename clip"
          />
        </div>

        <div className="flex items-center gap-2.5">
          {clip && (
            <div className="hidden md:flex items-center gap-1.5 px-3 py-1 rounded-full bg-white border border-[#E8DDD2] text-xs font-bold text-[#3A7D44]">
              <Flame className="w-3.5 h-3.5 fill-[#3A7D44]" />
              <span>{clip.viralityScore || 98} Virality</span>
            </div>
          )}

          <button
            onClick={resetAllAdjustments}
            className="px-3 py-1.5 rounded-xl bg-white border border-[#E8DDD2] hover:bg-[#EAE1D7] text-[#7A6B63] hover:text-[#2B1D16] text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer"
            title="Reset all transforms, colors, and audio adjustments"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Reset All</span>
          </button>

          <button
            onClick={() => setShowExportModal(true)}
            className="warm-btn-terracotta px-4 py-1.5 rounded-xl text-xs font-bold text-white flex items-center gap-1.5 shadow-sm cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Clip</span>
          </button>
        </div>
      </header>

      {/* Main 3-Column Studio Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Column: CapCut Manual Controls Sidebar */}
        <aside className="w-80 sm:w-96 bg-white border-r border-[#E8DDD2] flex flex-col z-20 shadow-xs">
          {/* CapCut 5-Tab Category Selector */}
          <div className="grid grid-cols-5 p-2 bg-[#FAF6F1] border-b border-[#E8DDD2] text-[11px] font-bold">
            {[
              { id: "transform", label: "Basic", icon: Move },
              { id: "reframe", label: "Reframe", icon: Crop },
              { id: "captions", label: "Captions", icon: Type },
              { id: "audio", label: "Audio", icon: Music },
              { id: "filters", label: "Filters", icon: Sun },
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as SidebarTab)}
                  className={`flex flex-col items-center justify-center py-2 rounded-xl transition-all cursor-pointer ${
                    isActive
                      ? "bg-[#2B1D16] text-white shadow-sm"
                      : "text-[#7A6B63] hover:text-[#2B1D16] hover:bg-white"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 mb-1" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Tab Content Panels */}
          <div className="flex-1 overflow-y-auto p-5 space-y-6">
            {/* TAB 1: TRANSFORM & CANVAS */}
            {activeTab === "transform" && (
              <div className="space-y-5">
                <div>
                  <label className="text-xs font-black text-[#2B1D16] uppercase tracking-wider block mb-2">
                    Canvas Aspect Ratio
                  </label>
                  <div className="grid grid-cols-4 gap-1.5 bg-[#FAF6F1] p-1.5 rounded-2xl border border-[#E8DDD2]">
                    {[
                      { id: "9:16", label: "9:16", sub: "TikTok" },
                      { id: "1:1", label: "1:1", sub: "Square" },
                      { id: "16:9", label: "16:9", sub: "Wide" },
                      { id: "4:5", label: "4:5", sub: "Insta" },
                    ].map((ar) => (
                      <button
                        key={ar.id}
                        onClick={() => setAspectRatio(ar.id as any)}
                        className={`py-2 rounded-xl text-xs font-bold text-center transition-all cursor-pointer ${
                          aspectRatio === ar.id
                            ? "bg-[#2B1D16] text-white shadow-sm"
                            : "text-[#7A6B63] hover:text-[#2B1D16]"
                        }`}
                      >
                        <div className="font-black">{ar.label}</div>
                        <div className="text-[9px] opacity-70">{ar.sub}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Scale / Zoom */}
                <div className="bg-[#FAF6F1] p-4 rounded-2xl border border-[#E8DDD2] space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-[#2B1D16]">
                    <span>Scale / Zoom</span>
                    <span className="font-mono text-[#C87A47]">{zoom}%</span>
                  </div>
                  <input
                    type="range"
                    min="50"
                    max="200"
                    value={zoom}
                    onChange={(e) => setZoom(Number(e.target.value))}
                    className="w-full h-1.5 bg-[#EAE1D7] rounded-lg appearance-none cursor-pointer accent-[#C87A47]"
                  />
                  <div className="flex justify-between text-[10px] text-[#7A6B63]">
                    <span>50%</span>
                    <button onClick={() => setZoom(100)} className="hover:underline font-bold">
                      100% (Default)
                    </button>
                    <span>200%</span>
                  </div>
                </div>

                {/* Position X & Y */}
                <div className="bg-[#FAF6F1] p-4 rounded-2xl border border-[#E8DDD2] space-y-4">
                  <div>
                    <div className="flex items-center justify-between text-xs font-bold text-[#2B1D16] mb-1.5">
                      <span>Position X Offset</span>
                      <span className="font-mono text-[#C87A47]">{posX}px</span>
                    </div>
                    <input
                      type="range"
                      min="-200"
                      max="200"
                      value={posX}
                      onChange={(e) => setPosX(Number(e.target.value))}
                      className="w-full h-1.5 bg-[#EAE1D7] rounded-lg appearance-none cursor-pointer accent-[#C87A47]"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-xs font-bold text-[#2B1D16] mb-1.5">
                      <span>Position Y Offset</span>
                      <span className="font-mono text-[#C87A47]">{posY}px</span>
                    </div>
                    <input
                      type="range"
                      min="-200"
                      max="200"
                      value={posY}
                      onChange={(e) => setPosY(Number(e.target.value))}
                      className="w-full h-1.5 bg-[#EAE1D7] rounded-lg appearance-none cursor-pointer accent-[#C87A47]"
                    />
                  </div>
                </div>

                {/* Rotation & Flip */}
                <div className="bg-[#FAF6F1] p-4 rounded-2xl border border-[#E8DDD2] space-y-3">
                  <div className="flex items-center justify-between text-xs font-bold text-[#2B1D16]">
                    <span>Rotation Angle</span>
                    <span className="font-mono text-[#C87A47]">{rotation}°</span>
                  </div>
                  <input
                    type="range"
                    min="-180"
                    max="180"
                    value={rotation}
                    onChange={(e) => setRotation(Number(e.target.value))}
                    className="w-full h-1.5 bg-[#EAE1D7] rounded-lg appearance-none cursor-pointer accent-[#C87A47]"
                  />
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => setRotation((prev) => (prev + 90) % 360)}
                      className="flex-1 py-2 rounded-xl bg-white border border-[#E8DDD2] hover:bg-[#EAE1D7] text-xs font-bold text-[#2B1D16] flex items-center justify-center gap-1.5 transition cursor-pointer"
                    >
                      <RotateCw className="w-3.5 h-3.5" />
                      <span>Rotate 90°</span>
                    </button>
                    <button
                      onClick={() => setFlipH(!flipH)}
                      className={`flex-1 py-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer ${
                        flipH
                          ? "bg-[#2B1D16] border-[#2B1D16] text-white"
                          : "bg-white border-[#E8DDD2] text-[#2B1D16] hover:bg-[#EAE1D7]"
                      }`}
                    >
                      <FlipHorizontal className="w-3.5 h-3.5" />
                      <span>Mirror Flip</span>
                    </button>
                  </div>
                </div>

                {/* Canvas Background Fill */}
                <div>
                  <label className="text-xs font-black text-[#2B1D16] uppercase tracking-wider block mb-2">
                    Canvas Backdrop Fill
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { id: "blur", label: "Blur Mirror" },
                      { id: "black", label: "Black" },
                      { id: "sand", label: "Warm Sand" },
                      { id: "white", label: "White" },
                    ].map((bg) => (
                      <button
                        key={bg.id}
                        onClick={() => setCanvasBg(bg.id as any)}
                        className={`py-2 px-1 rounded-xl text-xs font-bold text-center border transition-all cursor-pointer ${
                          canvasBg === bg.id
                            ? "bg-[#2B1D16] border-[#2B1D16] text-white shadow-sm"
                            : "bg-[#FAF6F1] border-[#E8DDD2] text-[#7A6B63] hover:text-[#2B1D16]"
                        }`}
                      >
                        {bg.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: REFRAME & TRACKING */}
            {activeTab === "reframe" && (
              <div className="space-y-5">
                <div>
                  <label className="text-xs font-black text-[#2B1D16] uppercase tracking-wider block mb-2">
                    AI Tracking & Reframe Layout
                  </label>
                  <div className="space-y-2">
                    {[
                      { id: "single-focus", title: "AI Dynamic Pan Tracker", desc: "Smooth camera motion follows speaker" },
                      { id: "split-screen", title: "Dual Speaker Stack", desc: "Top: Content • Bottom: Reaction Face" },
                      { id: "blurred-fit", title: "Blurred Background Fit", desc: "Padded 16:9 canvas with blurred mirror" },
                      { id: "manual-pan", title: "Manual Pan & Center", desc: "Fixed center framing" },
                    ].map((mode) => (
                      <button
                        key={mode.id}
                        onClick={() => setLayoutMode(mode.id as any)}
                        className={`w-full p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                          layoutMode === mode.id
                            ? "bg-[#2B1D16] border-[#2B1D16] text-white shadow-sm"
                            : "bg-[#FAF6F1] border-[#E8DDD2] text-[#7A6B63] hover:text-[#2B1D16]"
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs font-bold mb-0.5">
                          <span>{mode.title}</span>
                          {layoutMode === mode.id && <Check className="w-3.5 h-3.5 text-[#C87A47]" />}
                        </div>
                        <div className={`text-[10px] ${layoutMode === mode.id ? "text-[#DDD3C7]" : "text-[#7A6B63]"}`}>
                          {mode.desc}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Camera Smoothing */}
                <div className="bg-[#FAF6F1] p-4 rounded-2xl border border-[#E8DDD2] space-y-2">
                  <label className="text-xs font-bold text-[#2B1D16] block">
                    Camera Motion Smoothing
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { id: "smooth", label: "Cinematic" },
                      { id: "dynamic", label: "Natural" },
                      { id: "cut", label: "Snap Cut" },
                    ].map((s) => (
                      <button
                        key={s.id}
                        onClick={() => setTrackingSmoothness(s.id as any)}
                        className={`py-1.5 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                          trackingSmoothness === s.id
                            ? "bg-[#2B1D16] border-[#2B1D16] text-white shadow-sm"
                            : "bg-white border-[#E8DDD2] text-[#7A6B63]"
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Safe Zone Overlay */}
                <div className="flex items-center justify-between p-4 rounded-2xl bg-[#FAF6F1] border border-[#E8DDD2]">
                  <div>
                    <div className="text-xs font-bold text-[#2B1D16] flex items-center gap-1.5">
                      <Grid className="w-3.5 h-3.5 text-[#C87A47]" />
                      <span>TikTok/Reels Safe Zone Guides</span>
                    </div>
                    <div className="text-[10px] text-[#7A6B63]">
                      Show interface button margins & caption danger zones
                    </div>
                  </div>
                  <button
                    onClick={() => setSafeZoneOverlay(!safeZoneOverlay)}
                    className={`w-10 h-6 rounded-full relative transition-colors cursor-pointer ${
                      safeZoneOverlay ? "bg-[#C87A47]" : "bg-[#DDD3C7]"
                    }`}
                  >
                    <div
                      className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all ${
                        safeZoneOverlay ? "right-1" : "left-1"
                      }`}
                    />
                  </button>
                </div>
              </div>
            )}

            {/* TAB 3: CAPTIONS & TYPOGRAPHY */}
            {activeTab === "captions" && (
              <div className="space-y-5">
                <div>
                  <label className="text-xs font-black text-[#2B1D16] uppercase tracking-wider block mb-2">
                    Subtitle Preset Style
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: "hormozi", name: "Hormozi Pop", font: "Bold Display" },
                      { id: "beast", name: "MrBeast Viral", font: "High Energy" },
                      { id: "neon", name: "Cyber Neon", font: "Vibrant Outline" },
                      { id: "clean", name: "Clean Minimal", font: "Modern Sans" },
                      { id: "vogue", name: "Editorial", font: "Serif Luxury" },
                      { id: "karaoke", name: "Word Pulse", font: "Bouncing Fill" },
                    ].map((p) => (
                      <button
                        key={p.id}
                        onClick={() => setCaptionStyle(p.id as any)}
                        className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                          captionStyle === p.id
                            ? "bg-[#2B1D16] border-[#2B1D16] text-white shadow-sm"
                            : "bg-[#FAF6F1] border-[#E8DDD2] text-[#7A6B63] hover:text-[#2B1D16]"
                        }`}
                      >
                        <div className="text-xs font-bold flex items-center justify-between mb-0.5">
                          <span>{p.name}</span>
                          {captionStyle === p.id && <Check className="w-3 h-3 text-[#C87A47]" />}
                        </div>
                        <div className={`text-[9px] ${captionStyle === p.id ? "text-[#DDD3C7]" : "text-[#7A6B63]"}`}>
                          {p.font}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Font Family Selector */}
                <div>
                  <label className="text-xs font-black text-[#2B1D16] uppercase tracking-wider block mb-2">
                    Font Family
                  </label>
                  <select
                    value={fontFamily}
                    onChange={(e) => setFontFamily(e.target.value)}
                    className="w-full bg-[#FAF6F1] border border-[#E8DDD2] rounded-2xl px-3.5 py-2.5 text-xs font-bold text-[#2B1D16] focus:outline-none focus:border-[#C87A47]"
                  >
                    <option value="Plus Jakarta Sans">Plus Jakarta Sans (Modern Editorial)</option>
                    <option value="Impact">Impact (Classic Bold Shorts)</option>
                    <option value="Montserrat">Montserrat (Clean Tech)</option>
                    <option value="Anton">Anton (Heavy Contrast)</option>
                    <option value="Outfit">Outfit (Rounded Premium)</option>
                  </select>
                </div>

                {/* Colors & Stroke */}
                <div className="bg-[#FAF6F1] p-4 rounded-2xl border border-[#E8DDD2] space-y-4">
                  <div>
                    <label className="text-xs font-bold text-[#2B1D16] block mb-2">
                      Active Keyword Highlight Color
                    </label>
                    <div className="flex items-center gap-2">
                      {["#C87A47", "#3A7D44", "#EAB308", "#EF4444", "#06B6D4", "#FFFFFF"].map((hex) => (
                        <button
                          key={hex}
                          onClick={() => setHighlightColor(hex)}
                          style={{ backgroundColor: hex }}
                          className={`w-7 h-7 rounded-full border border-black/10 transition-transform cursor-pointer ${
                            highlightColor === hex ? "scale-125 ring-2 ring-[#2B1D16]" : "opacity-80"
                          }`}
                        />
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs font-bold text-[#2B1D16] mb-1.5">
                      <span>Stroke / Outline Width</span>
                      <span className="font-mono text-[#C87A47]">{strokeWidth}px</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="6"
                      value={strokeWidth}
                      onChange={(e) => setStrokeWidth(Number(e.target.value))}
                      className="w-full h-1.5 bg-[#EAE1D7] rounded-lg appearance-none cursor-pointer accent-[#C87A47]"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-xs font-bold text-[#2B1D16] mb-1.5">
                      <span>Vertical Y Position</span>
                      <span className="font-mono text-[#C87A47]">{captionPositionY}%</span>
                    </div>
                    <input
                      type="range"
                      min="20"
                      max="90"
                      value={captionPositionY}
                      onChange={(e) => setCaptionPositionY(Number(e.target.value))}
                      className="w-full h-1.5 bg-[#EAE1D7] rounded-lg appearance-none cursor-pointer accent-[#C87A47]"
                    />
                  </div>
                </div>

                {/* Toggles */}
                <div className="space-y-3 bg-[#FAF6F1] p-4 rounded-2xl border border-[#E8DDD2]">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#2B1D16] flex items-center gap-1.5">
                      <Smile className="w-3.5 h-3.5 text-[#C87A47]" />
                      <span>Auto Emojis In Subtitles</span>
                    </span>
                    <button
                      onClick={() => setShowEmojis(!showEmojis)}
                      className={`w-9 h-5 rounded-full relative transition-colors cursor-pointer ${
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

                  <div className="flex items-center justify-between pt-2 border-t border-[#E8DDD2]">
                    <span className="text-xs font-bold text-[#2B1D16]">UPPERCASE All Words</span>
                    <button
                      onClick={() => setIsUppercase(!isUppercase)}
                      className={`w-9 h-5 rounded-full relative transition-colors cursor-pointer ${
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
              </div>
            )}

            {/* TAB 4: AUDIO & SPEED */}
            {activeTab === "audio" && (
              <div className="space-y-5">
                <div>
                  <label className="text-xs font-black text-[#2B1D16] uppercase tracking-wider block mb-2">
                    Playback & Clip Speed
                  </label>
                  <div className="grid grid-cols-6 gap-1 bg-[#FAF6F1] p-1.5 rounded-2xl border border-[#E8DDD2]">
                    {[0.5, 0.75, 1.0, 1.25, 1.5, 2.0].map((s) => (
                      <button
                        key={s}
                        onClick={() => setPlaybackSpeed(s)}
                        className={`py-2 rounded-xl text-xs font-bold text-center transition-all cursor-pointer ${
                          playbackSpeed === s
                            ? "bg-[#2B1D16] text-white shadow-sm"
                            : "text-[#7A6B63] hover:text-[#2B1D16]"
                        }`}
                      >
                        {s}x
                      </button>
                    ))}
                  </div>
                </div>

                {/* Volume Slider */}
                <div className="bg-[#FAF6F1] p-4 rounded-2xl border border-[#E8DDD2] space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-[#2B1D16]">
                    <span className="flex items-center gap-1.5">
                      <Volume2 className="w-3.5 h-3.5 text-[#C87A47]" />
                      <span>Volume Level</span>
                    </span>
                    <span className="font-mono text-[#C87A47]">{volume}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="200"
                    value={volume}
                    onChange={(e) => setVolume(Number(e.target.value))}
                    className="w-full h-1.5 bg-[#EAE1D7] rounded-lg appearance-none cursor-pointer accent-[#C87A47]"
                  />
                  <div className="flex justify-between text-[10px] text-[#7A6B63]">
                    <span>0% (Mute)</span>
                    <span>100% (Normal)</span>
                    <span>200% (Boost)</span>
                  </div>
                </div>

                {/* Voice Enhance & Denoise */}
                <div className="flex items-center justify-between p-4 rounded-2xl bg-[#FAF6F1] border border-[#E8DDD2]">
                  <div>
                    <div className="text-xs font-bold text-[#2B1D16] flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-[#C87A47]" />
                      <span>AI Voice Enhance & Denoise</span>
                    </div>
                    <div className="text-[10px] text-[#7A6B63]">
                      Attenuates room echoes & background hiss
                    </div>
                  </div>
                  <button
                    onClick={() => setVoiceEnhance(!voiceEnhance)}
                    className={`w-10 h-6 rounded-full relative transition-colors cursor-pointer ${
                      voiceEnhance ? "bg-[#C87A47]" : "bg-[#DDD3C7]"
                    }`}
                  >
                    <div
                      className={`w-4 h-4 bg-white rounded-full absolute top-1 transition-all ${
                        voiceEnhance ? "right-1" : "left-1"
                      }`}
                    />
                  </button>
                </div>
              </div>
            )}

            {/* TAB 5: COLOR & FILTERS */}
            {activeTab === "filters" && (
              <div className="space-y-5">
                <div>
                  <label className="text-xs font-black text-[#2B1D16] uppercase tracking-wider block mb-2">
                    Color Filter Presets
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: "none", label: "Original" },
                      { id: "viral", label: "Viral Punch" },
                      { id: "warm", label: "Warm Film" },
                      { id: "moody", label: "Moody Dark" },
                      { id: "cold", label: "Cold Tech" },
                      { id: "vibrant", label: "Golden Hour" },
                    ].map((f) => (
                      <button
                        key={f.id}
                        onClick={() => handleFilterPreset(f.id as any)}
                        className={`py-2 px-2 rounded-xl text-xs font-bold border transition-all cursor-pointer ${
                          activeFilter === f.id
                            ? "bg-[#2B1D16] border-[#2B1D16] text-white shadow-sm"
                            : "bg-[#FAF6F1] border-[#E8DDD2] text-[#7A6B63] hover:text-[#2B1D16]"
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Granular Sliders */}
                <div className="bg-[#FAF6F1] p-4 rounded-2xl border border-[#E8DDD2] space-y-4">
                  <div>
                    <div className="flex justify-between text-xs font-bold text-[#2B1D16] mb-1">
                      <span>Brightness</span>
                      <span className="font-mono text-[#C87A47]">{brightness > 0 ? `+${brightness}` : brightness}</span>
                    </div>
                    <input
                      type="range"
                      min="-50"
                      max="50"
                      value={brightness}
                      onChange={(e) => setBrightness(Number(e.target.value))}
                      className="w-full h-1.5 bg-[#EAE1D7] rounded-lg appearance-none cursor-pointer accent-[#C87A47]"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-xs font-bold text-[#2B1D16] mb-1">
                      <span>Contrast</span>
                      <span className="font-mono text-[#C87A47]">{contrast > 0 ? `+${contrast}` : contrast}</span>
                    </div>
                    <input
                      type="range"
                      min="-50"
                      max="50"
                      value={contrast}
                      onChange={(e) => setContrast(Number(e.target.value))}
                      className="w-full h-1.5 bg-[#EAE1D7] rounded-lg appearance-none cursor-pointer accent-[#C87A47]"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-xs font-bold text-[#2B1D16] mb-1">
                      <span>Saturation</span>
                      <span className="font-mono text-[#C87A47]">{saturation > 0 ? `+${saturation}` : saturation}</span>
                    </div>
                    <input
                      type="range"
                      min="-50"
                      max="50"
                      value={saturation}
                      onChange={(e) => setSaturation(Number(e.target.value))}
                      className="w-full h-1.5 bg-[#EAE1D7] rounded-lg appearance-none cursor-pointer accent-[#C87A47]"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-xs font-bold text-[#2B1D16] mb-1">
                      <span>Color Warmth / Temp</span>
                      <span className="font-mono text-[#C87A47]">{warmth > 0 ? `+${warmth}` : warmth}</span>
                    </div>
                    <input
                      type="range"
                      min="-50"
                      max="50"
                      value={warmth}
                      onChange={(e) => setWarmth(Number(e.target.value))}
                      className="w-full h-1.5 bg-[#EAE1D7] rounded-lg appearance-none cursor-pointer accent-[#C87A47]"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* Center Column: Live Viewport & Multitrack Timeline */}
        <main className="flex-1 flex flex-col bg-[#EAE1D7]/50 relative overflow-hidden">
          {/* Viewport Container */}
          <div className="flex-1 flex items-center justify-center p-6 relative overflow-hidden">
            {/* Aspect Ratio Canvas Container */}
            <div
              className={`relative rounded-[28px] overflow-hidden shadow-2xl border-2 border-[#DDD3C7] transition-all flex flex-col items-center justify-center ${
                aspectRatio === "9:16"
                  ? "w-[270px] sm:w-[290px] h-[490px] sm:h-[520px]"
                  : aspectRatio === "1:1"
                  ? "w-[360px] sm:w-[420px] h-[360px] sm:h-[420px]"
                  : aspectRatio === "16:9"
                  ? "w-[480px] sm:w-[560px] h-[270px] sm:h-[315px]"
                  : "w-[320px] sm:w-[360px] h-[400px] sm:h-[450px]"
              } ${
                canvasBg === "black"
                  ? "bg-black"
                  : canvasBg === "sand"
                  ? "bg-[#F5EFEB]"
                  : canvasBg === "white"
                  ? "bg-white"
                  : "bg-black"
              }`}
            >
              {/* Blurred Backdrop if selected */}
              {canvasBg === "blur" && clip?.videoUrl && (
                <video
                  src={clip.renderedVideoUrl || clip.videoUrl}
                  className="absolute inset-0 w-full h-full object-cover blur-2xl scale-125 opacity-60 pointer-events-none"
                  muted
                  playsInline
                />
              )}

              {/* Video Element with live CSS Transforms & Filters */}
              <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
                <video
                  ref={videoRef}
                  src={clip?.renderedVideoUrl || clip?.videoUrl || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=600&auto=format&fit=crop&q=80"}
                  className="w-full h-full object-cover transition-transform duration-100 ease-out"
                  style={{
                    transform: `scale(${zoom / 100}) translate(${posX}px, ${posY}px) rotate(${rotation}deg) scaleX(${flipH ? -1 : 1})`,
                    filter: `brightness(${100 + brightness}%) contrast(${100 + contrast}%) saturate(${100 + saturation}%) sepia(${warmth > 0 ? warmth : 0}%) hue-rotate(${warmth < 0 ? warmth * 2 : 0}deg)`,
                  }}
                  muted={isMuted}
                  playsInline
                />

                {/* TikTok / Reels Safe Zone Overlay */}
                {safeZoneOverlay && (
                  <div className="absolute inset-0 pointer-events-none z-30 flex flex-col justify-between p-4 border-2 border-dashed border-amber-400/60 bg-black/10">
                    <div className="text-[10px] font-bold text-amber-300 bg-black/60 px-2 py-0.5 rounded-full self-start">
                      Safe Zone Active (UI Overlay)
                    </div>
                    {/* Simulated Right Icons (Like, Comment, Share) */}
                    <div className="self-end space-y-3 mr-1 mb-8 opacity-75">
                      <div className="w-8 h-8 rounded-full bg-white/30 backdrop-blur-md flex items-center justify-center text-[10px]">❤️</div>
                      <div className="w-8 h-8 rounded-full bg-white/30 backdrop-blur-md flex items-center justify-center text-[10px]">💬</div>
                      <div className="w-8 h-8 rounded-full bg-white/30 backdrop-blur-md flex items-center justify-center text-[10px]">↗️</div>
                    </div>
                    <div className="text-[9px] font-bold text-amber-300 bg-black/60 px-2 py-0.5 rounded-full self-center">
                      Caption Danger Zone (Avoid bottom 15%)
                    </div>
                  </div>
                )}

                {/* Live Dynamic Captions Overlay */}
                {activeWord && (
                  <div
                    className="absolute left-0 right-0 z-20 px-4 text-center pointer-events-none transition-all"
                    style={{ top: `${captionPositionY}%` }}
                  >
                    <div
                      className={`inline-block px-3.5 py-1.5 rounded-2xl ${
                        bgBox === "pill"
                          ? "bg-black/75 backdrop-blur-sm"
                          : bgBox === "box"
                          ? "bg-black/90"
                          : ""
                      }`}
                    >
                      <span
                        className="font-black tracking-tight"
                        style={{
                          fontFamily: fontFamily,
                          fontSize:
                            fontSize === "sm"
                              ? "14px"
                              : fontSize === "md"
                              ? "18px"
                              : fontSize === "lg"
                              ? "22px"
                              : fontSize === "xl"
                              ? "26px"
                              : "30px",
                          color: highlightColor,
                          WebkitTextStroke: `${strokeWidth}px ${strokeColor}`,
                          textTransform: isUppercase ? "uppercase" : "none",
                        }}
                      >
                        {activeWord.text}{" "}
                        {showEmojis && activeWord.emoji ? activeWord.emoji : ""}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Bottom Multitrack Timeline & Scrub Bar */}
          <div className="h-44 bg-white border-t border-[#E8DDD2] flex flex-col p-4 shadow-sm z-30">
            {/* Playback Controls Bar */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <button
                  onClick={togglePlay}
                  className="w-9 h-9 rounded-full bg-[#2B1D16] hover:bg-[#3D2C24] text-white flex items-center justify-center transition-transform active:scale-95 cursor-pointer shadow-sm"
                >
                  {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                </button>

                <button
                  onClick={() => {
                    setCurrentTime(0);
                    if (videoRef.current) videoRef.current.currentTime = 0;
                  }}
                  className="p-2 rounded-xl hover:bg-[#FAF6F1] text-[#7A6B63] hover:text-[#2B1D16] transition-colors cursor-pointer"
                  title="Rewind to start"
                >
                  <RotateCcw className="w-4 h-4" />
                </button>

                <div className="font-mono text-xs font-bold text-[#2B1D16]">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-[#7A6B63] uppercase">Speed: {playbackSpeed}x</span>
                <span className="text-[10px] font-bold text-[#7A6B63] uppercase">•</span>
                <span className="text-[10px] font-bold text-[#3A7D44]">Vol: {volume}%</span>
              </div>
            </div>

            {/* Master Scrub Bar */}
            <div className="relative mb-3">
              <input
                type="range"
                min="0"
                max={duration}
                step="0.1"
                value={currentTime}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setCurrentTime(val);
                  if (videoRef.current) videoRef.current.currentTime = val;
                }}
                className="w-full h-2 bg-[#FAF6F1] border border-[#E8DDD2] rounded-full appearance-none cursor-pointer accent-[#C87A47]"
              />
            </div>

            {/* Word-by-Word Text Cutting Track */}
            <div className="flex-1 overflow-x-auto flex items-center gap-1.5 pb-1 select-none">
              <span className="text-[10px] font-bold text-[#7A6B63] uppercase mr-2 flex items-center gap-1 flex-shrink-0">
                <Scissors className="w-3 h-3 text-[#C87A47]" />
                <span>Text Cut:</span>
              </span>
              {transcriptWords.map((word) => {
                const isCurrent =
                  currentTime >= word.time &&
                  currentTime < word.time + 1.2;
                return (
                  <div
                    key={word.id}
                    onClick={() => {
                      setCurrentTime(word.time);
                      if (videoRef.current) videoRef.current.currentTime = word.time;
                    }}
                    className={`group relative px-2.5 py-1 rounded-xl text-xs font-bold border transition-all cursor-pointer flex-shrink-0 flex items-center gap-1 ${
                      word.deleted
                        ? "line-through opacity-40 bg-[#FAF6F1] border-[#E8DDD2] text-[#A09085]"
                        : isCurrent
                        ? "bg-[#2B1D16] border-[#2B1D16] text-white shadow-sm"
                        : "bg-[#FAF6F1] hover:bg-white border-[#E8DDD2] text-[#2B1D16]"
                    }`}
                  >
                    <span>{word.text}</span>
                    {word.emoji && <span>{word.emoji}</span>}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleWordDelete(word.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 hover:text-red-500 transition-opacity ml-0.5"
                      title={word.deleted ? "Restore word" : "Cut filler word"}
                    >
                      <Scissors className="w-2.5 h-2.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </main>
      </div>

      {/* CapCut Style Export Modal */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 bg-[#2B1D16]/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white max-w-md w-full p-7 rounded-[32px] border border-[#E8DDD2] shadow-2xl animate-in zoom-in-95 duration-200 text-[#2B1D16]">
            <h3 className="text-xl font-extrabold text-[#2B1D16] mb-1">Export Viral Video</h3>
            <p className="text-xs text-[#7A695F] mb-5">
              Render with CapCut manual transforms, color grading, and burned-in subtitles.
            </p>

            <div className="space-y-4 mb-6">
              <div>
                <label className="text-xs font-bold text-[#2B1D16] block mb-1.5">
                  Render Resolution
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {["720p", "1080p", "4K"].map((res) => (
                    <button
                      key={res}
                      onClick={() => setExportResolution(res)}
                      className={`py-2 rounded-2xl text-xs font-bold border transition-all cursor-pointer ${
                        exportResolution === res
                          ? "bg-[#2B1D16] border-[#2B1D16] text-white shadow-sm"
                          : "bg-[#FAF6F1] border-[#E8DDD2] text-[#7A695F]"
                      }`}
                    >
                      {res}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-[#2B1D16] block mb-1.5">
                  Target Frame Rate
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: "30", label: "30 FPS (Standard)" },
                    { id: "60", label: "60 FPS (Ultra Smooth)" },
                  ].map((fps) => (
                    <button
                      key={fps.id}
                      onClick={() => setExportFps(fps.id)}
                      className={`py-2 rounded-2xl text-xs font-bold border transition-all cursor-pointer ${
                        exportFps === fps.id
                          ? "bg-[#2B1D16] border-[#2B1D16] text-white shadow-sm"
                          : "bg-[#FAF6F1] border-[#E8DDD2] text-[#7A695F]"
                      }`}
                    >
                      {fps.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-3.5 rounded-2xl bg-[#FAF6F1] border border-[#E8DDD2] text-xs text-[#2B1D16] space-y-1">
                <div className="flex justify-between">
                  <span className="text-[#7A695F]">Format:</span>
                  <span className="font-bold text-[#2B1D16]">MP4 (H.264 / AAC)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#7A695F]">Aspect Ratio:</span>
                  <span className="font-bold text-[#2B1D16]">{aspectRatio}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#7A695F]">Hardcoded Subtitles:</span>
                  <span className="font-bold text-[#3A7D44]">Enabled ({captionStyle})</span>
                </div>
              </div>
            </div>

            <div className="flex gap-2.5">
              <button
                onClick={() => setShowExportModal(false)}
                className="flex-1 py-3 rounded-full border border-[#E8DDD2] bg-[#FAF6F1] text-[#2B1D16] text-xs font-bold hover:bg-[#EAE1D7] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleExport}
                disabled={isExporting}
                className="flex-1 warm-btn-terracotta py-3 rounded-full text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 shadow-md shadow-[#C87A47]/20 transition-all"
              >
                {isExporting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Rendering Video...</span>
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    <span>Download MP4</span>
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
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#F5EFEB] text-[#2B1D16] p-8 flex items-center justify-center font-bold">
          Loading Opus Studio Pro Editor...
        </div>
      }
    >
      <EditorContent />
    </Suspense>
  );
}
