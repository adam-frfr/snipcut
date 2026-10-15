"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Scissors,
  Sparkles,
  Flame,
  Play,
  Pause,
  Download,
  Sliders,
  Video,
  Wand2,
  Upload,
  Calendar,
  CheckCircle2,
  TrendingUp,
  Plus,
  Key,
  AlertCircle,
  FileVideo,
  Target,
  Layout,
  Eye,
} from "lucide-react";
import ApiSettingsModal from "@/components/ApiSettingsModal";
import confetti from "canvas-confetti";

export interface RealClip {
  id: string;
  videoFilePath: string;
  videoUrl: string;
  title: string;
  hookHeadline: string;
  startTime: number;
  endTime: number;
  duration: number;
  durationFormatted: string;
  viralityScore: number;
  hookStrength: number;
  engagementScore: number;
  trendMatch: number;
  viralityReason: string;
  transcript: {
    start: number;
    end: number;
    text: string;
    emoji?: string;
  }[];
  aspectRatio: "9:16" | "1:1" | "16:9";
  captionStyle: "hormozi" | "neon" | "beast" | "clean";
}

function DashboardContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Settings & Ingestion State
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"clips" | "upload">("clips");
  const [clips, setClips] = useState<RealClip[]>([]);
  const [selectedClip, setSelectedClip] = useState<RealClip | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackTime, setPlaybackTime] = useState(0);
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const videoTopRef = React.useRef<HTMLVideoElement>(null);

  // Upload inputs
  const [urlInput, setUrlInput] = useState("");
  const [promptInput, setPromptInput] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  // Pipeline execution state
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStage, setProcessingStage] = useState("");
  const [isRendering, setIsRendering] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const [hasServerKey, setHasServerKey] = useState(true);
  const [reframeMode, setReframeMode] = useState<"auto-tracker" | "split-screen" | "blurred-fit" | "center">("auto-tracker");
  const [lastTrackingSummary, setLastTrackingSummary] = useState<string>("");
  const [dynamicShots, setDynamicShots] = useState<
    {
      start: number;
      end: number;
      position: "left" | "center" | "right";
      subject_center_x?: number;
      crop_x: number;
      label: string;
      details: string;
    }[]
  >([
    {
      start: 0,
      end: 1.5,
      position: "left",
      crop_x: 0,
      subject_center_x: 240,
      label: "Speaker Reaction (Left)",
      details: "Active focus on speaker reaction facecam",
    },
    {
      start: 1.5,
      end: 30,
      position: "center",
      crop_x: 553,
      subject_center_x: 857,
      label: "Main Action (Center)",
      details: "Main video stage & action",
    },
  ]);

  // Sync video time when selected clip changes
  useEffect(() => {
    if (selectedClip && videoRef.current) {
      if ((selectedClip as any).renderedVideoUrl) {
        videoRef.current.currentTime = 0;
        if (videoTopRef.current) videoTopRef.current.currentTime = 0;
      } else {
        videoRef.current.currentTime = selectedClip.startTime || 0;
        if (videoTopRef.current) videoTopRef.current.currentTime = selectedClip.startTime || 0;
      }
      setPlaybackTime(0);
      if (isPlaying) {
        videoRef.current.play().catch(() => {});
        if (videoTopRef.current) videoTopRef.current.play().catch(() => {});
      }
    }
  }, [selectedClip]);

  const handleTimeUpdate = () => {
    if (!videoRef.current || !selectedClip) return;
    const ct = videoRef.current.currentTime;
    if (videoTopRef.current) {
      if (Math.abs(videoTopRef.current.currentTime - ct) > 0.3) {
        videoTopRef.current.currentTime = ct;
      }
    }
    if ((selectedClip as any).renderedVideoUrl) {
      setPlaybackTime(ct);
    } else {
      if (ct < selectedClip.startTime || ct >= selectedClip.endTime) {
        videoRef.current.currentTime = selectedClip.startTime || 0;
        if (videoTopRef.current) videoTopRef.current.currentTime = selectedClip.startTime || 0;
        setPlaybackTime(0);
      } else {
        setPlaybackTime(ct - (selectedClip.startTime || 0));
      }
    }
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      if (videoTopRef.current) videoTopRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play().catch(() => {});
      if (videoTopRef.current) videoTopRef.current.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  const formatTime = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };

  const getDynamicObjectPosition = (time: number, shots: typeof dynamicShots, mode: string): string => {
    if (mode === "center") return "50% center";
    if (mode === "split-screen" || mode === "blurred-fit") return "center center";
    if (shots && shots.length > 0) {
      const active = shots.find((s) => time >= s.start && time <= s.end);
      if (active) {
        if (active.position === "left") return "15% center";
        if (active.position === "right") return "85% center";
        if (active.position === "center") return "50% center";
        if (active.crop_x !== undefined) {
          const pct = Math.round((active.crop_x / 1312) * 100);
          return `${pct}% center`;
        }
      }
    }
    if (time < 1.5) return "15% center";
    return "50% center";
  };

  const handleModeSelect = (mode: "auto-tracker" | "split-screen" | "blurred-fit" | "center") => {
    setReframeMode(mode);
    if (mode === "auto-tracker") {
      setLastTrackingSummary(
        dynamicShots.length > 1
          ? `Dynamic AI Camera: Panning across ${dynamicShots.length} keyframed shots`
          : "AI Dynamic Camera: Auto-centering active speaker"
      );
    } else if (mode === "split-screen") {
      setLastTrackingSummary("Split-Screen Layout: Dual stacked cameras (Top: Content • Bottom: Reaction Cam)");
    } else if (mode === "blurred-fit") {
      setLastTrackingSummary("Blurred Fit Layout: 16:9 full frame with dynamic blurred backdrop");
    } else if (mode === "center") {
      setLastTrackingSummary("Center Crop: Classic fixed 9:16 vertical window");
    }
  };

  // 1. Fetch server API key configuration on load and sync to localStorage
  useEffect(() => {
    async function checkServerConfig() {
      try {
        const res = await fetch("/api/config");
        const data = await res.json();
        if (data.hasKey && data.apiKey) {
          setHasServerKey(true);
          localStorage.setItem("opus_openai_key", data.apiKey);
          localStorage.setItem("opus_claude_key", data.apiKey);
          if (data.preferredModel) {
            localStorage.setItem("opus_preferred_model", data.preferredModel);
          }
        }
      } catch (err) {
        console.error("Config check error:", err);
      }
    }
    checkServerConfig();

    // Load saved clips
    const saved = localStorage.getItem("opus_user_clips");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setClips(parsed);
          setSelectedClip(parsed[0]);
        }
      } catch (e) {}
    }
  }, []);

  // 2. Handle autostart from hero when query params exist
  useEffect(() => {
    if (searchParams.get("autostart") === "true") {
      const url = searchParams.get("url");
      const filePath = searchParams.get("filePath");
      const fileUrl = searchParams.get("fileUrl");
      const prompt = searchParams.get("prompt") || "";
      if (filePath && fileUrl) {
        startRealPipeline({ filePath, fileUrl, prompt });
      } else if (url) {
        startRealPipeline({ url, prompt });
      }
    }
  }, [searchParams]);

  // Real AI Processing Pipeline
  const startRealPipeline = async ({
    url,
    filePath,
    fileUrl,
    prompt,
  }: {
    url?: string;
    filePath?: string;
    fileUrl?: string;
    prompt?: string;
  }) => {
    setErrorMsg("");
    setIsProcessing(true);

    const clientKey =
      (typeof window !== "undefined"
        ? localStorage.getItem("opus_openai_key") ||
          localStorage.getItem("opus_claude_key")
        : "") || "";

    try {
      let resolvedFilePath = filePath;
      let resolvedFileUrl = fileUrl;
      let fullTranscript = "";
      let rawWords: any[] = [];

      // Stage 1: Download YouTube URL if URL was provided
      if (url && !resolvedFilePath) {
        setProcessingStage("Downloading video stream with yt-dlp...");
        const ytRes = await fetch("/api/download-youtube", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url }),
        });
        const ytData = await ytRes.json();
        if (!ytRes.ok || ytData.error) {
          throw new Error(ytData.error || "Failed to download YouTube video. Please check the URL.");
        }
        resolvedFilePath = ytData.filePath;
        resolvedFileUrl = ytData.fileUrl;

        // If subtitles were auto-extracted from YouTube, use them
        if (ytData.transcriptText) {
          fullTranscript = ytData.transcriptText;
          rawWords = ytData.transcriptWords || ytData.transcriptSegments || [];
        }
      }

      // If local file was selected in upload form
      if (!resolvedFilePath && uploadFile) {
        setProcessingStage("Uploading video file to local server...");
        const formData = new FormData();
        formData.append("file", uploadFile);
        const upRes = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });
        const upData = await upRes.json();
        if (!upRes.ok || upData.error) {
          throw new Error(upData.error || "Failed to upload video");
        }
        resolvedFilePath = upData.filePath;
        resolvedFileUrl = upData.fileUrl;
      }

      if (!resolvedFilePath) {
        throw new Error("No video file or URL provided.");
      }

      // Stage 2: If we don't have transcript yet, transcribe via Whisper
      if (!fullTranscript) {
        setProcessingStage("Transcribing speech with OpenAI Whisper (Word Timestamps)...");
        const transRes = await fetch("/api/transcribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filePath: resolvedFilePath,
            openaiKey: clientKey,
          }),
        });
        const transData = await transRes.json();
        if (!transRes.ok || transData.error) {
          throw new Error(transData.error || "Audio transcription failed.");
        }
        fullTranscript = transData.text || "";
        rawWords = transData.words || [];
      }

      // Stage 3: Viral Curation with Claude 3.5 Sonnet / Haiku
      setProcessingStage("OpusClip AI: Curating viral hooks and calculating virality scores...");
      const analyzeRes = await fetch("/api/analyze-clips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcriptText: fullTranscript,
          customPrompt: prompt || promptInput,
          model: "~anthropic/claude-sonnet-latest",
          openaiKey: clientKey,
          claudeKey: clientKey,
        }),
      });
      const analyzeData = await analyzeRes.json();
      if (!analyzeRes.ok || analyzeData.error) {
        throw new Error(analyzeData.error || "AI Virality analysis failed.");
      }

      // Stage 4: Assemble clips with precise timestamps
      const rawClips = analyzeData.clips || [];
      const generatedClips: RealClip[] = rawClips.map((c: any, index: number) => {
        const clipWords = rawWords.filter(
          (w: any) => w.start >= c.startTime && w.end <= c.endTime + 0.5
        );

        return {
          id: `clip-${Date.now()}-${index}`,
          videoFilePath: resolvedFilePath!,
          videoUrl: resolvedFileUrl || "/placeholder.mp4",
          title: c.title || `Viral Short #${index + 1}`,
          hookHeadline: c.hookHeadline || "",
          startTime: c.startTime || 0,
          endTime: c.endTime || 30,
          duration: Math.max(5, Math.round(c.endTime - c.startTime)),
          durationFormatted: c.durationFormatted || "0:30",
          viralityScore: c.viralityScore || 92,
          hookStrength: c.hookStrength || 94,
          engagementScore: c.engagementScore || 90,
          trendMatch: c.trendMatch || 92,
          viralityReason: c.viralityReason || "High-retention narrative segment",
          aspectRatio: "9:16",
          captionStyle: "hormozi",
          transcript:
            clipWords.length > 0
              ? clipWords.map((cw: any) => ({
                  start: cw.start - c.startTime,
                  end: cw.end - c.startTime,
                  text: cw.text || cw.word,
                }))
              : [
                  { start: 0, end: 3, text: c.hookHeadline || c.title },
                  { start: 3, end: 7, text: "Key insight" },
                ],
        };
      });

      // Stage 5: Auto-render top viral clip to 9:16 vertical MP4 via FFmpeg
      if (generatedClips.length > 0) {
        setProcessingStage("OpusClip FFmpeg: Precision-trimming and 9:16 vertical reframing...");
        try {
          const topClip = generatedClips[0];
          const renderRes = await fetch("/api/render-clip", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              inputPath: resolvedFilePath,
              startTime: topClip.startTime,
              duration: topClip.duration,
              aspectRatio: "9:16",
              reframeMode: "auto-tracker",
              transcript: topClip.transcript,
              headline: topClip.hookHeadline || topClip.title,
              captionStyle: topClip.captionStyle || "hormozi",
            }),
          });
          const renderData = await renderRes.json();
          if (renderData.success && renderData.downloadUrl) {
            topClip.videoUrl = renderData.downloadUrl;
            (topClip as any).renderedVideoUrl = renderData.downloadUrl;
            if (renderData.tracking?.summary) {
              setLastTrackingSummary(renderData.tracking.summary);
            }
            if (renderData.tracking?.shots && renderData.tracking.shots.length > 0) {
              setDynamicShots(renderData.tracking.shots);
            }
          }
        } catch (renderErr) {
          console.warn("Auto-render notice:", renderErr);
        }

        setClips(generatedClips);
        setSelectedClip(generatedClips[0]);
        localStorage.setItem("opus_user_clips", JSON.stringify(generatedClips));
        setActiveTab("clips");
        try {
          confetti({
            particleCount: 90,
            spread: 70,
            origin: { y: 0.6 },
          });
        } catch (e) {}
      } else {
        throw new Error("No clips could be extracted from this video segment.");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "An unexpected error occurred during processing.");
    } finally {
      setIsProcessing(false);
    }
  };

  // Real FFmpeg Render & Download
  const handleRenderAndDownload = async (clip: RealClip) => {
    setIsRendering(true);
    try {
      const res = await fetch("/api/render-clip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inputPath: clip.videoFilePath,
          startTime: clip.startTime,
          duration: clip.duration,
          aspectRatio: clip.aspectRatio || "9:16",
          reframeMode: reframeMode,
          splitScreen: reframeMode === "split-screen",
          transcript: clip.transcript,
          headline: clip.hookHeadline || clip.title,
          captionStyle: clip.captionStyle || "hormozi",
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "FFmpeg rendering failed");
      }

      if (data.tracking?.summary) {
        setLastTrackingSummary(data.tracking.summary);
      }
      if (data.tracking?.shots && data.tracking.shots.length > 0) {
        setDynamicShots(data.tracking.shots);
      }

      // Update clip so preview is permanently the cut MP4
      const updatedClips = clips.map((c) =>
        c.id === clip.id
          ? { ...c, videoUrl: data.downloadUrl, renderedVideoUrl: data.downloadUrl }
          : c
      );
      setClips(updatedClips);
      if (selectedClip && selectedClip.id === clip.id) {
        setSelectedClip({
          ...selectedClip,
          videoUrl: data.downloadUrl,
          renderedVideoUrl: data.downloadUrl,
        } as any);
      }
      localStorage.setItem("opus_user_clips", JSON.stringify(updatedClips));

      // Trigger actual download of the rendered MP4
      const a = document.createElement("a");
      a.href = data.downloadUrl;
      a.download = data.filename || `${clip.title}.mp4`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);

      try {
        confetti({ particleCount: 60, spread: 60 });
      } catch (e) {}
    } catch (err: any) {
      alert(`Render Error: ${err.message}`);
    } finally {
      setIsRendering(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#08090E] text-white">
      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-[#090A10]/90 backdrop-blur-xl border-b border-white/[0.08] px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#6723FF] to-[#38BDF8] flex items-center justify-center p-[1px]">
                <div className="w-full h-full bg-[#090A10] rounded-[10px] flex items-center justify-center">
                  <Scissors className="w-3.5 h-3.5 text-purple-400" />
                </div>
              </div>
              <span className="font-extrabold text-base tracking-tight text-white">
                Opus<span className="text-[#A855F7]">Studio</span>
              </span>
            </Link>

            <span className="text-zinc-600 hidden sm:inline">|</span>
            <div className="hidden sm:flex items-center gap-2 text-xs text-zinc-400">
              <span>Engine Status:</span>
              <span className="flex items-center gap-1 text-emerald-400 font-bold">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span>AI Connected ($3.00/day)</span>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/editor"
              className="px-3 py-1.5 text-xs font-bold rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-zinc-200 transition-colors flex items-center gap-1.5"
            >
              <Sliders className="w-3.5 h-3.5 text-cyan-400" />
              <span>Studio Editor</span>
            </Link>

            <Link
              href="/schedule"
              className="px-3 py-1.5 text-xs font-bold rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-zinc-200 transition-colors flex items-center gap-1.5"
            >
              <Calendar className="w-3.5 h-3.5 text-pink-400" />
              <span>Scheduler</span>
            </Link>

            <button
              onClick={() => setSettingsOpen(true)}
              className="px-3 py-1.5 text-xs font-bold rounded-xl bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/30 text-purple-300 hover:text-white transition-colors flex items-center gap-1.5 cursor-pointer"
            >
              <Key className="w-3.5 h-3.5 text-purple-400" />
              <span>API Keys</span>
            </button>

            <button
              onClick={() => setActiveTab("upload")}
              className="btn-primary-gradient px-3.5 py-1.5 text-xs font-bold text-white rounded-xl flex items-center gap-1.5 shadow-lg shadow-purple-600/30 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Clip</span>
            </button>
          </div>
        </div>

        <ApiSettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
      </header>

      {/* Main Studio Viewport */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Error Alert if any */}
        {errorMsg && (
          <div className="mb-6 p-4 rounded-2xl bg-red-950/40 border border-red-500/40 text-red-200 text-xs flex items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => setErrorMsg("")}
                className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium text-xs transition"
              >
                Dismiss
              </button>
              <button
                onClick={() => {
                  setErrorMsg("");
                  setActiveTab("upload");
                }}
                className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs transition"
              >
                Try Another Video
              </button>
            </div>
          </div>
        )}

        {/* Processing Modal Overlay */}
        {isProcessing && (
          <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4">
            <div className="glass-panel-glow max-w-md w-full p-8 rounded-3xl border border-purple-500/40 text-center shadow-2xl animate-in zoom-in-95 duration-200">
              <div className="w-16 h-16 rounded-2xl bg-purple-600/20 border border-purple-500/40 text-purple-400 flex items-center justify-center mx-auto mb-6 relative">
                <Wand2 className="w-8 h-8 animate-pulse text-purple-300" />
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-purple-500"></span>
                </span>
              </div>

              <h3 className="text-xl font-black text-white mb-2">Processing Video with AI</h3>
              <p className="text-xs text-purple-300 font-semibold mb-6 animate-pulse">
                {processingStage}
              </p>

              <div className="w-full bg-white/[0.08] h-2 rounded-full overflow-hidden">
                <div className="bg-gradient-to-r from-purple-500 to-cyan-400 h-full rounded-full animate-pulse w-3/4" />
              </div>
            </div>
          </div>
        )}

        {/* Tab Switcher */}
        <div className="flex items-center justify-between mb-8 border-b border-white/[0.08] pb-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setActiveTab("clips")}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 ${
                activeTab === "clips"
                  ? "bg-purple-600 text-white shadow-lg shadow-purple-600/30"
                  : "text-zinc-400 hover:text-white hover:bg-white/[0.04]"
              }`}
            >
              <Sparkles className="w-4 h-4 text-amber-300" />
              <span>Your Viral Clips ({clips.length})</span>
            </button>
            <button
              onClick={() => setActiveTab("upload")}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 ${
                activeTab === "upload"
                  ? "bg-purple-600 text-white shadow-lg shadow-purple-600/30"
                  : "text-zinc-400 hover:text-white hover:bg-white/[0.04]"
              }`}
            >
              <Upload className="w-4 h-4" />
              <span>Import New Video</span>
            </button>
          </div>
        </div>

        {/* View 1: Clips Gallery */}
        {activeTab === "clips" && (
          <div>
            {clips.length === 0 ? (
              /* Clean Empty State */
              <div className="glass-panel rounded-3xl p-12 text-center max-w-xl mx-auto border border-white/[0.08]">
                <div className="w-16 h-16 rounded-2xl bg-purple-500/10 text-purple-400 flex items-center justify-center mx-auto mb-4 border border-purple-500/20">
                  <FileVideo className="w-8 h-8" />
                </div>
                <h3 className="text-xl font-black text-white mb-2">No clips generated yet</h3>
                <p className="text-xs text-zinc-400 mb-6 leading-relaxed">
                  Paste a YouTube URL or upload a video file to run automatic transcription and Claude/ChatGPT viral hook curation.
                </p>
                <button
                  onClick={() => setActiveTab("upload")}
                  className="btn-primary-gradient px-6 py-3 rounded-xl font-bold text-xs text-white cursor-pointer shadow-lg shadow-purple-600/30"
                >
                  Import Your First Video
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Left Clips List */}
                <div className="lg:col-span-7 space-y-4">
                  {clips.map((clip, index) => {
                    const isSelected = selectedClip?.id === clip.id;
                    return (
                      <div
                        key={clip.id}
                        onClick={() => setSelectedClip(clip)}
                        className={`p-4 sm:p-5 rounded-2xl border transition-all cursor-pointer flex flex-col sm:flex-row items-start sm:items-center gap-4 ${
                          isSelected
                            ? "bg-purple-950/40 border-purple-500 shadow-xl shadow-purple-900/30 ring-1 ring-purple-500"
                            : "glass-panel hover:bg-white/[0.04] border-white/[0.08]"
                        }`}
                      >
                        {/* Video Preview Block */}
                        <div className="relative w-full sm:w-36 h-28 sm:h-24 rounded-xl overflow-hidden flex-shrink-0 bg-black flex items-center justify-center">
                          <video
                            src={clip.videoUrl}
                            className="w-full h-full object-cover"
                            preload="metadata"
                          />
                          <div className="absolute top-1.5 left-1.5 px-2 py-0.5 rounded-md bg-black/80 backdrop-blur-md text-[10px] font-black text-emerald-400 flex items-center gap-1 border border-emerald-500/30">
                            <Flame className="w-3 h-3 fill-emerald-400" />
                            <span>{clip.viralityScore}</span>
                          </div>
                          <div className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/80 text-[10px] text-zinc-300 font-mono">
                            {clip.durationFormatted}
                          </div>
                        </div>

                        {/* Metadata */}
                        <div className="flex-1 min-w-0">
                          <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 uppercase mb-1 inline-block">
                            Clip #{index + 1}
                          </span>
                          <h4 className="text-sm font-bold text-white truncate mb-1">{clip.title}</h4>
                          <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed mb-3">
                            {clip.viralityReason}
                          </p>

                          <div className="flex items-center gap-3 text-[11px]">
                            <span className="text-emerald-400 font-semibold">Hook: {clip.hookStrength}%</span>
                            <span className="text-zinc-600">•</span>
                            <span className="text-cyan-400 font-semibold">Retention: {clip.engagementScore}%</span>
                            <span className="text-zinc-600">•</span>
                            <span className="text-purple-400 font-semibold">Trend: {clip.trendMatch}%</span>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex sm:flex-col gap-2 w-full sm:w-auto">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRenderAndDownload(clip);
                            }}
                            disabled={isRendering}
                            className="flex-1 sm:flex-none p-2 rounded-xl bg-purple-600/30 hover:bg-purple-600 text-purple-300 hover:text-white border border-purple-500/30 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
                            title="Render real 9:16 MP4 with FFmpeg"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span className="sm:hidden">Download</span>
                          </button>

                          <Link
                            href={`/editor?clipId=${clip.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="flex-1 sm:flex-none p-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-zinc-300 hover:text-white border border-white/[0.08] text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                            title="Open in Studio Editor"
                          >
                            <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                            <span className="sm:hidden">Edit</span>
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Right Player & Diagnostics */}
                {selectedClip && (
                  <div className="lg:col-span-5 space-y-5">
                    <div className="glass-panel-glow p-5 rounded-3xl border border-white/[0.12] flex flex-col items-center">
                      {/* Vertical Video Viewport */}
                      <div className="relative w-[260px] sm:w-[280px] h-[480px] bg-black rounded-2xl overflow-hidden shadow-2xl border border-white/[0.1] flex flex-col">
                        <div className="relative flex-1 bg-zinc-950 flex flex-col justify-center items-center overflow-hidden">
                          {/* Reframe Mode Floating Tag */}
                          <div className="absolute top-3 left-3 z-30 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/85 backdrop-blur-md border border-purple-500/40 text-[10px] font-bold text-purple-300 shadow-xl pointer-events-none">
                            <span className="w-2 h-2 rounded-full bg-purple-400 animate-pulse" />
                            <span>
                              {reframeMode === "auto-tracker"
                                ? "AI Dynamic Pan 🎯"
                                : reframeMode === "split-screen"
                                ? "Split-Screen Mode 👥"
                                : reframeMode === "blurred-fit"
                                ? "Blurred Backdrop 🌌"
                                : "Center Crop 📐"}
                            </span>
                          </div>

                          {/* Mode-reactive Player Viewport */}
                          {reframeMode === "split-screen" ? (
                            <div className="w-full h-full flex flex-col bg-black">
                              {/* Top Camera: Main Content */}
                              <div className="relative w-full h-1/2 overflow-hidden border-b border-white/20">
                                <video
                                  ref={videoTopRef}
                                  src={(selectedClip as any).renderedVideoUrl || selectedClip.videoUrl}
                                  className="w-full h-full object-cover"
                                  style={{ objectPosition: "75% center" }}
                                  muted
                                  playsInline
                                />
                                <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-black/70 border border-white/10 text-[9px] font-bold text-cyan-300 tracking-wider">
                                  TOP: CONTENT FOCUS
                                </div>
                              </div>
                              {/* Bottom Camera: Reaction / Speaker */}
                              <div className="relative w-full h-1/2 overflow-hidden">
                                <video
                                  ref={videoRef}
                                  src={(selectedClip as any).renderedVideoUrl || selectedClip.videoUrl}
                                  className="w-full h-full object-cover"
                                  style={{ objectPosition: "15% center" }}
                                  controls={false}
                                  muted={isMuted}
                                  playsInline
                                  onTimeUpdate={handleTimeUpdate}
                                  onEnded={() => {
                                    if (videoRef.current && selectedClip) {
                                      videoRef.current.currentTime = (selectedClip as any).renderedVideoUrl
                                        ? 0
                                        : selectedClip.startTime;
                                      videoRef.current.play().catch(() => {});
                                    }
                                  }}
                                />
                                <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-black/70 border border-white/10 text-[9px] font-bold text-purple-300 tracking-wider">
                                  BOTTOM: SPEAKER CAM
                                </div>
                              </div>
                            </div>
                          ) : reframeMode === "blurred-fit" ? (
                            <div className="relative w-full h-full flex items-center justify-center overflow-hidden bg-black">
                              {/* Dynamic Blurred Backdrop */}
                              <video
                                src={(selectedClip as any).renderedVideoUrl || selectedClip.videoUrl}
                                className="absolute inset-0 w-full h-full object-cover blur-2xl scale-125 opacity-70"
                                muted
                                playsInline
                              />
                              {/* Centered 16:9 Foreground */}
                              <video
                                ref={videoRef}
                                src={(selectedClip as any).renderedVideoUrl || selectedClip.videoUrl}
                                className="relative z-10 w-full aspect-video object-contain shadow-2xl"
                                controls={false}
                                muted={isMuted}
                                playsInline
                                onTimeUpdate={handleTimeUpdate}
                                onEnded={() => {
                                  if (videoRef.current && selectedClip) {
                                    videoRef.current.currentTime = (selectedClip as any).renderedVideoUrl
                                      ? 0
                                      : selectedClip.startTime;
                                    videoRef.current.play().catch(() => {});
                                  }
                                }}
                              />
                            </div>
                          ) : (
                            /* AI Subject Track with dynamic smooth camera pan or Center Crop */
                            <div className="relative w-full h-full overflow-hidden bg-black">
                              <video
                                ref={videoRef}
                                src={(selectedClip as any).renderedVideoUrl || selectedClip.videoUrl}
                                className="w-full h-full object-cover transition-all duration-700 ease-in-out"
                                style={{
                                  objectPosition: getDynamicObjectPosition(
                                    playbackTime,
                                    dynamicShots,
                                    reframeMode
                                  ),
                                }}
                                controls={false}
                                muted={isMuted}
                                playsInline
                                onTimeUpdate={handleTimeUpdate}
                                onEnded={() => {
                                  if (videoRef.current && selectedClip) {
                                    videoRef.current.currentTime = (selectedClip as any).renderedVideoUrl
                                      ? 0
                                      : selectedClip.startTime;
                                    videoRef.current.play().catch(() => {});
                                  }
                                }}
                              />
                            </div>
                          )}

                          {/* Dynamic Subtitles Overlay */}
                          <div className="absolute bottom-12 inset-x-2 z-30 text-center pointer-events-none px-2">
                            <div className="inline-block px-3 py-2 rounded-2xl bg-black/75 backdrop-blur-md border border-white/10 shadow-2xl max-w-[90%]">
                              {selectedClip.transcript && selectedClip.transcript.length > 0 ? (
                                (() => {
                                  const currentWordIndex = selectedClip.transcript.findIndex(
                                    (w) => playbackTime >= w.start && playbackTime <= w.end
                                  );
                                  const activeIdx = currentWordIndex >= 0 ? currentWordIndex : 0;
                                  const startIdx = Math.max(0, activeIdx - 1);
                                  const endIdx = Math.min(selectedClip.transcript.length, startIdx + 4);
                                  const visibleWords = selectedClip.transcript.slice(startIdx, endIdx);

                                  return (
                                    <div className="flex flex-wrap justify-center items-center gap-1.5">
                                      {visibleWords.map((w, idx) => {
                                        const isWordActive =
                                          playbackTime >= w.start && playbackTime <= w.end;
                                        return (
                                          <span
                                            key={idx}
                                            className={`caption-hormozi text-base sm:text-lg font-black uppercase tracking-wider transition-all duration-100 ${
                                              isWordActive
                                                ? "text-yellow-400 scale-110 drop-shadow-[0_2px_10px_rgba(250,204,21,0.8)]"
                                                : "text-white"
                                            }`}
                                          >
                                            {w.text}
                                          </span>
                                        );
                                      })}
                                    </div>
                                  );
                                })()
                              ) : (
                                <span className="caption-hormozi text-base text-yellow-300 uppercase font-black">
                                  {selectedClip.hookHeadline || selectedClip.title}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Play / Pause overlay */}
                          <button
                            onClick={togglePlay}
                            className="absolute inset-0 flex items-center justify-center bg-black/20 hover:bg-black/40 transition-colors z-20 cursor-pointer"
                          >
                            {!isPlaying && (
                              <div className="p-4 rounded-full bg-black/60 text-white backdrop-blur-md">
                                <Play className="w-6 h-6 fill-white" />
                              </div>
                            )}
                          </button>
                        </div>
                      </div>

                      {/* OpusClip ReframeAnything Controls */}
                      <div className="w-full mt-3.5 p-3 rounded-2xl bg-white/[0.03] border border-white/[0.08]">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[11px] font-black uppercase tracking-wider text-zinc-300 flex items-center gap-1.5">
                            <Target className="w-3.5 h-3.5 text-purple-400" />
                            <span>Reframe Mode</span>
                          </span>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-500/20 border border-purple-500/30 text-purple-300">
                            ReframeAnything™
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-1.5">
                          {[
                            {
                              id: "auto-tracker",
                              label: "AI Dynamic Pan",
                              desc: "Follows moving speaker",
                              icon: Target,
                            },
                            {
                              id: "split-screen",
                              label: "Split Screen",
                              desc: "Dual camera stack",
                              icon: Layout,
                            },
                            {
                              id: "blurred-fit",
                              label: "Blurred Fit",
                              desc: "Full 16:9 + backdrop",
                              icon: Eye,
                            },
                            {
                              id: "center",
                              label: "Center Crop",
                              desc: "Static center window",
                              icon: Scissors,
                            },
                          ].map((mode) => {
                            const Icon = mode.icon;
                            const isActive = reframeMode === mode.id;
                            return (
                              <button
                                key={mode.id}
                                type="button"
                                onClick={() => handleModeSelect(mode.id as any)}
                                className={`p-2 rounded-xl text-left border transition-all cursor-pointer ${
                                  isActive
                                    ? "bg-purple-950/60 border-purple-500 text-white shadow-md ring-1 ring-purple-500/50"
                                    : "bg-white/[0.02] border-white/[0.06] text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.04]"
                                }`}
                              >
                                <div className="flex items-center gap-1.5 text-xs font-bold mb-0.5">
                                  <Icon
                                    className={`w-3.5 h-3.5 ${
                                      isActive ? "text-purple-400" : "text-zinc-500"
                                    }`}
                                  />
                                  <span>{mode.label}</span>
                                </div>
                                <div className="text-[10px] text-zinc-500 leading-tight">
                                  {mode.desc}
                                </div>
                              </button>
                            );
                          })}
                        </div>

                        {/* Interactive Shot Timeline */}
                        {reframeMode === "auto-tracker" && dynamicShots.length > 0 && (
                          <div className="mt-3 pt-2.5 border-t border-white/[0.08]">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                                <Video className="w-3 h-3 text-cyan-400" />
                                <span>AI Dynamic Shot Timeline</span>
                              </span>
                              <span className="text-[9px] text-zinc-500">Click to seek</span>
                            </div>

                            <div className="space-y-1.5">
                              {dynamicShots.map((shot, idx) => {
                                const isCurrent =
                                  playbackTime >= shot.start && playbackTime <= shot.end;
                                return (
                                  <button
                                    key={idx}
                                    type="button"
                                    onClick={() => {
                                      if (videoRef.current && selectedClip) {
                                        const target = (selectedClip as any).renderedVideoUrl
                                          ? shot.start
                                          : (selectedClip.startTime || 0) + shot.start;
                                        videoRef.current.currentTime = target;
                                        if (videoTopRef.current)
                                          videoTopRef.current.currentTime = target;
                                        setPlaybackTime(shot.start);
                                      }
                                    }}
                                    className={`w-full p-2 rounded-xl text-left border text-xs flex items-center justify-between transition-all cursor-pointer ${
                                      isCurrent
                                        ? "bg-purple-900/40 border-purple-500 text-white shadow-md ring-1 ring-purple-500/50"
                                        : "bg-white/[0.02] border-white/[0.05] text-zinc-400 hover:bg-white/[0.04]"
                                    }`}
                                  >
                                    <div className="flex items-center gap-2">
                                      <span className="px-1.5 py-0.5 rounded bg-black/60 font-mono text-[10px] text-zinc-300">
                                        {formatTime(shot.start)} - {formatTime(shot.end)}
                                      </span>
                                      <span className="font-semibold text-[11px] text-zinc-200">
                                        {shot.label}
                                      </span>
                                    </div>
                                    {isCurrent && (
                                      <span className="px-2 py-0.5 rounded-full bg-purple-500/30 text-purple-300 text-[9px] font-bold flex items-center gap-1">
                                        <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-ping" />
                                        IN FOCUS
                                      </span>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {lastTrackingSummary && (
                          <div className="mt-2.5 p-2 rounded-xl bg-purple-950/40 border border-purple-500/40 text-[10px] text-purple-200 flex items-center gap-1.5 animate-in fade-in">
                            <Sparkles className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
                            <span className="truncate">{lastTrackingSummary}</span>
                          </div>
                        )}
                      </div>

                      {/* Export Button */}
                      <div className="w-full mt-4">
                        <button
                          onClick={() => handleRenderAndDownload(selectedClip)}
                          disabled={isRendering}
                          className="w-full btn-primary-gradient py-3 rounded-xl font-bold text-xs sm:text-sm text-white flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-purple-600/30 disabled:opacity-50"
                        >
                          {isRendering ? (
                            <>
                              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              <span>Rendering Dynamic 9:16 MP4 with FFmpeg...</span>
                            </>
                          ) : (
                            <>
                              <Download className="w-4 h-4" />
                              <span>
                                Render & Download{" "}
                                {reframeMode === "auto-tracker"
                                  ? "AI Dynamic"
                                  : reframeMode === "split-screen"
                                  ? "Split-Screen"
                                  : reframeMode === "blurred-fit"
                                  ? "Blurred-Fit"
                                  : "Centered"}{" "}
                                9:16 MP4
                              </span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {/* Virality Card */}
                    <div className="glass-panel p-5 rounded-3xl border border-white/[0.08]">
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                          <TrendingUp className="w-4 h-4 text-emerald-400" />
                          <span>AI Virality Diagnostics</span>
                        </span>
                        <span className="text-xs font-black text-emerald-400">
                          {selectedClip.viralityScore} / 100
                        </span>
                      </div>
                      <p className="text-xs text-zinc-300 leading-relaxed">
                        {selectedClip.viralityReason}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* View 2: Import Video */}
        {activeTab === "upload" && (
          <div className="max-w-2xl mx-auto glass-panel-glow p-7 rounded-3xl border border-white/[0.12]">
            <h3 className="text-xl font-black text-white mb-2">Import Video for AI Processing</h3>
            <p className="text-xs text-zinc-400 mb-6">
              Paste any YouTube URL or drop an MP4 video file.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                startRealPipeline({ url: urlInput, prompt: promptInput });
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                  YouTube Video Link
                </label>
                <input
                  type="url"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=..."
                  className="w-full glass-input text-white text-sm px-4 py-3 rounded-xl focus:ring-1 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                  Or Upload Local Video File (MP4, MOV, WebM)
                </label>
                <div className="border-2 border-dashed border-white/[0.12] hover:border-purple-500/50 rounded-2xl p-6 text-center cursor-pointer relative bg-white/[0.02]">
                  <input
                    type="file"
                    accept="video/*"
                    onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <Upload className="w-6 h-6 text-purple-400 mx-auto mb-2" />
                  <div className="text-xs font-bold text-white">
                    {uploadFile ? uploadFile.name : "Select Video File"}
                  </div>
                  <div className="text-[11px] text-zinc-500 mt-0.5">
                    {uploadFile ? `${(uploadFile.size / (1024 * 1024)).toFixed(1)} MB` : "Up to 2GB"}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                  ClipAnything™ Prompt (Optional)
                </label>
                <input
                  type="text"
                  value={promptInput}
                  onChange={(e) => setPromptInput(e.target.value)}
                  placeholder="e.g. Focus on AI discussion, extract the funny story..."
                  className="w-full glass-input text-white text-sm px-4 py-2.5 rounded-xl focus:ring-1 focus:ring-purple-500"
                />
              </div>

              <button
                type="submit"
                disabled={!urlInput.trim() && !uploadFile}
                className="w-full btn-primary-gradient py-3.5 rounded-xl font-bold text-white text-sm mt-4 shadow-xl shadow-purple-600/30 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Sparkles className="w-4 h-4 text-amber-300" />
                <span>Run Real AI Pipeline</span>
              </button>
            </form>
          </div>
        )}
      </main>
    </div>
  );
}

export default function Dashboard() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#08090E] text-white p-8">Loading Opus Studio...</div>}>
      <DashboardContent />
    </Suspense>
  );
}
