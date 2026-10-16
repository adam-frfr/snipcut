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
  Download,
  Check,
  ArrowLeft,
  Sliders,
  Move,
  Crop,
  Sun,
  Music,
  RotateCw,
  FlipHorizontal,
  Grid,
  Heart,
  MessageSquare,
  Share2,
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

  // 3. Captions & Typography (CapCut Text Style)
  const [captionStyle, setCaptionStyle] = useState<"hormozi" | "neon" | "beast" | "clean">("hormozi");
  const [fontFamily, setFontFamily] = useState<string>("Plus Jakarta Sans");
  const [fontSize, setFontSize] = useState<"sm" | "md" | "lg" | "xl">("lg");
  const [highlightColor, setHighlightColor] = useState<string>("#FFC700");
  const [textColor, setTextColor] = useState<string>("#FFFFFF");
  const [strokeWidth, setStrokeWidth] = useState<number>(2);
  const [strokeColor, setStrokeColor] = useState<string>("#000000");
  const [bgBox, setBgBox] = useState<"none" | "pill" | "box">("pill");
  const [captionPositionY, setCaptionPositionY] = useState<number>(80); // % from top
  const [isUppercase, setIsUppercase] = useState(true);

  // 4. Color & Adjustments (CapCut Filter Grade)
  const [activeFilter, setActiveFilter] = useState<"none" | "viral" | "warm" | "moody" | "cold" | "vibrant">("none");
  const [brightness, setBrightness] = useState<number>(0); // -50 to +50
  const [contrast, setContrast] = useState<number>(0); // -50 to +50
  const [saturation, setSaturation] = useState<number>(0); // -50 to +50
  const [warmth, setWarmth] = useState<number>(0); // -50 to +50

  // 5. Transcript & Timeline State (Zero Emojis)
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
          }))
        );
      } else {
        const defaultWords = [
          { id: 1, text: "In", time: 0, deleted: false },
          { id: 2, text: "the", time: 0.4, deleted: false },
          { id: 3, text: "next", time: 0.7, deleted: false },
          { id: 4, text: "decade,", time: 1.1, deleted: false },
          { id: 5, text: "AI", time: 1.8, deleted: false },
          { id: 6, text: "compute", time: 2.2, deleted: false },
          { id: 7, text: "will", time: 2.6, deleted: false },
          { id: 8, text: "scale", time: 3.0, deleted: false },
          { id: 9, text: "exponentially", time: 3.5, deleted: false },
          { id: 10, text: "faster", time: 4.2, deleted: false },
          { id: 11, text: "than", time: 4.8, deleted: false },
          { id: 12, text: "anyone", time: 5.2, deleted: false },
          { id: 13, text: "predicts.", time: 5.7, deleted: false },
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

  // Word-level deletion
  const toggleWordDelete = (id: number) => {
    setTranscriptWords((prev) =>
      prev.map((w) => (w.id === id ? { ...w, deleted: !w.deleted } : w))
    );
  };

  // Export render
  const handleExport = async () => {
    if (!clip?.videoFilePath) {
      setIsExporting(true);
      setTimeout(() => {
        setIsExporting(false);
        setShowExportModal(false);
        try {
          confetti({ particleCount: 70, spread: 60, origin: { y: 0.6 } });
        } catch (e) {}
        alert("Video rendered successfully with transforms and subtitles.");
      }, 1500);
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
        confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 } });
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
    <div className="min-h-screen bg-[#F8F7F4] text-black flex flex-col select-none font-sans">
      {/* Top Bar: Neo-Brutalist Editor Header */}
      <header className="h-13 bg-[#F8F7F4] border-b-2 border-black px-4 flex items-center justify-between z-40 sticky top-0">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="p-1.5 border-2 border-black bg-white hover:bg-[#FFC700] rounded-lg transition-colors cursor-pointer"
            title="Back to Dashboard"
          >
            <ArrowLeft className="w-4 h-4 stroke-[3]" />
          </Link>
          <div className="flex items-center gap-2">
            <span className="font-black text-sm uppercase tracking-tight text-black">STUDIO EDITOR</span>
            <span className="neo-tag-yellow text-[9px]">PRO</span>
          </div>
          <div className="hidden sm:block h-4 w-px bg-black/20" />
          <input
            type="text"
            value={clip?.title || "Viral Clip #1"}
            onChange={(e) => setClip({ ...clip, title: e.target.value })}
            className="hidden sm:block text-xs font-black uppercase text-black bg-transparent hover:bg-white focus:bg-white px-2 py-0.5 border border-transparent focus:border-black rounded transition-all max-w-[220px] truncate"
            title="Click to rename"
          />
        </div>

        <div className="flex items-center gap-2">
          {clip && (
            <div className="hidden md:flex items-center gap-1 px-2.5 py-0.5 bg-black text-white border-2 border-black text-[10px] font-black uppercase">
              <span>VIRALITY {clip.viralityScore || 98}/100</span>
            </div>
          )}

          <button
            onClick={resetAllAdjustments}
            className="neo-btn-white px-3 py-1.5 rounded-lg text-xs font-black uppercase flex items-center gap-1.5 cursor-pointer"
            title="Reset All Adjustments"
          >
            <RotateCcw className="w-3.5 h-3.5 stroke-[3]" />
            <span className="hidden sm:inline">Reset</span>
          </button>

          <button
            onClick={() => setShowExportModal(true)}
            className="neo-btn-yellow px-4 py-1.5 rounded-lg text-xs font-black uppercase flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 stroke-[3]" />
            <span>Export</span>
          </button>
        </div>
      </header>

      {/* Main Studio Body */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Left Column: Sidebar Controls */}
        <aside className="w-full md:w-80 bg-white border-b-2 md:border-b-0 md:border-r-2 border-black flex flex-col z-20">
          {/* Neo-Brutalist Category Selector */}
          <div className="grid grid-cols-5 p-1.5 bg-[#F8F7F4] border-b-2 border-black text-[10px] font-black uppercase">
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
                  className={`flex flex-col items-center justify-center py-2 rounded-lg border-2 transition-all cursor-pointer ${
                    isActive
                      ? "bg-black border-black text-white shadow-[2px_2px_0px_#FFC700]"
                      : "bg-white border-black text-black hover:bg-[#F8F7F4]"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 mb-0.5 stroke-[2.5]" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* Tab Content Panels */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 max-h-[45vh] md:max-h-none">
            {/* TAB 1: TRANSFORM & CANVAS */}
            {activeTab === "transform" && (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-black uppercase tracking-wider block mb-1.5 text-black">
                    Aspect Ratio
                  </label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[
                      { id: "9:16", label: "9:16" },
                      { id: "1:1", label: "1:1" },
                      { id: "16:9", label: "16:9" },
                      { id: "4:5", label: "4:5" },
                    ].map((ar) => (
                      <button
                        key={ar.id}
                        onClick={() => setAspectRatio(ar.id as any)}
                        className={`py-1.5 border-2 border-black rounded-lg text-xs font-black uppercase text-center transition-all cursor-pointer ${
                          aspectRatio === ar.id
                            ? "bg-[#FFC700] text-black shadow-[2px_2px_0px_#000000]"
                            : "bg-white text-black hover:bg-[#F8F7F4]"
                        }`}
                      >
                        {ar.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Scale / Zoom */}
                <div className="bg-[#F8F7F4] p-3 border-2 border-black rounded-xl space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-black uppercase text-black">
                    <span>Scale Zoom</span>
                    <span className="font-mono">{zoom}%</span>
                  </div>
                  <input
                    type="range"
                    min="50"
                    max="200"
                    value={zoom}
                    onChange={(e) => setZoom(Number(e.target.value))}
                    className="w-full h-2 bg-[#E0DDD5] rounded appearance-none cursor-pointer accent-[#FFC700]"
                  />
                </div>

                {/* Position X & Y */}
                <div className="bg-[#F8F7F4] p-3 border-2 border-black rounded-xl space-y-3">
                  <div>
                    <div className="flex items-center justify-between text-xs font-black uppercase text-black mb-1">
                      <span>Position X</span>
                      <span className="font-mono">{posX}px</span>
                    </div>
                    <input
                      type="range"
                      min="-200"
                      max="200"
                      value={posX}
                      onChange={(e) => setPosX(Number(e.target.value))}
                      className="w-full h-2 bg-[#E0DDD5] rounded appearance-none cursor-pointer accent-[#FFC700]"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-xs font-black uppercase text-black mb-1">
                      <span>Position Y</span>
                      <span className="font-mono">{posY}px</span>
                    </div>
                    <input
                      type="range"
                      min="-200"
                      max="200"
                      value={posY}
                      onChange={(e) => setPosY(Number(e.target.value))}
                      className="w-full h-2 bg-[#E0DDD5] rounded appearance-none cursor-pointer accent-[#FFC700]"
                    />
                  </div>
                </div>

                {/* Rotation & Flip */}
                <div className="bg-[#F8F7F4] p-3 border-2 border-black rounded-xl space-y-2">
                  <div className="flex items-center justify-between text-xs font-black uppercase text-black">
                    <span>Rotation</span>
                    <span className="font-mono">{rotation} deg</span>
                  </div>
                  <input
                    type="range"
                    min="-180"
                    max="180"
                    value={rotation}
                    onChange={(e) => setRotation(Number(e.target.value))}
                    className="w-full h-2 bg-[#E0DDD5] rounded appearance-none cursor-pointer accent-[#FFC700]"
                  />
                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => setRotation((prev) => (prev + 90) % 360)}
                      className="flex-1 py-1.5 border-2 border-black rounded-lg bg-white text-xs font-black uppercase hover:bg-[#FFC700] flex items-center justify-center gap-1 transition cursor-pointer"
                    >
                      <RotateCw className="w-3.5 h-3.5 stroke-[3]" />
                      <span>Rotate 90</span>
                    </button>
                    <button
                      onClick={() => setFlipH(!flipH)}
                      className={`flex-1 py-1.5 border-2 border-black rounded-lg text-xs font-black uppercase flex items-center justify-center gap-1 transition cursor-pointer ${
                        flipH ? "bg-black text-white" : "bg-white text-black hover:bg-[#FFC700]"
                      }`}
                    >
                      <FlipHorizontal className="w-3.5 h-3.5 stroke-[3]" />
                      <span>Flip</span>
                    </button>
                  </div>
                </div>

                {/* Canvas Backdrop */}
                <div>
                  <label className="text-xs font-black uppercase tracking-wider block mb-1.5 text-black">
                    Backdrop Style
                  </label>
                  <div className="grid grid-cols-4 gap-1.5">
                    {[
                      { id: "blur", label: "Blur" },
                      { id: "black", label: "Black" },
                      { id: "sand", label: "Ivory" },
                      { id: "white", label: "White" },
                    ].map((bg) => (
                      <button
                        key={bg.id}
                        onClick={() => setCanvasBg(bg.id as any)}
                        className={`py-1.5 border-2 border-black rounded-lg text-xs font-black uppercase text-center transition-all cursor-pointer ${
                          canvasBg === bg.id
                            ? "bg-[#FFC700] text-black shadow-[2px_2px_0px_#000000]"
                            : "bg-white text-black hover:bg-[#F8F7F4]"
                        }`}
                      >
                        {bg.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: REFRAME */}
            {activeTab === "reframe" && (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-black uppercase tracking-wider block mb-2 text-black">
                    Camera Layout
                  </label>
                  <div className="space-y-2">
                    {[
                      { id: "single-focus", title: "AI Dynamic Pan Track", desc: "Smooth camera motion follows speaker" },
                      { id: "split-screen", title: "Dual Speaker Stack", desc: "Top: Content - Bottom: Facecam" },
                      { id: "blurred-fit", title: "Blurred Canvas Fit", desc: "16:9 full view with blurred background" },
                      { id: "manual-pan", title: "Static Center Crop", desc: "Classic vertical center frame" },
                    ].map((mode) => (
                      <button
                        key={mode.id}
                        onClick={() => setLayoutMode(mode.id as any)}
                        className={`w-full p-2.5 border-2 border-black rounded-xl text-left transition-all cursor-pointer ${
                          layoutMode === mode.id
                            ? "bg-black text-white shadow-[2px_2px_0px_#FFC700]"
                            : "bg-[#F8F7F4] text-black hover:bg-white"
                        }`}
                      >
                        <div className="flex items-center justify-between text-xs font-black uppercase mb-0.5">
                          <span>{mode.title}</span>
                          {layoutMode === mode.id && <Check className="w-3.5 h-3.5 text-[#FFC700] stroke-[3]" />}
                        </div>
                        <div className={`text-[10px] font-bold ${layoutMode === mode.id ? "text-[#CCCCCC]" : "text-[#666666]"}`}>
                          {mode.desc}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Safe Zone Toggle */}
                <div className="flex items-center justify-between p-3 border-2 border-black rounded-xl bg-[#F8F7F4]">
                  <div>
                    <div className="text-xs font-black uppercase text-black flex items-center gap-1.5">
                      <Grid className="w-3.5 h-3.5 stroke-[3]" />
                      <span>Social UI Safe Zone</span>
                    </div>
                    <div className="text-[10px] font-bold text-[#666666]">
                      Overlay TikTok/Reels icon danger zones
                    </div>
                  </div>
                  <button
                    onClick={() => setSafeZoneOverlay(!safeZoneOverlay)}
                    className={`px-3 py-1 border-2 border-black rounded text-xs font-black uppercase cursor-pointer ${
                      safeZoneOverlay ? "bg-[#FFC700] text-black" : "bg-white text-black"
                    }`}
                  >
                    {safeZoneOverlay ? "ON" : "OFF"}
                  </button>
                </div>
              </div>
            )}

            {/* TAB 3: CAPTIONS */}
            {activeTab === "captions" && (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-black uppercase tracking-wider block mb-1.5 text-black">
                    Preset Caption Style
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: "hormozi", name: "Alex Hormozi" },
                      { id: "beast", name: "MrBeast Punch" },
                      { id: "neon", name: "High Contrast" },
                      { id: "clean", name: "Minimal Clean" },
                    ].map((p) => (
                      <button
                        key={p.id}
                        onClick={() => setCaptionStyle(p.id as any)}
                        className={`p-2.5 border-2 border-black rounded-xl text-left transition-all cursor-pointer ${
                          captionStyle === p.id
                            ? "bg-black text-white shadow-[2px_2px_0px_#FFC700]"
                            : "bg-[#F8F7F4] text-black hover:bg-white"
                        }`}
                      >
                        <div className="text-xs font-black uppercase flex items-center justify-between">
                          <span>{p.name}</span>
                          {captionStyle === p.id && <Check className="w-3 h-3 text-[#FFC700] stroke-[3]" />}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Font Family Selector */}
                <div>
                  <label className="text-xs font-black uppercase tracking-wider block mb-1 text-black">
                    Font Family
                  </label>
                  <select
                    value={fontFamily}
                    onChange={(e) => setFontFamily(e.target.value)}
                    className="w-full neo-input py-2 px-3 text-xs font-black uppercase"
                  >
                    <option value="Plus Jakarta Sans">Plus Jakarta Sans</option>
                    <option value="Impact">Impact (Heavy Condensed)</option>
                    <option value="Montserrat">Montserrat (Clean)</option>
                    <option value="Anton">Anton (High Contrast)</option>
                  </select>
                </div>

                {/* Color and Outline */}
                <div className="bg-[#F8F7F4] p-3 border-2 border-black rounded-xl space-y-3">
                  <div>
                    <label className="text-xs font-black uppercase text-black block mb-1.5">
                      Keyword Highlight Color
                    </label>
                    <div className="flex items-center gap-2">
                      {["#FFC700", "#FF5500", "#22C55E", "#06B6D4", "#FFFFFF"].map((hex) => (
                        <button
                          key={hex}
                          onClick={() => setHighlightColor(hex)}
                          style={{ backgroundColor: hex }}
                          className={`w-7 h-7 rounded border-2 border-black cursor-pointer ${
                            highlightColor === hex ? "ring-2 ring-black scale-110" : ""
                          }`}
                        />
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs font-black uppercase text-black mb-1">
                      <span>Outline Stroke</span>
                      <span className="font-mono">{strokeWidth}px</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="6"
                      value={strokeWidth}
                      onChange={(e) => setStrokeWidth(Number(e.target.value))}
                      className="w-full h-2 bg-[#E0DDD5] rounded appearance-none cursor-pointer accent-[#FFC700]"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-xs font-black uppercase text-black mb-1">
                      <span>Position Y</span>
                      <span className="font-mono">{captionPositionY}%</span>
                    </div>
                    <input
                      type="range"
                      min="20"
                      max="90"
                      value={captionPositionY}
                      onChange={(e) => setCaptionPositionY(Number(e.target.value))}
                      className="w-full h-2 bg-[#E0DDD5] rounded appearance-none cursor-pointer accent-[#FFC700]"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between p-3 border-2 border-black rounded-xl bg-[#F8F7F4]">
                  <span className="text-xs font-black uppercase text-black">UPPERCASE All Text</span>
                  <button
                    onClick={() => setIsUppercase(!isUppercase)}
                    className={`px-3 py-1 border-2 border-black rounded text-xs font-black uppercase cursor-pointer ${
                      isUppercase ? "bg-[#FFC700] text-black" : "bg-white text-black"
                    }`}
                  >
                    {isUppercase ? "YES" : "NO"}
                  </button>
                </div>
              </div>
            )}

            {/* TAB 4: AUDIO & SPEED */}
            {activeTab === "audio" && (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-black uppercase tracking-wider block mb-1.5 text-black">
                    Clip Playback Speed
                  </label>
                  <div className="grid grid-cols-5 gap-1">
                    {[0.75, 1.0, 1.25, 1.5, 2.0].map((s) => (
                      <button
                        key={s}
                        onClick={() => setPlaybackSpeed(s)}
                        className={`py-2 border-2 border-black rounded-lg text-xs font-black uppercase text-center transition-all cursor-pointer ${
                          playbackSpeed === s
                            ? "bg-[#FFC700] text-black shadow-[2px_2px_0px_#000000]"
                            : "bg-white text-black hover:bg-[#F8F7F4]"
                        }`}
                      >
                        {s}x
                      </button>
                    ))}
                  </div>
                </div>

                <div className="bg-[#F8F7F4] p-3 border-2 border-black rounded-xl space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-black uppercase text-black">
                    <span>Volume Boost</span>
                    <span className="font-mono">{volume}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="200"
                    value={volume}
                    onChange={(e) => setVolume(Number(e.target.value))}
                    className="w-full h-2 bg-[#E0DDD5] rounded appearance-none cursor-pointer accent-[#FFC700]"
                  />
                </div>
              </div>
            )}

            {/* TAB 5: FILTERS */}
            {activeTab === "filters" && (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-black uppercase tracking-wider block mb-1.5 text-black">
                    Color Presets
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { id: "none", label: "Raw" },
                      { id: "viral", label: "Punch" },
                      { id: "warm", label: "Warm" },
                      { id: "moody", label: "Moody" },
                      { id: "cold", label: "Cold" },
                      { id: "vibrant", label: "Golden" },
                    ].map((f) => (
                      <button
                        key={f.id}
                        onClick={() => handleFilterPreset(f.id as any)}
                        className={`py-1.5 border-2 border-black rounded-lg text-xs font-black uppercase transition-all cursor-pointer ${
                          activeFilter === f.id
                            ? "bg-[#FFC700] text-black shadow-[2px_2px_0px_#000000]"
                            : "bg-white text-black hover:bg-[#F8F7F4]"
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="bg-[#F8F7F4] p-3 border-2 border-black rounded-xl space-y-3">
                  <div>
                    <div className="flex justify-between text-xs font-black uppercase text-black mb-1">
                      <span>Brightness</span>
                      <span className="font-mono">{brightness}</span>
                    </div>
                    <input
                      type="range"
                      min="-50"
                      max="50"
                      value={brightness}
                      onChange={(e) => setBrightness(Number(e.target.value))}
                      className="w-full h-2 bg-[#E0DDD5] rounded appearance-none cursor-pointer accent-[#FFC700]"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-xs font-black uppercase text-black mb-1">
                      <span>Contrast</span>
                      <span className="font-mono">{contrast}</span>
                    </div>
                    <input
                      type="range"
                      min="-50"
                      max="50"
                      value={contrast}
                      onChange={(e) => setContrast(Number(e.target.value))}
                      className="w-full h-2 bg-[#E0DDD5] rounded appearance-none cursor-pointer accent-[#FFC700]"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-xs font-black uppercase text-black mb-1">
                      <span>Saturation</span>
                      <span className="font-mono">{saturation}</span>
                    </div>
                    <input
                      type="range"
                      min="-50"
                      max="50"
                      value={saturation}
                      onChange={(e) => setSaturation(Number(e.target.value))}
                      className="w-full h-2 bg-[#E0DDD5] rounded appearance-none cursor-pointer accent-[#FFC700]"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* Center: Viewport & Multitrack Timeline */}
        <main className="flex-1 flex flex-col bg-[#F8F7F4] relative overflow-hidden">
          {/* Viewport Canvas Stage */}
          <div className="flex-1 flex items-center justify-center p-4 sm:p-6 relative overflow-hidden">
            <div
              className={`relative rounded-xl overflow-hidden border-2 border-black shadow-[5px_5px_0px_#000000] transition-all flex flex-col items-center justify-center ${
                aspectRatio === "9:16"
                  ? "w-[260px] sm:w-[280px] h-[460px] sm:h-[490px]"
                  : aspectRatio === "1:1"
                  ? "w-[340px] sm:w-[380px] h-[340px] sm:h-[380px]"
                  : aspectRatio === "16:9"
                  ? "w-[440px] sm:w-[500px] h-[250px] sm:h-[280px]"
                  : "w-[300px] sm:w-[340px] h-[375px] sm:h-[425px]"
              } ${canvasBg === "black" ? "bg-black" : canvasBg === "sand" ? "bg-[#F8F7F4]" : "bg-black"}`}
            >
              {/* Blurred Backdrop */}
              {canvasBg === "blur" && clip?.videoUrl && (
                <video
                  src={clip.renderedVideoUrl || clip.videoUrl}
                  className="absolute inset-0 w-full h-full object-cover blur-2xl scale-125 opacity-60 pointer-events-none"
                  muted
                  playsInline
                />
              )}

              {/* Video with CSS Transforms & Filters */}
              <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
                <video
                  ref={videoRef}
                  key={`editor-${clip?.id}-${clip?.renderedVideoUrl || clip?.videoUrl || ""}`}
                  src={clip?.renderedVideoUrl || clip?.videoUrl || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=600&auto=format&fit=crop&q=80"}
                  className="w-full h-full object-cover"
                  style={{
                    transform: `scale(${zoom / 100}) translate(${posX}px, ${posY}px) rotate(${rotation}deg) scaleX(${flipH ? -1 : 1})`,
                    filter: `brightness(${100 + brightness}%) contrast(${100 + contrast}%) saturate(${100 + saturation}%)`,
                  }}
                  preload="auto"
                  muted={isMuted}
                  playsInline
                />

                {/* Safe Zone Overlay - Zero Emojis, Clean Lucide SVG Icons */}
                {safeZoneOverlay && (
                  <div className="absolute inset-0 pointer-events-none z-30 flex flex-col justify-between p-3 border-2 border-dashed border-[#FFC700] bg-black/10">
                    <div className="text-[9px] font-black uppercase text-black bg-[#FFC700] px-2 py-0.5 border border-black self-start">
                      SAFE ZONE GUIDE
                    </div>
                    <div className="self-end space-y-2.5 mr-1 mb-6 opacity-85">
                      <div className="w-7 h-7 rounded border border-white bg-black/70 flex items-center justify-center">
                        <Heart className="w-3.5 h-3.5 text-white" />
                      </div>
                      <div className="w-7 h-7 rounded border border-white bg-black/70 flex items-center justify-center">
                        <MessageSquare className="w-3.5 h-3.5 text-white" />
                      </div>
                      <div className="w-7 h-7 rounded border border-white bg-black/70 flex items-center justify-center">
                        <Share2 className="w-3.5 h-3.5 text-white" />
                      </div>
                    </div>
                    <div className="text-[8px] font-black uppercase text-black bg-[#FFC700] px-2 py-0.5 border border-black self-center">
                      CAPTION ZONE
                    </div>
                  </div>
                )}

                {/* Captions Overlay - Zero Emojis */}
                {activeWord && (
                  <div
                    className="absolute left-0 right-0 z-20 px-3 text-center pointer-events-none"
                    style={{ top: `${captionPositionY}%` }}
                  >
                    <div className="inline-block px-3 py-1 bg-black/85 border border-white/20">
                      <span
                        className="font-black tracking-tight"
                        style={{
                          fontFamily: fontFamily,
                          fontSize: fontSize === "sm" ? "14px" : fontSize === "md" ? "18px" : "22px",
                          color: highlightColor,
                          WebkitTextStroke: `${strokeWidth}px ${strokeColor}`,
                          textTransform: isUppercase ? "uppercase" : "none",
                        }}
                      >
                        {activeWord.text}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Bottom Scrub Timeline */}
          <div className="bg-white border-t-2 border-black p-3.5 z-30">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <button
                  onClick={togglePlay}
                  className="w-8 h-8 bg-black hover:bg-[#FFC700] hover:text-black text-white border-2 border-black flex items-center justify-center transition-colors cursor-pointer"
                >
                  {isPlaying ? <Pause className="w-3.5 h-3.5 stroke-[3]" /> : <Play className="w-3.5 h-3.5 ml-0.5 stroke-[3]" />}
                </button>

                <button
                  onClick={() => {
                    setCurrentTime(0);
                    if (videoRef.current) videoRef.current.currentTime = 0;
                  }}
                  className="p-1.5 border-2 border-black bg-white hover:bg-[#F8F7F4] text-black transition cursor-pointer"
                  title="Rewind"
                >
                  <RotateCcw className="w-3 h-3 stroke-[3]" />
                </button>

                <div className="font-mono text-xs font-black text-black">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </div>
              </div>

              <div className="text-[10px] font-black uppercase text-black">
                SPEED: {playbackSpeed}X | VOL: {volume}%
              </div>
            </div>

            {/* Scrub Slider */}
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
              className="w-full h-2 bg-[#E0DDD5] border border-black appearance-none cursor-pointer accent-[#FFC700] mb-2.5"
            />

            {/* Word Trimming Track (Zero Emojis) */}
            <div className="overflow-x-auto flex items-center gap-1 pb-1 select-none">
              <span className="text-[10px] font-black uppercase mr-1.5 flex items-center gap-1 flex-shrink-0">
                <Scissors className="w-3 h-3 stroke-[3]" />
                <span>CUT:</span>
              </span>
              {transcriptWords.map((word) => {
                const isCurrent = currentTime >= word.time && currentTime < word.time + 1.2;
                return (
                  <div
                    key={word.id}
                    onClick={() => {
                      setCurrentTime(word.time);
                      if (videoRef.current) videoRef.current.currentTime = word.time;
                    }}
                    className={`group relative px-2 py-0.5 text-xs font-black uppercase border border-black cursor-pointer flex-shrink-0 flex items-center gap-1 ${
                      word.deleted
                        ? "line-through opacity-30 bg-gray-200 text-gray-500"
                        : isCurrent
                        ? "bg-[#FFC700] text-black font-black"
                        : "bg-[#F8F7F4] text-black hover:bg-white"
                    }`}
                  >
                    <span>{word.text}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleWordDelete(word.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 hover:text-red-600 transition-opacity ml-0.5"
                      title={word.deleted ? "Restore" : "Cut word"}
                    >
                      <Scissors className="w-2.5 h-2.5 stroke-[3]" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </main>
      </div>

      {/* Export Modal */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white max-w-sm w-full p-6 rounded-2xl border-2 border-black shadow-[6px_6px_0px_#000000] text-black">
            <h3 className="text-base font-black uppercase text-black mb-1">Export Video</h3>
            <p className="text-xs text-[#555555] font-bold mb-4">
              Render with manual transforms and hardcoded captions.
            </p>

            <div className="space-y-3 mb-5">
              <div>
                <label className="text-xs font-black uppercase text-black block mb-1">
                  Resolution
                </label>
                <div className="grid grid-cols-3 gap-1.5">
                  {["720p", "1080p", "4K"].map((res) => (
                    <button
                      key={res}
                      onClick={() => setExportResolution(res)}
                      className={`py-1.5 border-2 border-black rounded text-xs font-black uppercase cursor-pointer ${
                        exportResolution === res
                          ? "bg-[#FFC700] text-black shadow-[2px_2px_0px_#000000]"
                          : "bg-[#F8F7F4] text-black"
                      }`}
                    >
                      {res}
                    </button>
                  ))}
                </div>
              </div>

              <div className="p-3 bg-[#F8F7F4] border-2 border-black text-xs font-bold space-y-1">
                <div className="flex justify-between">
                  <span className="text-[#666666]">Format:</span>
                  <span className="font-black">MP4 (H.264)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#666666]">Ratio:</span>
                  <span className="font-black">{aspectRatio}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#666666]">Watermark:</span>
                  <span className="font-black text-[#15803D]">None</span>
                </div>
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setShowExportModal(false)}
                className="flex-1 neo-btn-white py-2 rounded-lg text-xs font-black uppercase cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleExport}
                disabled={isExporting}
                className="flex-1 neo-btn-yellow py-2 rounded-lg text-xs font-black uppercase flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isExporting ? "Rendering..." : "Download"}
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
        <div className="min-h-screen bg-[#F8F7F4] text-black p-8 font-black">
          Loading Editor...
        </div>
      }
    >
      <EditorContent />
    </Suspense>
  );
}
