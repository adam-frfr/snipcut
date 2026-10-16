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
  Zap,
  Mic,
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

  const handleLoadedMetadata = () => {
    if (videoRef.current && selectedClip) {
      if ((selectedClip as any).renderedVideoUrl) {
        videoRef.current.currentTime = 0;
        if (videoTopRef.current) videoTopRef.current.currentTime = 0;
      } else {
        videoRef.current.currentTime = selectedClip.startTime || 0;
        if (videoTopRef.current) videoTopRef.current.currentTime = selectedClip.startTime || 0;
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
        const storedCookies =
          typeof window !== "undefined" ? localStorage.getItem("opus_youtube_cookies") || "" : "";
        const storedProxy =
          typeof window !== "undefined" ? localStorage.getItem("opus_youtube_proxy") || "" : "";
        const ytRes = await fetch("/api/download-youtube", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url, cookies: storedCookies, proxy: storedProxy }),
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

      let videoTotalDuration = 60;

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
        videoTotalDuration = transData.duration || 60;
        if (transData.debugFile) {
          console.log(`[Stage 2: Transcribe] Intermediate output: ${transData.debugFile}`);
        }
      }

      // Stage 3: Viral Curation with Claude 3.5 Sonnet / Haiku
      setProcessingStage("OpusClip AI: Curating viral hooks and snapping word boundaries...");
      const analyzeRes = await fetch("/api/analyze-clips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcriptText: fullTranscript,
          words: rawWords,
          duration: videoTotalDuration,
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
      if (analyzeData.debugFile) {
        console.log(`[Stage 3: AI Curation] Intermediate output: ${analyzeData.debugFile}`);
      }

      // Stage 4: Assemble clips with precise snapped timestamps
      const rawClips = analyzeData.clips || [];
      const generatedClips: RealClip[] = rawClips.map((c: any, index: number) => {
        const clipWords =
          c.snappedWords && c.snappedWords.length > 0
            ? c.snappedWords.map((cw: any) => ({
                start: cw.start,
                end: cw.end,
                text: cw.word || cw.text,
              }))
            : rawWords
                .filter(
                  (w: any) => w.start >= c.startTime - 0.05 && w.end <= c.endTime + 0.05
                )
                .map((cw: any) => ({
                  start: Math.max(0, Number((cw.start - c.startTime).toFixed(2))),
                  end: Math.max(0.3, Number((cw.end - c.startTime).toFixed(2))),
                  text: cw.text || cw.word,
                }));

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
              ? clipWords
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
  };  return (
    <div className="min-h-screen bg-[#F8F7F4] text-black font-sans selection:bg-[#FFC700] selection:text-black">
      {/* Neo-Brutalist Top Header */}
      <header className="sticky top-0 z-40 bg-white border-b-2 border-black px-4 sm:px-6 lg:px-8 py-3.5 shadow-sm">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-4 sm:gap-6">
            <Link href="/" className="flex items-center gap-2 group">
              <div className="w-8 h-8 bg-[#FFC700] border-2 border-black text-black flex items-center justify-center font-black shadow-[2px_2px_0px_#000000] group-hover:translate-x-0.5 group-hover:translate-y-0.5 group-hover:shadow-none transition-all">
                <Scissors className="w-4 h-4 stroke-[2.5]" />
              </div>
              <span className="font-black text-lg tracking-tight uppercase">
                OPUS<span className="bg-[#FFC700] px-1 ml-0.5 border border-black">STUDIO</span>
              </span>
            </Link>

            <div className="hidden sm:flex items-center gap-2 text-xs border-2 border-black px-2.5 py-1 bg-[#F8F7F4] font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-500 border border-black animate-pulse" />
              <span className="uppercase tracking-wider">AI ENGINE READY</span>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <Link
              href="/editor"
              className="px-3 py-1.5 text-xs font-black uppercase tracking-wider bg-white hover:bg-[#FFC700] border-2 border-black shadow-[2px_2px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all flex items-center gap-1.5"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Studio Editor</span>
            </Link>

            <Link
              href="/schedule"
              className="px-3 py-1.5 text-xs font-black uppercase tracking-wider bg-white hover:bg-[#FFC700] border-2 border-black shadow-[2px_2px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all flex items-center gap-1.5"
            >
              <Calendar className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Scheduler</span>
            </Link>

            <button
              onClick={() => setSettingsOpen(true)}
              className="px-3 py-1.5 text-xs font-black uppercase tracking-wider bg-white hover:bg-[#FFC700] border-2 border-black shadow-[2px_2px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Key className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">API Keys</span>
            </button>

            <button
              onClick={() => setActiveTab("upload")}
              className="px-3.5 py-1.5 text-xs font-black uppercase tracking-wider text-black bg-[#FFC700] hover:bg-[#FF5500] hover:text-white border-2 border-black shadow-[2px_2px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 stroke-[3]" />
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
          <div className="mb-6 p-4 sm:p-5 bg-[#FFE5E5] border-2 border-black shadow-[4px_4px_0px_#000000] text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-black uppercase block text-sm mb-0.5 tracking-tight">System Notice</span>
                <span className="font-medium text-black leading-relaxed">{errorMsg}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap flex-shrink-0">
              <button
                type="button"
                onClick={() => {
                  setErrorMsg("");
                  startRealPipeline({ url: "sample", prompt: "Extract key viral points" });
                }}
                className="px-3 py-1.5 bg-[#FFC700] hover:bg-black hover:text-white border-2 border-black font-black text-xs uppercase shadow-[2px_2px_0px_#000000] transition cursor-pointer flex items-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Load Demo Video</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setErrorMsg("");
                  setActiveTab("upload");
                }}
                className="px-3 py-1.5 bg-white hover:bg-[#FFC700] border-2 border-black font-black text-xs uppercase shadow-[2px_2px_0px_#000000] transition cursor-pointer"
              >
                Upload File Directly
              </button>
              <button
                type="button"
                onClick={() => {
                  setSettingsOpen(true);
                }}
                className="px-3 py-1.5 bg-white hover:bg-[#FFC700] border-2 border-black font-black text-xs uppercase shadow-[2px_2px_0px_#000000] transition cursor-pointer"
              >
                Add Cookies (Bypass)
              </button>
              <button
                type="button"
                onClick={() => setErrorMsg("")}
                className="px-3 py-1.5 bg-white border-2 border-black text-black font-black text-xs uppercase hover:bg-black hover:text-white transition cursor-pointer"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Processing Modal Overlay */}
        {isProcessing && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white max-w-md w-full p-8 border-2 border-black shadow-[8px_8px_0px_#000000] text-center">
              <div className="w-16 h-16 bg-[#FFC700] border-2 border-black text-black flex items-center justify-center mx-auto mb-6 shadow-[3px_3px_0px_#000000]">
                <Wand2 className="w-8 h-8 animate-spin" />
              </div>

              <h3 className="text-xl font-black uppercase tracking-tight text-black mb-2">Processing Video</h3>
              <p className="text-xs text-black font-mono font-bold mb-6 uppercase border border-black bg-[#F8F7F4] py-1.5 px-3">
                {processingStage}
              </p>

              <div className="w-full bg-[#F8F7F4] h-4 border-2 border-black overflow-hidden p-0.5">
                <div className="bg-[#FFC700] h-full animate-pulse w-3/4 border-r-2 border-black" />
              </div>
            </div>
          </div>
        )}

        {/* Neo-Brutalist Segmented Tab Switcher */}
        <div className="flex items-center justify-between mb-8 pb-4">
          <div className="inline-flex p-1 bg-white border-2 border-black shadow-[3px_3px_0px_#000000] gap-1">
            <button
              onClick={() => setActiveTab("clips")}
              className={`px-4 sm:px-6 py-2 text-xs sm:text-sm font-black uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === "clips"
                  ? "bg-[#FFC700] text-black border-2 border-black shadow-[2px_2px_0px_#000000]"
                  : "text-black hover:bg-[#F8F7F4] border-2 border-transparent"
              }`}
            >
              <Sparkles className="w-4 h-4" />
              <span>VIRAL CLIPS ({clips.length})</span>
            </button>
            <button
              onClick={() => setActiveTab("upload")}
              className={`px-4 sm:px-6 py-2 text-xs sm:text-sm font-black uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === "upload"
                  ? "bg-[#FFC700] text-black border-2 border-black shadow-[2px_2px_0px_#000000]"
                  : "text-black hover:bg-[#F8F7F4] border-2 border-transparent"
              }`}
            >
              <Upload className="w-4 h-4" />
              <span>IMPORT VIDEO</span>
            </button>
          </div>
        </div>

        {/* View 1: Clips Gallery */}
        {activeTab === "clips" && (
          <div>
            {clips.length === 0 ? (
              /* Clean Empty State */
              <div className="bg-white border-2 border-black shadow-[6px_6px_0px_#000000] p-8 sm:p-12 text-center max-w-xl mx-auto">
                <div className="w-16 h-16 bg-[#FFC700] border-2 border-black text-black flex items-center justify-center mx-auto mb-4 shadow-[3px_3px_0px_#000000]">
                  <FileVideo className="w-8 h-8" />
                </div>
                <h3 className="text-2xl font-black uppercase tracking-tight text-black mb-2">No clips generated yet</h3>
                <p className="text-xs text-neutral-700 mb-6 font-medium leading-relaxed max-w-md mx-auto">
                  Paste a YouTube URL or upload an MP4 video to run automatic transcription, smart reframing, and AI viral hook curation.
                </p>
                <button
                  onClick={() => setActiveTab("upload")}
                  className="bg-[#FFC700] hover:bg-[#FF5500] hover:text-white px-6 py-3 border-2 border-black font-black text-xs uppercase tracking-wider cursor-pointer shadow-[3px_3px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all"
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
                        className={`p-4 sm:p-5 border-2 border-black transition-all cursor-pointer flex flex-col sm:flex-row items-start sm:items-center gap-4 ${
                          isSelected
                            ? "bg-[#FFFBEA] shadow-[4px_4px_0px_#000000]"
                            : "bg-white hover:bg-[#F8F7F4] shadow-[2px_2px_0px_#000000] hover:shadow-[4px_4px_0px_#000000]"
                        }`}
                      >
                        {/* Video Preview Block */}
                        <div className="relative w-full sm:w-36 h-28 sm:h-24 border-2 border-black overflow-hidden flex-shrink-0 bg-black flex items-center justify-center">
                          <video
                            src={`${clip.videoUrl}#t=${clip.startTime || 0.1}`}
                            className="w-full h-full object-cover pointer-events-none"
                            preload="metadata"
                            playsInline
                            muted
                          />
                          <div className="absolute top-1.5 left-1.5 px-2 py-0.5 bg-[#FFC700] border border-black text-[10px] font-black text-black flex items-center gap-1">
                            <Flame className="w-3 h-3 fill-black text-black" />
                            <span>{clip.viralityScore}</span>
                          </div>
                          <div className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 bg-black text-[10px] text-white font-mono font-bold">
                            {clip.durationFormatted}
                          </div>
                        </div>

                        {/* Metadata */}
                        <div className="flex-1 min-w-0">
                          <span className="text-[10px] font-black px-2 py-0.5 bg-black text-white uppercase mb-1.5 inline-block">
                            CLIP #{index + 1}
                          </span>
                          <h4 className="text-sm font-black uppercase text-black truncate mb-1">{clip.title}</h4>
                          <p className="text-xs text-neutral-700 line-clamp-2 leading-relaxed mb-3">
                            {clip.viralityReason}
                          </p>

                          <div className="flex items-center gap-2 text-[10px] font-mono font-bold uppercase flex-wrap">
                            <span className="px-1.5 py-0.5 bg-[#E6F4EA] border border-black text-emerald-800">
                              Hook: {clip.hookStrength}%
                            </span>
                            <span className="px-1.5 py-0.5 bg-[#FFF0D4] border border-black text-amber-900">
                              Retention: {clip.engagementScore}%
                            </span>
                            <span className="px-1.5 py-0.5 bg-neutral-200 border border-black text-black">
                              Trend: {clip.trendMatch}%
                            </span>
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
                            className="flex-1 sm:flex-none p-2.5 bg-[#FFC700] hover:bg-[#FF5500] hover:text-white text-black border-2 border-black font-black text-xs uppercase flex items-center justify-center gap-1.5 transition-all shadow-[2px_2px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:opacity-50 cursor-pointer"
                            title="Render real 9:16 MP4 with FFmpeg"
                          >
                            <Download className="w-3.5 h-3.5" />
                            <span className="sm:hidden font-black">Download</span>
                          </button>

                          <Link
                            href={`/editor?clipId=${clip.id}`}
                            onClick={(e) => e.stopPropagation()}
                            className="flex-1 sm:flex-none p-2.5 bg-white hover:bg-black hover:text-white text-black border-2 border-black font-black text-xs uppercase flex items-center justify-center gap-1.5 transition-colors shadow-[2px_2px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
                            title="Open in Studio Editor"
                          >
                            <Sliders className="w-3.5 h-3.5" />
                            <span className="sm:hidden font-black">Edit</span>
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Right Player & Diagnostics */}
                {selectedClip && (
                  <div className="lg:col-span-5 space-y-5">
                    <div className="bg-white p-6 border-2 border-black shadow-[6px_6px_0px_#000000] flex flex-col items-center">
                      {/* Vertical Video Viewport */}
                      <div className="relative w-[260px] sm:w-[280px] h-[480px] bg-black border-2 border-black overflow-hidden shadow-[4px_4px_0px_#000000] flex flex-col">
                        <div className="relative flex-1 bg-black flex flex-col justify-center items-center overflow-hidden">
                          {/* Reframe Mode Floating Tag */}
                          <div className="absolute top-3 left-3 z-30 flex items-center gap-1.5 px-2.5 py-1 bg-black text-[10px] font-black uppercase text-[#FFC700] border-2 border-[#FFC700] pointer-events-none">
                            <span className="w-1.5 h-1.5 bg-[#FFC700]" />
                            <span>
                              {reframeMode === "auto-tracker"
                                ? "DYNAMIC PAN TRACK"
                                : reframeMode === "split-screen"
                                ? "SPLIT-SCREEN MODE"
                                : reframeMode === "blurred-fit"
                                ? "BLURRED BACKDROP"
                                : "CENTER CROP"}
                            </span>
                          </div>

                          {/* Mode-reactive Player Viewport */}
                          {reframeMode === "split-screen" ? (
                            <div className="w-full h-full flex flex-col bg-black">
                              {/* Top Camera: Main Content */}
                              <div className="relative w-full h-1/2 overflow-hidden border-b-2 border-white">
                                <video
                                  ref={videoTopRef}
                                  key={`top-${selectedClip.id}-${(selectedClip as any).renderedVideoUrl || ""}`}
                                  src={(selectedClip as any).renderedVideoUrl || selectedClip.videoUrl}
                                  className="w-full h-full object-cover"
                                  style={{ objectPosition: "75% center" }}
                                  preload="auto"
                                  muted
                                  playsInline
                                />
                                <div className="absolute top-2 left-2 px-2 py-0.5 bg-black border border-white text-[9px] font-bold text-[#FFC700] tracking-wider uppercase">
                                  TOP: CONTENT FOCUS
                                </div>
                              </div>

                              {/* Bottom Camera: Speaker */}
                              <div className="relative w-full h-1/2 overflow-hidden">
                                <video
                                  ref={videoRef}
                                  key={`bot-${selectedClip.id}-${(selectedClip as any).renderedVideoUrl || ""}`}
                                  src={(selectedClip as any).renderedVideoUrl || selectedClip.videoUrl}
                                  className="w-full h-full object-cover"
                                  style={{ objectPosition: "15% center" }}
                                  controls={false}
                                  preload="auto"
                                  muted={isMuted}
                                  playsInline
                                  onLoadedMetadata={handleLoadedMetadata}
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
                                <div className="absolute top-2 left-2 px-2 py-0.5 bg-black border border-white text-[9px] font-bold text-[#FFC700] tracking-wider uppercase">
                                  BOTTOM: SPEAKER CAM
                                </div>
                              </div>
                            </div>
                          ) : reframeMode === "blurred-fit" ? (
                            <div className="relative w-full h-full flex items-center justify-center overflow-hidden bg-black">
                              {/* Dynamic Blurred Backdrop */}
                              <video
                                key={`blur-${selectedClip.id}-${(selectedClip as any).renderedVideoUrl || ""}`}
                                src={(selectedClip as any).renderedVideoUrl || selectedClip.videoUrl}
                                className="absolute inset-0 w-full h-full object-cover blur-2xl scale-125 opacity-70"
                                preload="auto"
                                muted
                                playsInline
                              />
                              {/* Centered 16:9 Foreground */}
                              <video
                                ref={videoRef}
                                key={`fit-${selectedClip.id}-${(selectedClip as any).renderedVideoUrl || ""}`}
                                src={(selectedClip as any).renderedVideoUrl || selectedClip.videoUrl}
                                className="relative z-10 w-full aspect-video object-contain shadow-2xl"
                                controls={false}
                                preload="auto"
                                muted={isMuted}
                                playsInline
                                onLoadedMetadata={handleLoadedMetadata}
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
                                key={`track-${selectedClip.id}-${(selectedClip as any).renderedVideoUrl || ""}`}
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
                                preload="auto"
                                muted={isMuted}
                                playsInline
                                onLoadedMetadata={handleLoadedMetadata}
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
                            <div className="inline-block px-3 py-1.5 bg-black border-2 border-white shadow-[2px_2px_0px_#000000] max-w-[90%]">
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
                                            className={`font-black text-sm sm:text-base uppercase tracking-wider transition-all duration-100 ${
                                              isWordActive
                                                ? "text-[#FFC700] scale-110 drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)]"
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
                                <span className="text-sm text-[#FFC700] uppercase font-black tracking-wider">
                                  {selectedClip.hookHeadline || selectedClip.title}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Play / Pause overlay */}
                          <button
                            onClick={togglePlay}
                            className="absolute inset-0 flex items-center justify-center bg-black/15 hover:bg-black/30 transition-colors z-20 cursor-pointer"
                          >
                            {!isPlaying && (
                              <div className="p-4 bg-[#FFC700] border-2 border-black text-black shadow-[3px_3px_0px_#000000]">
                                <Play className="w-6 h-6 fill-black" />
                              </div>
                            )}
                          </button>
                        </div>
                      </div>

                      {/* OpusClip ReframeControls */}
                      <div className="w-full mt-5 p-4 bg-[#F8F7F4] border-2 border-black shadow-[3px_3px_0px_#000000]">
                        <div className="flex items-center justify-between mb-3">
                          <span className="text-xs font-black uppercase tracking-wider text-black flex items-center gap-1.5">
                            <Target className="w-4 h-4" />
                            <span>Reframe Mode</span>
                          </span>
                          <span className="text-[10px] font-black px-2 py-0.5 bg-black text-white uppercase">
                            REFRAME ENGINE
                          </span>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
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
                                className={`p-2.5 text-left border-2 border-black transition-all cursor-pointer ${
                                  isActive
                                    ? "bg-[#FFC700] text-black shadow-[2px_2px_0px_#000000] font-bold"
                                    : "bg-white text-black hover:bg-[#FFFBEA]"
                                }`}
                              >
                                <div className="flex items-center gap-1.5 text-xs font-black mb-0.5 uppercase">
                                  <Icon className="w-3.5 h-3.5 stroke-[2.5]" />
                                  <span>{mode.label}</span>
                                </div>
                                <div className="text-[10px] leading-tight text-neutral-700">
                                  {mode.desc}
                                </div>
                              </button>
                            );
                          })}
                        </div>

                        {/* Interactive Shot Timeline */}
                        {reframeMode === "auto-tracker" && dynamicShots.length > 0 && (
                          <div className="mt-4 pt-3 border-t-2 border-black">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-[10px] font-black uppercase tracking-wider text-black flex items-center gap-1.5">
                                <Video className="w-3 h-3" />
                                <span>Dynamic Shot Timeline</span>
                              </span>
                              <span className="text-[9px] font-mono text-neutral-600">Click to seek</span>
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
                                    className={`w-full p-2 text-left border-2 border-black text-xs flex items-center justify-between transition-all cursor-pointer ${
                                      isCurrent
                                        ? "bg-black text-white shadow-[2px_2px_0px_#000000]"
                                        : "bg-white text-black hover:bg-[#FFFBEA]"
                                    }`}
                                  >
                                    <div className="flex items-center gap-2">
                                      <span className={`px-1.5 py-0.2 font-mono text-[10px] border ${
                                        isCurrent ? "bg-[#FFC700] text-black border-black font-bold" : "bg-[#F8F7F4] text-black border-black"
                                      }`}>
                                        {formatTime(shot.start)} - {formatTime(shot.end)}
                                      </span>
                                      <span className="font-bold text-[11px] uppercase">
                                        {shot.label}
                                      </span>
                                    </div>
                                    {isCurrent && (
                                      <span className="px-1.5 py-0.5 bg-[#FFC700] text-black text-[9px] font-black uppercase border border-black">
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
                          <div className="mt-3 p-2 bg-white border border-black text-[10px] text-black font-mono flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-black flex-shrink-0" />
                            <span className="truncate">{lastTrackingSummary}</span>
                          </div>
                        )}
                      </div>

                      {/* Export Button */}
                      <div className="w-full mt-4">
                        <button
                          onClick={() => handleRenderAndDownload(selectedClip)}
                          disabled={isRendering}
                          className="w-full bg-[#FFC700] hover:bg-[#FF5500] hover:text-white py-3.5 border-2 border-black font-black text-xs sm:text-sm text-black uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer shadow-[4px_4px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all disabled:opacity-50"
                        >
                          {isRendering ? (
                            <>
                              <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                              <span>Rendering 9:16 MP4 with FFmpeg...</span>
                            </>
                          ) : (
                            <>
                              <Download className="w-4 h-4 stroke-[2.5]" />
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
                    <div className="bg-white p-5 border-2 border-black shadow-[4px_4px_0px_#000000]">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-black text-black uppercase tracking-wider flex items-center gap-1.5">
                          <TrendingUp className="w-4 h-4" />
                          <span>Virality Diagnostics</span>
                        </span>
                        <span className="text-xs font-black text-black px-2 py-0.5 bg-[#FFC700] border border-black font-mono">
                          {selectedClip.viralityScore} / 100
                        </span>
                      </div>
                      <p className="text-xs text-neutral-800 leading-relaxed font-medium">
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
          <div className="max-w-2xl mx-auto bg-white p-6 sm:p-8 border-2 border-black shadow-[6px_6px_0px_#000000]">
            <h3 className="text-2xl font-black uppercase tracking-tight text-black mb-1">Import Video</h3>
            <p className="text-xs text-neutral-700 mb-6 font-medium">
              Paste any YouTube URL or drop an MP4 video file to extract viral short-form clips.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                startRealPipeline({ url: urlInput, prompt: promptInput });
              }}
              className="space-y-4"
            >
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-black uppercase tracking-wider text-black">
                    YouTube Video URL
                  </label>
                  <span className="text-[11px] text-neutral-600 font-medium">Or choose a quick demo</span>
                </div>
                <input
                  type="url"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://www.youtube.com/watch?v=..."
                  className="w-full bg-[#F8F7F4] text-black text-sm px-4 py-3 border-2 border-black placeholder:text-neutral-500 focus:outline-none focus:bg-white focus:shadow-[3px_3px_0px_#000000] transition-all font-mono"
                />

                {/* 1-Click Samples (Clean badges without emojis) */}
                <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                  <span className="text-[10px] font-black uppercase tracking-wider text-black">Quick Demos:</span>
                  <button
                    type="button"
                    onClick={() => {
                      setUrlInput("sample");
                      startRealPipeline({ url: "sample", prompt: "Extract key viral points" });
                    }}
                    className="px-2.5 py-1 bg-white hover:bg-[#FFC700] text-[11px] font-black uppercase tracking-wider text-black border border-black shadow-[2px_2px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition cursor-pointer flex items-center gap-1.5"
                  >
                    <Zap className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>Keynote Demo</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setUrlInput("sample-podcast");
                      startRealPipeline({ url: "sample-podcast", prompt: "Funny moment and discussion" });
                    }}
                    className="px-2.5 py-1 bg-white hover:bg-[#FFC700] text-[11px] font-black uppercase tracking-wider text-black border border-black shadow-[2px_2px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition cursor-pointer flex items-center gap-1.5"
                  >
                    <Mic className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>Podcast Demo</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-black mb-1.5">
                  Or Upload Video File (MP4, MOV, WebM)
                </label>
                <div className="border-2 border-dashed border-black bg-[#F8F7F4] hover:bg-[#FFFBEA] p-6 text-center cursor-pointer relative transition-colors">
                  <input
                    type="file"
                    accept="video/*"
                    onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <div className="w-12 h-12 bg-[#FFC700] border-2 border-black text-black flex items-center justify-center mx-auto mb-2 pointer-events-none shadow-[2px_2px_0px_#000000]">
                    <Upload className="w-6 h-6 stroke-[2.5]" />
                  </div>
                  <div className="text-xs font-black uppercase text-black">
                    {uploadFile ? uploadFile.name : "Select Video File"}
                  </div>
                  <div className="text-[11px] font-mono text-neutral-600 mt-0.5">
                    {uploadFile ? `${(uploadFile.size / (1024 * 1024)).toFixed(1)} MB` : "Up to 2GB MP4 / MOV"}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-black mb-1.5">
                  Clip Prompt (Optional)
                </label>
                <input
                  type="text"
                  value={promptInput}
                  onChange={(e) => setPromptInput(e.target.value)}
                  placeholder="e.g. Focus on AI discussion, extract the funny story..."
                  className="w-full bg-[#F8F7F4] text-black text-sm px-4 py-2.5 border-2 border-black placeholder:text-neutral-500 focus:outline-none focus:bg-white focus:shadow-[3px_3px_0px_#000000] transition-all"
                />
              </div>

              <button
                type="submit"
                disabled={!urlInput.trim() && !uploadFile}
                className="w-full bg-[#FFC700] hover:bg-[#FF5500] hover:text-white py-4 border-2 border-black font-black text-black text-sm uppercase tracking-wider shadow-[4px_4px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 transition-all"
              >
                <Sparkles className="w-4 h-4 stroke-[2.5]" />
                <span>Run AI Pipeline</span>
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
    <Suspense fallback={<div className="min-h-screen bg-[#F8F7F4] text-black p-8 flex items-center justify-center font-black uppercase">Loading Opus Studio...</div>}>
      <DashboardContent />
    </Suspense>
  );
}
