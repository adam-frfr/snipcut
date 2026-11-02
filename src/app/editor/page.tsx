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
  Search,
  Split,
  Eye,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { MOCK_CLIPS, CAPTION_PRESETS } from "@/lib/mockData";
import confetti from "canvas-confetti";

type SidebarTab = "layout" | "captions" | "transform" | "audio" | "filters";

function EditorContent() {
  const searchParams = useSearchParams();
  const clipId = searchParams.get("clip") || searchParams.get("clipId") || "";

  // Active Sidebar Tab
  const [activeTab, setActiveTab] = useState<SidebarTab>("layout");

  // Video & Playback State
  const [clip, setClip] = useState<any>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(30);
  const [playbackSpeed, setPlaybackSpeed] = useState<number>(1.0);
  const [volume, setVolume] = useState<number>(100);

  // In/Out Trimmer
  const [trimStart, setTrimStart] = useState<number>(0);
  const [trimEnd, setTrimEnd] = useState<number>(30);

  // 1. Layout Mode & Dual-Speaker Split Screen Controls
  const [layoutMode, setLayoutMode] = useState<"split-screen" | "single-focus" | "blurred-fit" | "manual-pan">("split-screen");
  const [aspectRatio, setAspectRatio] = useState<"9:16" | "1:1" | "16:9">("9:16");

  // Split-screen free movement states
  const [splitRatio, setSplitRatio] = useState<number>(50); // % height of top video (20% to 80%)
  const [topCropX, setTopCropX] = useState<number>(25); // % from left of source video (Speaker 1)
  const [topZoom, setTopZoom] = useState<number>(1.2); // 1.0x to 2.5x
  const [botCropX, setBotCropX] = useState<number>(75); // % from left of source video (Speaker 2)
  const [botZoom, setBotZoom] = useState<number>(1.2); // 1.0x to 2.5x

  // Dragging states
  const [isDraggingDivider, setIsDraggingDivider] = useState(false);
  const [isDraggingTopVideo, setIsDraggingTopVideo] = useState(false);
  const [isDraggingBotVideo, setIsDraggingBotVideo] = useState(false);
  const [isDraggingCaption, setIsDraggingCaption] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; initialVal: number }>({ x: 0, y: 0, initialVal: 0 });

  // 2. Transform & Canvas Settings
  const [zoom, setZoom] = useState<number>(100);
  const [posX, setPosX] = useState<number>(0);
  const [posY, setPosY] = useState<number>(0);
  const [rotation, setRotation] = useState<number>(0);
  const [flipH, setFlipH] = useState<boolean>(false);
  const [canvasBg, setCanvasBg] = useState<"black" | "blur" | "sand" | "white">("blur");
  const [safeZoneOverlay, setSafeZoneOverlay] = useState<boolean>(false);

  // 3. Captions & Typography
  const [captionStyle, setCaptionStyle] = useState<"hormozi" | "neon" | "beast" | "clean">("hormozi");
  const [fontFamily, setFontFamily] = useState<string>("Plus Jakarta Sans");
  const [fontSize, setFontSize] = useState<"sm" | "md" | "lg" | "xl">("lg");
  const [highlightColor, setHighlightColor] = useState<string>("#FFC700");
  const [textColor, setTextColor] = useState<string>("#FFFFFF");
  const [strokeWidth, setStrokeWidth] = useState<number>(3);
  const [strokeColor, setStrokeColor] = useState<string>("#000000");
  const [captionPositionY, setCaptionPositionY] = useState<number>(50); // % from top (50% is on split seam)
  const [isUppercase, setIsUppercase] = useState(true);

  // 4. Color & Adjustments
  const [activeFilter, setActiveFilter] = useState<"none" | "viral" | "warm" | "moody" | "cold" | "vibrant">("none");
  const [brightness, setBrightness] = useState<number>(0);
  const [contrast, setContrast] = useState<number>(0);
  const [saturation, setSaturation] = useState<number>(0);

  // 5. Transcript State & Search
  const [transcriptWords, setTranscriptWords] = useState<any[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [editingWordId, setEditingWordId] = useState<number | null>(null);

  // Export / Render state
  const [showExportModal, setShowExportModal] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState("");

  // Video Element Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const videoTopRef = useRef<HTMLVideoElement>(null);
  const stageContainerRef = useRef<HTMLDivElement>(null);

  const getAuthHeaders = (): Record<string, string> => {
    if (typeof window === "undefined") return {};
    const t = localStorage.getItem("app_access_token");
    return t ? { "x-app-access-token": t } : {};
  };

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
      const totalDur = foundClip.duration || 30;
      setDuration(totalDur);
      setTrimStart(foundClip.startTime || 0);
      setTrimEnd((foundClip.startTime || 0) + totalDur);

      if (foundClip.transcript && foundClip.transcript.length > 0) {
        setTranscriptWords(
          foundClip.transcript.map((t: any, idx: number) => ({
            id: idx + 1,
            text: t.text || t.word,
            time: Number((t.start || idx * 0.4).toFixed(2)),
            deleted: false,
          }))
        );
      } else {
        const sampleWords = [
          { id: 1, text: "Why", time: 0.0, deleted: false },
          { id: 2, text: "is", time: 0.3, deleted: false },
          { id: 3, text: "this", time: 0.6, deleted: false },
          { id: 4, text: "month", time: 1.0, deleted: false },
          { id: 5, text: "going", time: 1.4, deleted: false },
          { id: 6, text: "by", time: 1.8, deleted: false },
          { id: 7, text: "so", time: 2.1, deleted: false },
          { id: 8, text: "fast?", time: 2.5, deleted: false },
          { id: 9, text: "Ain't", time: 3.2, deleted: false },
          { id: 10, text: "no", time: 3.5, deleted: false },
          { id: 11, text: "way!", time: 3.9, deleted: false },
        ];
        setTranscriptWords(sampleWords);
      }
    }
  }, [clipId]);

  // Synchronize playback speed
  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = playbackSpeed;
    if (videoTopRef.current) videoTopRef.current.playbackRate = playbackSpeed;
  }, [playbackSpeed]);

  // Synchronize volume
  useEffect(() => {
    if (videoRef.current) videoRef.current.volume = isMuted ? 0 : Math.min(1, volume / 100);
  }, [volume, isMuted]);

  // Active word calculation
  const activeWord =
    transcriptWords.find(
      (w, idx) =>
        !w.deleted &&
        currentTime >= w.time &&
        (idx === transcriptWords.length - 1 || currentTime < transcriptWords[idx + 1].time)
    ) || transcriptWords[0];

  // Playback loop
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (isPlaying) {
      timer = setInterval(() => {
        setCurrentTime((prev) => {
          if (prev >= duration) {
            setIsPlaying(false);
            if (videoRef.current) videoRef.current.currentTime = 0;
            if (videoTopRef.current) videoTopRef.current.currentTime = 0;
            return 0;
          }
          return Number((prev + 0.25 * playbackSpeed).toFixed(2));
        });
      }, 250);
    }
    return () => clearInterval(timer);
  }, [isPlaying, duration, playbackSpeed]);

  // Toggle Play / Pause
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

  // Video time sync handler
  const handleTimeUpdate = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    const ct = (e.target as HTMLVideoElement).currentTime;
    setCurrentTime(Number(ct.toFixed(2)));
    if (videoTopRef.current && Math.abs(videoTopRef.current.currentTime - ct) > 0.2) {
      videoTopRef.current.currentTime = ct;
    }
  };

  // --- Mouse Dragging Handlers for Split Screen & Subtitles ---
  const handleMouseDownDivider = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingDivider(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY, initialVal: splitRatio };
  };

  const handleMouseDownTopVideo = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingTopVideo(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY, initialVal: topCropX };
  };

  const handleMouseDownBotVideo = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingBotVideo(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY, initialVal: botCropX };
  };

  const handleMouseDownCaption = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingCaption(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY, initialVal: captionPositionY };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingDivider && stageContainerRef.current) {
        const rect = stageContainerRef.current.getBoundingClientRect();
        const offsetY = e.clientY - rect.top;
        const newRatio = Math.max(25, Math.min(75, Math.round((offsetY / rect.height) * 100)));
        setSplitRatio(newRatio);
      } else if (isDraggingTopVideo) {
        const deltaX = e.clientX - dragStartRef.current.x;
        // Sensitivity: 1px = 0.3% pan
        const newPan = Math.max(0, Math.min(100, Math.round(dragStartRef.current.initialVal - deltaX * 0.35)));
        setTopCropX(newPan);
      } else if (isDraggingBotVideo) {
        const deltaX = e.clientX - dragStartRef.current.x;
        const newPan = Math.max(0, Math.min(100, Math.round(dragStartRef.current.initialVal - deltaX * 0.35)));
        setBotCropX(newPan);
      } else if (isDraggingCaption && stageContainerRef.current) {
        const rect = stageContainerRef.current.getBoundingClientRect();
        const offsetY = e.clientY - rect.top;
        const newPosY = Math.max(15, Math.min(85, Math.round((offsetY / rect.height) * 100)));
        setCaptionPositionY(newPosY);
      }
    };

    const handleMouseUp = () => {
      setIsDraggingDivider(false);
      setIsDraggingTopVideo(false);
      setIsDraggingBotVideo(false);
      setIsDraggingCaption(false);
    };

    if (isDraggingDivider || isDraggingTopVideo || isDraggingBotVideo || isDraggingCaption) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
    }

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDraggingDivider, isDraggingTopVideo, isDraggingBotVideo, isDraggingCaption]);

  // Word edit & deletion
  const toggleWordDelete = (id: number) => {
    setTranscriptWords((prev) =>
      prev.map((w) => (w.id === id ? { ...w, deleted: !w.deleted } : w))
    );
  };

  const handleWordTextChange = (id: number, newText: string) => {
    setTranscriptWords((prev) =>
      prev.map((w) => (w.id === id ? { ...w, text: newText } : w))
    );
  };

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    const ms = Math.floor((sec % 1) * 10);
    return `${m}:${s < 10 ? "0" : ""}${s}.${ms}`;
  };

  // Real FFmpeg Export Execution with Split Screen Options
  const handleExport = async () => {
    setIsExporting(true);
    setExportMessage("Initiating precision render with custom split-screen & subtitles...");

    try {
      const activeWords = transcriptWords.filter((w) => !w.deleted).map((w) => ({
        start: w.time,
        end: Number((w.time + 0.4).toFixed(2)),
        text: w.text,
      }));

      const res = await fetch("/api/render-clip", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({
          inputPath: clip?.videoFilePath || "data/real_speech_2min.mp4",
          startTime: clip?.startTime || 0,
          duration: Number((trimEnd - trimStart).toFixed(2)) || duration,
          aspectRatio,
          reframeMode: layoutMode === "split-screen" ? "split-screen" : "auto-tracker",
          splitScreen: layoutMode === "split-screen",
          splitScreenOptions: {
            splitRatio: splitRatio / 100,
            topCropXPercent: topCropX,
            topZoom: topZoom,
            botCropXPercent: botCropX,
            botZoom: botZoom,
          },
          captionPositionY,
          transcript: activeWords,
          captionStyle,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Rendering failed");
      }

      setExportMessage("Render complete! Updating preview and saving file...");

      // Update clip preview
      if (clip) {
        const updated = {
          ...clip,
          videoUrl: data.downloadUrl,
          renderedVideoUrl: data.downloadUrl,
        };
        setClip(updated);

        // Save back to localStorage
        const saved = localStorage.getItem("opus_user_clips");
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            const nextList = parsed.map((c: any) => (c.id === clip.id ? updated : c));
            localStorage.setItem("opus_user_clips", JSON.stringify(nextList));
          } catch {}
        }
      }

      // Trigger actual download
      const a = document.createElement("a");
      a.href = data.downloadUrl;
      a.download = data.filename || `opus-split-clip.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      try {
        confetti({ particleCount: 70, spread: 60, origin: { y: 0.6 } });
      } catch (e) {}

      setShowExportModal(false);
    } catch (err: any) {
      alert(`Render error: ${err.message}`);
    } finally {
      setIsExporting(false);
      setExportMessage("");
    }
  };

  const filteredWords = transcriptWords.filter((w) =>
    w.text.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-[#F8F7F4] text-black font-sans flex flex-col selection:bg-[#FFC700]">
      {/* Top Navigation Header */}
      <header className="bg-white border-b-2 border-black px-4 sm:px-6 py-2.5 flex items-center justify-between z-40 shadow-sm">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="p-1.5 border-2 border-black bg-[#F8F7F4] hover:bg-[#FFC700] transition flex items-center gap-1.5 font-black text-xs uppercase"
          >
            <ArrowLeft className="w-3.5 h-3.5 stroke-[3]" />
            <span className="hidden sm:inline">Dashboard</span>
          </Link>
          <div className="h-5 w-[2px] bg-black/20" />
          <div>
            <div className="text-xs font-black uppercase text-black flex items-center gap-2">
              <span>{clip?.title || "Opus Studio Clip"}</span>
              <span className="px-1.5 py-0.2 bg-[#FFC700] border border-black text-[9px] font-mono">
                {formatTime(duration)}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowExportModal(true)}
            className="px-4 py-1.5 bg-[#FFC700] hover:bg-[#FF5500] hover:text-white border-2 border-black text-xs font-black uppercase shadow-[2px_2px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 flex items-center gap-1.5 cursor-pointer transition-all"
          >
            <Download className="w-3.5 h-3.5 stroke-[3]" />
            <span>Export & Render</span>
          </button>
        </div>
      </header>

      {/* Main Studio Editor Workspace */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left Column: Interactive Transcript Editor (Matches Screenshot) */}
        <aside className="w-full lg:w-80 bg-white border-r-2 border-black flex flex-col h-[320px] lg:h-auto overflow-hidden">
          <div className="p-3 border-b-2 border-black bg-[#F8F7F4] flex items-center justify-between">
            <span className="text-xs font-black uppercase tracking-wider flex items-center gap-1.5">
              <Type className="w-4 h-4 stroke-[2.5]" />
              <span>Transcript & Hooks</span>
            </span>
            <span className="text-[10px] font-mono font-bold bg-white px-2 py-0.5 border border-black">
              {transcriptWords.filter((w) => !w.deleted).length} words
            </span>
          </div>

          {/* Search Transcript */}
          <div className="p-2 border-b border-black/15 bg-white">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-neutral-500" />
              <input
                type="text"
                placeholder="Search transcript words..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs font-mono border border-black bg-[#F8F7F4] focus:outline-none focus:bg-white"
              />
            </div>
          </div>

          {/* Words Stream */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            <div className="text-[10px] font-bold text-neutral-600 uppercase mb-1">
              Click word to seek · Double click to edit · Scissors to cut:
            </div>

            <div className="flex flex-wrap gap-1.5 leading-relaxed">
              {filteredWords.map((word) => {
                const isCurrent = currentTime >= word.time && currentTime < word.time + 0.5;
                const isEditing = editingWordId === word.id;

                return (
                  <div
                    key={word.id}
                    onClick={() => {
                      setCurrentTime(word.time);
                      if (videoRef.current) videoRef.current.currentTime = word.time;
                      if (videoTopRef.current) videoTopRef.current.currentTime = word.time;
                    }}
                    onDoubleClick={() => setEditingWordId(word.id)}
                    className={`group inline-flex items-center gap-1 px-1.5 py-0.5 text-xs border border-black rounded transition-all cursor-pointer ${
                      word.deleted
                        ? "line-through opacity-30 bg-gray-200 text-gray-500"
                        : isCurrent
                        ? "bg-[#FFC700] text-black font-black shadow-[1px_1px_0px_#000000]"
                        : "bg-[#F8F7F4] hover:bg-white text-black font-semibold"
                    }`}
                  >
                    <span className="text-[9px] font-mono opacity-60">
                      {formatTime(word.time)}
                    </span>

                    {isEditing ? (
                      <input
                        type="text"
                        defaultValue={word.text}
                        autoFocus
                        onBlur={(e) => {
                          handleWordTextChange(word.id, e.target.value);
                          setEditingWordId(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            handleWordTextChange(word.id, (e.target as HTMLInputElement).value);
                            setEditingWordId(null);
                          }
                        }}
                        className="w-16 bg-white border border-black px-1 text-xs font-bold"
                      />
                    ) : (
                      <span>{word.text}</span>
                    )}

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
        </aside>

        {/* Center: Stage Canvas & Interactive Multi-Pane Player */}
        <main className="flex-1 flex flex-col bg-[#F8F7F4] relative overflow-hidden">
          <div className="flex-1 flex items-center justify-center p-3 sm:p-6 relative overflow-hidden select-none">
            {/* 9:16 Frame Container */}
            <div
              ref={stageContainerRef}
              className={`relative rounded-xl overflow-hidden border-4 border-black shadow-[8px_8px_0px_#000000] transition-all flex flex-col items-center justify-center ${
                aspectRatio === "9:16"
                  ? "w-[280px] sm:w-[320px] h-[500px] sm:h-[570px]"
                  : aspectRatio === "1:1"
                  ? "w-[360px] h-[360px]"
                  : "w-[480px] h-[270px]"
              } ${canvasBg === "black" ? "bg-black" : canvasBg === "sand" ? "bg-[#F8F7F4]" : "bg-black"}`}
            >
              {layoutMode === "split-screen" ? (
                /* --- OPUSCLIP DUAL-SPEAKER STACKED SPLIT SCREEN --- */
                <div className="relative w-full h-full flex flex-col overflow-hidden select-none">
                  {/* Top Video Pane (Speaker 1) */}
                  <div
                    style={{ height: `${splitRatio}%` }}
                    className="relative w-full overflow-hidden border-b-2 border-dashed border-[#FFC700] cursor-ew-resize group bg-black"
                    onMouseDown={handleMouseDownTopVideo}
                    title="Drag horizontally to pan speaker 1"
                  >
                    <video
                      ref={videoTopRef}
                      src={clip?.videoFilePath ? `/api/media?file=${encodeURIComponent(clip.videoFilePath)}` : clip?.videoUrl}
                      className="absolute max-w-none h-full object-cover transition-transform"
                      style={{
                        width: `${topZoom * 100}%`,
                        transform: `scale(${topZoom})`,
                        transformOrigin: `${topCropX}% 50%`,
                      }}
                      playsInline
                      muted
                    />
                    <div className="absolute top-2 left-2 px-2 py-0.5 bg-black/85 text-[9px] font-black uppercase text-[#FFC700] border border-black pointer-events-none flex items-center gap-1">
                      <Move className="w-2.5 h-2.5" />
                      <span>TOP: {topCropX}% · {topZoom.toFixed(1)}X</span>
                    </div>
                  </div>

                  {/* Interactive Draggable Split Divider */}
                  <div
                    className="h-3 bg-[#FFC700] border-y-2 border-black cursor-row-resize flex items-center justify-center z-30 hover:bg-[#FF5500] transition-colors"
                    onMouseDown={handleMouseDownDivider}
                    title="Drag up/down to adjust split height"
                  >
                    <div className="w-10 h-1 bg-black rounded-full" />
                  </div>

                  {/* Bottom Video Pane (Speaker 2 / Reaction) */}
                  <div
                    style={{ height: `${100 - splitRatio}%` }}
                    className="relative w-full overflow-hidden cursor-ew-resize group bg-black"
                    onMouseDown={handleMouseDownBotVideo}
                    title="Drag horizontally to pan speaker 2"
                  >
                    <video
                      ref={videoRef}
                      onTimeUpdate={handleTimeUpdate}
                      src={clip?.videoFilePath ? `/api/media?file=${encodeURIComponent(clip.videoFilePath)}` : clip?.videoUrl}
                      className="absolute max-w-none h-full object-cover transition-transform"
                      style={{
                        width: `${botZoom * 100}%`,
                        transform: `scale(${botZoom})`,
                        transformOrigin: `${botCropX}% 50%`,
                      }}
                      playsInline
                      muted={isMuted}
                    />
                    <div className="absolute bottom-2 left-2 px-2 py-0.5 bg-black/85 text-[9px] font-black uppercase text-white border border-black pointer-events-none flex items-center gap-1">
                      <Move className="w-2.5 h-2.5" />
                      <span>BOT: {botCropX}% · {botZoom.toFixed(1)}X</span>
                    </div>
                  </div>

                  {/* Direct Draggable Subtitle Box on Canvas */}
                  {activeWord && (
                    <div
                      onMouseDown={handleMouseDownCaption}
                      className={`absolute left-0 right-0 z-40 px-3 text-center cursor-ns-resize transition-all ${
                        isDraggingCaption ? "scale-105" : ""
                      }`}
                      style={{ top: `${captionPositionY}%` }}
                    >
                      <div className="inline-block px-3 py-1 bg-black/90 border-2 border-white shadow-[2px_2px_0px_#000000]">
                        <span
                          className="font-black tracking-tight select-none"
                          style={{
                            fontFamily,
                            fontSize: fontSize === "sm" ? "14px" : fontSize === "md" ? "18px" : "22px",
                            color: highlightColor,
                            WebkitTextStroke: `${strokeWidth}px ${strokeColor}`,
                            textTransform: isUppercase ? "uppercase" : "none",
                          }}
                        >
                          {activeWord.text}
                        </span>
                      </div>
                      <div className="text-[8px] font-mono text-[#FFC700] uppercase font-bold tracking-widest mt-0.5 pointer-events-none opacity-80">
                        ↕ DRAG CAPTION ({captionPositionY}%)
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* Standard Single Camera Canvas */
                <div className="relative w-full h-full flex items-center justify-center overflow-hidden">
                  <video
                    ref={videoRef}
                    onTimeUpdate={handleTimeUpdate}
                    src={clip?.renderedVideoUrl || clip?.videoUrl}
                    className="w-full h-full object-cover"
                    style={{
                      transform: `scale(${zoom / 100}) translate(${posX}px, ${posY}px) rotate(${rotation}deg) scaleX(${flipH ? -1 : 1})`,
                      filter: `brightness(${100 + brightness}%) contrast(${100 + contrast}%) saturate(${100 + saturation}%)`,
                    }}
                    playsInline
                    muted={isMuted}
                  />

                  {/* Draggable Subtitle Overlay */}
                  {activeWord && (
                    <div
                      onMouseDown={handleMouseDownCaption}
                      className="absolute left-0 right-0 z-40 px-3 text-center cursor-ns-resize"
                      style={{ top: `${captionPositionY}%` }}
                    >
                      <div className="inline-block px-3 py-1 bg-black/90 border-2 border-white shadow-[2px_2px_0px_#000000]">
                        <span
                          className="font-black tracking-tight"
                          style={{
                            fontFamily,
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
              )}

              {/* Social UI Safe Zone Guide */}
              {safeZoneOverlay && (
                <div className="absolute inset-0 pointer-events-none z-30 flex flex-col justify-between p-3 border-2 border-dashed border-[#FFC700] bg-black/10">
                  <div className="text-[9px] font-black uppercase text-black bg-[#FFC700] px-2 py-0.5 border border-black self-start">
                    SAFE ZONE GUIDE
                  </div>
                  <div className="self-end space-y-2 mr-1 mb-6 opacity-85">
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
                </div>
              )}
            </div>
          </div>

          {/* Bottom Scrub Timeline & In/Out Trimmer */}
          <div className="bg-white border-t-2 border-black p-3 z-30">
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
                    if (videoTopRef.current) videoTopRef.current.currentTime = 0;
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

              {/* In/Out Trim display */}
              <div className="flex items-center gap-2 text-[10px] font-mono font-bold bg-[#F8F7F4] border border-black px-2 py-0.5">
                <span>IN: {formatTime(trimStart)}</span>
                <span>•</span>
                <span>OUT: {formatTime(trimEnd)}</span>
                <span>•</span>
                <span className="text-[#FF5500]">DUR: {formatTime(trimEnd - trimStart)}</span>
              </div>
            </div>

            {/* Scrubber Range */}
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
                if (videoTopRef.current) videoTopRef.current.currentTime = val;
              }}
              className="w-full h-2 bg-[#E0DDD5] border border-black appearance-none cursor-pointer accent-[#FFC700] mb-2"
            />
          </div>
        </main>

        {/* Right Column: Detailed Tool Inspector (Split, Captions, Transform, Filters) */}
        <aside className="w-full lg:w-80 bg-white border-l-2 border-black flex flex-col h-[380px] lg:h-auto overflow-hidden">
          {/* Tabs */}
          <div className="flex border-b-2 border-black bg-[#F8F7F4]">
            {[
              { id: "layout", label: "Split", icon: Split },
              { id: "captions", label: "Style", icon: Type },
              { id: "transform", label: "Frame", icon: Crop },
              { id: "filters", label: "Grade", icon: Sun },
            ].map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex-1 py-2.5 text-xs font-black uppercase flex items-center justify-center gap-1 transition-all cursor-pointer ${
                    activeTab === tab.id
                      ? "bg-white text-black border-b-2 border-black font-black"
                      : "text-neutral-600 hover:text-black"
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* TAB 1: LAYOUT & SPLIT CONTROLS */}
            {activeTab === "layout" && (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-black uppercase tracking-wider block mb-1 text-black">
                    Layout Mode
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      { id: "split-screen", label: "Dual Split" },
                      { id: "single-focus", label: "Auto Pan" },
                      { id: "blurred-fit", label: "Blur Fit" },
                      { id: "manual-pan", label: "Center" },
                    ].map((mode) => (
                      <button
                        key={mode.id}
                        onClick={() => setLayoutMode(mode.id as any)}
                        className={`py-2 text-xs font-black uppercase border-2 border-black rounded transition ${
                          layoutMode === mode.id
                            ? "bg-[#FFC700] text-black shadow-[2px_2px_0px_#000000]"
                            : "bg-[#F8F7F4] text-black hover:bg-white"
                        }`}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>
                </div>

                {layoutMode === "split-screen" && (
                  <div className="space-y-3 bg-[#FFFBEA] p-3 border-2 border-black rounded-lg">
                    <span className="text-xs font-black uppercase tracking-wider text-black block">
                      Split-Screen Positioning
                    </span>

                    {/* Split Ratio */}
                    <div>
                      <div className="flex justify-between text-xs font-black uppercase text-black mb-1">
                        <span>Divider Height</span>
                        <span className="font-mono">{splitRatio}% / {100 - splitRatio}%</span>
                      </div>
                      <input
                        type="range"
                        min="25"
                        max="75"
                        value={splitRatio}
                        onChange={(e) => setSplitRatio(Number(e.target.value))}
                        className="w-full h-2 bg-[#E0DDD5] border border-black appearance-none cursor-pointer accent-[#FFC700]"
                      />
                    </div>

                    {/* Top Speaker Pan */}
                    <div>
                      <div className="flex justify-between text-xs font-black uppercase text-black mb-1">
                        <span>Top Speaker (Pan X)</span>
                        <span className="font-mono">{topCropX}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={topCropX}
                        onChange={(e) => setTopCropX(Number(e.target.value))}
                        className="w-full h-2 bg-[#E0DDD5] border border-black appearance-none cursor-pointer accent-[#FFC700]"
                      />
                    </div>

                    {/* Bottom Speaker Pan */}
                    <div>
                      <div className="flex justify-between text-xs font-black uppercase text-black mb-1">
                        <span>Bottom Speaker (Pan X)</span>
                        <span className="font-mono">{botCropX}%</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={botCropX}
                        onChange={(e) => setBotCropX(Number(e.target.value))}
                        className="w-full h-2 bg-[#E0DDD5] border border-black appearance-none cursor-pointer accent-[#FFC700]"
                      />
                    </div>

                    {/* Zoom Sliders */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <span className="text-[10px] font-black uppercase block mb-1">Top Zoom</span>
                        <input
                          type="range"
                          min="1.0"
                          max="2.5"
                          step="0.1"
                          value={topZoom}
                          onChange={(e) => setTopZoom(Number(e.target.value))}
                          className="w-full h-2 bg-[#E0DDD5] border border-black appearance-none accent-[#FFC700]"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] font-black uppercase block mb-1">Bot Zoom</span>
                        <input
                          type="range"
                          min="1.0"
                          max="2.5"
                          step="0.1"
                          value={botZoom}
                          onChange={(e) => setBotZoom(Number(e.target.value))}
                          className="w-full h-2 bg-[#E0DDD5] border border-black appearance-none accent-[#FFC700]"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 2: CAPTION STYLES */}
            {activeTab === "captions" && (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-black uppercase tracking-wider block mb-1.5 text-black">
                    Preset Style
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {[
                      { id: "hormozi", name: "Alex Hormozi" },
                      { id: "beast", name: "MrBeast Punch" },
                      { id: "neon", name: "High Contrast" },
                      { id: "clean", name: "Clean Minimal" },
                    ].map((p) => (
                      <button
                        key={p.id}
                        onClick={() => setCaptionStyle(p.id as any)}
                        className={`p-2 border-2 border-black rounded text-xs font-black uppercase text-left transition ${
                          captionStyle === p.id
                            ? "bg-[#FFC700] text-black shadow-[2px_2px_0px_#000000]"
                            : "bg-[#F8F7F4] text-black hover:bg-white"
                        }`}
                      >
                        {p.name}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-black uppercase tracking-wider block mb-1 text-black">
                    Vertical Position ({captionPositionY}%)
                  </label>
                  <input
                    type="range"
                    min="15"
                    max="85"
                    value={captionPositionY}
                    onChange={(e) => setCaptionPositionY(Number(e.target.value))}
                    className="w-full h-2 bg-[#E0DDD5] border border-black appearance-none cursor-pointer accent-[#FFC700]"
                  />
                  <div className="flex justify-between text-[10px] font-mono font-bold mt-1 text-neutral-600">
                    <button onClick={() => setCaptionPositionY(30)} className="hover:underline">Top 30%</button>
                    <button onClick={() => setCaptionPositionY(50)} className="hover:underline">Seam 50%</button>
                    <button onClick={() => setCaptionPositionY(75)} className="hover:underline">Bottom 75%</button>
                  </div>
                </div>

                <div>
                  <label className="text-xs font-black uppercase tracking-wider block mb-1 text-black">
                    Highlight Color
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

                <div className="flex items-center justify-between p-2.5 bg-[#F8F7F4] border-2 border-black rounded">
                  <span className="text-xs font-black uppercase text-black">All UPPERCASE</span>
                  <button
                    onClick={() => setIsUppercase(!isUppercase)}
                    className={`px-3 py-1 border-2 border-black text-xs font-black uppercase cursor-pointer ${
                      isUppercase ? "bg-[#FFC700] text-black" : "bg-white text-black"
                    }`}
                  >
                    {isUppercase ? "YES" : "NO"}
                  </button>
                </div>
              </div>
            )}

            {/* TAB 3: TRANSFORM & CANAS */}
            {activeTab === "transform" && (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-black uppercase tracking-wider block mb-1 text-black">
                    Aspect Ratio
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {["9:16", "1:1", "16:9"].map((r) => (
                      <button
                        key={r}
                        onClick={() => setAspectRatio(r as any)}
                        className={`py-1.5 border-2 border-black rounded text-xs font-black uppercase ${
                          aspectRatio === r ? "bg-[#FFC700] text-black shadow-[2px_2px_0px_#000000]" : "bg-[#F8F7F4] text-black"
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between p-2.5 bg-[#F8F7F4] border-2 border-black rounded">
                  <span className="text-xs font-black uppercase text-black">Social Safe Zone Guide</span>
                  <button
                    onClick={() => setSafeZoneOverlay(!safeZoneOverlay)}
                    className={`px-3 py-1 border-2 border-black text-xs font-black uppercase cursor-pointer ${
                      safeZoneOverlay ? "bg-[#FFC700] text-black" : "bg-white text-black"
                    }`}
                  >
                    {safeZoneOverlay ? "ON" : "OFF"}
                  </button>
                </div>
              </div>
            )}

            {/* TAB 4: FILTERS */}
            {activeTab === "filters" && (
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-black uppercase tracking-wider block mb-1 text-black">
                    Color Presets
                  </label>
                  <div className="grid grid-cols-3 gap-1">
                    {["none", "viral", "warm", "moody", "cold", "vibrant"].map((f) => (
                      <button
                        key={f}
                        onClick={() => setActiveFilter(f as any)}
                        className={`py-1.5 border-2 border-black rounded text-xs font-black uppercase ${
                          activeFilter === f ? "bg-[#FFC700] text-black shadow-[2px_2px_0px_#000000]" : "bg-[#F8F7F4] text-black"
                        }`}
                      >
                        {f}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Export Confirmation Modal */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white max-w-sm w-full p-6 border-4 border-black shadow-[8px_8px_0px_#000000] text-black">
            <h3 className="text-base font-black uppercase text-black mb-1">Export Video</h3>
            <p className="text-xs text-[#555555] font-bold mb-4">
              Render with manual transforms, custom split panes, and burned subtitles.
            </p>

            <div className="p-3 bg-[#F8F7F4] border-2 border-black text-xs font-bold space-y-1 mb-4">
              <div className="flex justify-between">
                <span className="text-[#666666]">Layout:</span>
                <span className="font-black uppercase">{layoutMode}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#666666]">Split Ratio:</span>
                <span className="font-black">{splitRatio}% / {100 - splitRatio}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#666666]">Speakers:</span>
                <span className="font-black">Top {topCropX}% • Bot {botCropX}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#666666]">Subtitles:</span>
                <span className="font-black uppercase">{captionStyle} (Pos: {captionPositionY}%)</span>
              </div>
            </div>

            {isExporting ? (
              <div className="p-3 bg-[#FFFBEA] border-2 border-black text-center mb-4">
                <div className="text-xs font-black uppercase mb-1 flex items-center justify-center gap-1.5">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Rendering In Progress</span>
                </div>
                <div className="text-[11px] font-mono text-neutral-700">{exportMessage}</div>
              </div>
            ) : null}

            <div className="flex gap-2">
              <button
                type="button"
                disabled={isExporting}
                onClick={() => setShowExportModal(false)}
                className="flex-1 py-2 border-2 border-black bg-white hover:bg-[#F8F7F4] text-xs font-black uppercase cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isExporting}
                onClick={handleExport}
                className="flex-1 py-2 bg-[#FFC700] hover:bg-[#FF5500] hover:text-white border-2 border-black text-xs font-black uppercase shadow-[3px_3px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isExporting ? "Processing..." : "Render & Save"}
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
        <div className="min-h-screen bg-[#F8F7F4] text-black p-8 font-black uppercase flex items-center justify-center">
          Loading Opus Studio Editor...
        </div>
      }
    >
      <EditorContent />
    </Suspense>
  );
}
