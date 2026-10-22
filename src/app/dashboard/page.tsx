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
  Lock,
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
  description?: string;
  transcript: {
    start: number;
    end: number;
    text: string;
    emoji?: string;
  }[];
  aspectRatio: "9:16" | "1:1" | "16:9";
  captionStyle: "hormozi" | "neon" | "beast" | "clean" | "kinetic";
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
  const [tokenPromptOpen, setTokenPromptOpen] = useState(false);
  const [inputToken, setInputToken] = useState("");
  const [tokenError, setTokenError] = useState("");
  // After the user cancels the token prompt, background 401s (job polling,
  // retries) must not keep reopening it every few seconds — that trapped
  // anyone with a wrong/expired stored token in an endless modal loop.
  const tokenPromptSuppressedRef = React.useRef(false);
  const openTokenPrompt = () => {
    if (!tokenPromptSuppressedRef.current) setTokenPromptOpen(true);
  };

  // Phase 4: Async Job State & Worker Polling
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  const [jobProgress, setJobProgress] = useState<number>(0);
  const [jobStatus, setJobStatus] = useState<string>("");
  const [isRetrying, setIsRetrying] = useState<boolean>(false);
  const pollIntervalRef = React.useRef<NodeJS.Timeout | null>(null);

  const stopPolling = () => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      stopPolling();
    };
  }, []);

  const getAuthHeaders = (): Record<string, string> => {
    if (typeof window === "undefined") return {};
    const t = localStorage.getItem("app_access_token");
    return t ? { "x-app-access-token": t } : {};
  };

  const [reframeMode, setReframeMode] = useState<"auto-tracker" | "split-screen" | "blurred-fit" | "center">("auto-tracker");
  const [removeSilences, setRemoveSilences] = useState(false);
  const [jobCaptionStyle, setJobCaptionStyle] = useState<"hormozi" | "neon" | "beast" | "clean" | "kinetic">("kinetic");
  const [brollEnabled, setBrollEnabled] = useState(true);
  const [musicBedEnabled, setMusicBedEnabled] = useState(true);
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
  >([]);

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
        setHasServerKey(Boolean(data.hasKey));
        if (data.requiresAuth) {
          const storedToken = localStorage.getItem("app_access_token");
          if (!storedToken) {
            setTokenPromptOpen(true);
          } else {
            document.cookie = `app_access_token=${encodeURIComponent(storedToken)}; path=/; max-age=31536000; SameSite=Lax`;
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

    // Resume in-progress job if user reloaded the page
    const activeJobId = localStorage.getItem("active_job_id");
    if (activeJobId) {
      pollJob(activeJobId);
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

  // Phase 4: Job Polling & Worker Synchronization
  const pollJob = (jobId: string) => {
    stopPolling();
    setCurrentJobId(jobId);
    setIsProcessing(true);

    const checkJob = async () => {
      try {
        const res = await fetch(`/api/jobs/${jobId}`, {
          headers: { ...getAuthHeaders() },
        });

        if (res.status === 401) {
          openTokenPrompt();
          return;
        }

        if (res.status === 404) {
          stopPolling();
          setIsProcessing(false);
          localStorage.removeItem("active_job_id");
          setErrorMsg(`Job ${jobId} not found`);
          return;
        }

        const data = await res.json();
        if (!data.success || !data.job) {
          return;
        }

        const job = data.job;
        setJobProgress(job.progress || 0);
        setJobStatus(job.status);
        setProcessingStage(job.stageMessage || "Processing...");

        if (job.status === "failed") {
          stopPolling();
          setErrorMsg(job.error || "Job processing failed.");
        } else if (job.status === "done") {
          stopPolling();
          localStorage.removeItem("active_job_id");

          const rawClips = job.output?.curatedClips || [];
          const renderedMap = new Map<string, any>();
          if (Array.isArray(job.output?.renderedClips)) {
            for (const r of job.output.renderedClips) {
              renderedMap.set(String(Number(r.startTime).toFixed(2)), r);
            }
          }

          const generatedClips: RealClip[] = rawClips.map((c: any, index: number) => {
            const startKey = String(Number(c.startTime).toFixed(2));
            const rendered = renderedMap.get(startKey);

            const clipWords =
              c.snappedWords && c.snappedWords.length > 0
                ? c.snappedWords.map((cw: any) => ({
                    start: Math.max(0, Number((cw.start - c.startTime).toFixed(2))),
                    end: Math.max(0.3, Number((cw.end - c.startTime).toFixed(2))),
                    text: cw.word || cw.text,
                  }))
                : Array.isArray(job.output?.transcription?.words)
                ? job.output.transcription.words
                    .filter((w: any) => w.end > c.startTime && w.start < c.endTime)
                    .map((w: any) => ({
                      start: Math.max(0, Number((w.start - c.startTime).toFixed(2))),
                      end: Math.max(0.3, Number((w.end - c.startTime).toFixed(2))),
                      text: w.word || w.text,
                    }))
                : [
                    { start: 0, end: 3, text: c.hookHeadline || c.title },
                    { start: 3, end: 7, text: "Key insight" },
                  ];

            const initialVideoUrl = rendered
              ? rendered.downloadUrl
              : job.output?.fileId
              ? `/api/media?file=${encodeURIComponent(job.output.fileId)}`
              : "/placeholder.mp4";

            return {
              id: rendered?.clipId || `clip-${Date.now()}-${index}`,
              videoFilePath: job.output?.filePath || "",
              videoUrl: initialVideoUrl,
              renderedVideoUrl: rendered ? rendered.downloadUrl : undefined,
              previewUrl: rendered?.previewDownloadUrl || undefined,
              title: c.title || `Viral Short #${index + 1}`,
              hookHeadline: c.hookHeadline || "",
              startTime: c.startTime || 0,
              endTime: c.endTime || 30,
              duration: Number(Math.max(5, c.endTime - c.startTime).toFixed(2)),
              durationFormatted: c.durationFormatted || "0:30",
              viralityScore: c.viralityScore || 92,
              hookStrength: c.hookStrength || 94,
              engagementScore: c.engagementScore || 90,
              trendMatch: c.trendMatch || 92,
              viralityReason: c.viralityReason || "High-retention narrative segment",
              description: c.description || rendered?.description || "",
              aspectRatio: job.options?.aspectRatio || "9:16",
              captionStyle: job.options?.captionStyle || "hormozi",
              transcript: clipWords,
            };
          });

          if (generatedClips.length > 0) {
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
          }
          setIsProcessing(false);
        }
      } catch (err: any) {
        console.warn("[Dashboard] Polling error:", err.message);
      }
    };

    // Execute immediately, then every 2500ms
    checkJob();
    pollIntervalRef.current = setInterval(checkJob, 2500);
  };

  // Phase 4: Retry failed job from last completed stage
  const handleRetryJob = async () => {
    if (!currentJobId) return;
    setIsRetrying(true);
    setErrorMsg("");
    try {
      const res = await fetch(`/api/jobs/${currentJobId}/retry`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
      });
      if (res.status === 401) {
        openTokenPrompt();
        return;
      }
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Failed to retry job");
      }
      pollJob(currentJobId);
    } catch (err: any) {
      setErrorMsg(err.message || "Retry failed");
    } finally {
      setIsRetrying(false);
    }
  };

  // Phase 4: Real Async Job Pipeline Trigger
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
    setJobProgress(5);
    setJobStatus("QUEUED");
    setProcessingStage("Submitting job to async worker queue...");

    try {
      let res: Response;

      const storedApiKeys = {
        groqKey: (typeof window !== "undefined" && localStorage.getItem("opus_groq_key")) || "",
        openaiKey: (typeof window !== "undefined" && localStorage.getItem("opus_openai_key")) || "",
        claudeKey: (typeof window !== "undefined" && localStorage.getItem("opus_claude_key")) || "",
        preferredModel: (typeof window !== "undefined" && localStorage.getItem("opus_preferred_model")) || "",
        pexelsKey: (typeof window !== "undefined" && localStorage.getItem("opus_pexels_key")) || "",
      };

      if (uploadFile) {
        // Chunked upload: a single all-or-nothing POST of a 10MB+ file dies
        // whenever the connection hiccups mid-body (ECONNRESET on slower
        // uplinks). Send 2MB pieces instead — each is quick and retried
        // individually — then the server assembles them and creates the job.
        const CHUNK_SIZE = 2 * 1024 * 1024;
        const uploadId = crypto.randomUUID();
        const totalChunks = Math.max(1, Math.ceil(uploadFile.size / CHUNK_SIZE));

        for (let i = 0; i < totalChunks; i++) {
          const blob = uploadFile.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
          let sent = false;
          for (let attempt = 1; attempt <= 3 && !sent; attempt++) {
            try {
              const fd = new FormData();
              fd.append("uploadId", uploadId);
              fd.append("index", String(i));
              fd.append("chunk", blob, `part-${i}`);
              const r = await fetch("/api/upload-chunk", {
                method: "POST",
                headers: { ...getAuthHeaders() },
                body: fd,
              });
              if (r.status === 401) {
                openTokenPrompt();
                throw new Error("Access token required or invalid. Please provide APP_ACCESS_TOKEN.");
              }
              if (!r.ok) throw new Error(`chunk ${i} rejected (HTTP ${r.status})`);
              sent = true;
            } catch (chunkErr: any) {
              if (chunkErr?.message?.includes("Access token")) throw chunkErr;
              if (attempt === 3) {
                throw new Error(
                  "The upload kept dropping — your connection to the server is unstable right now, so the file never fully arrived. Wait a few seconds and press Run again; nothing was lost."
                );
              }
              setProcessingStage(`Upload connection dropped — retrying piece ${i + 1} of ${totalChunks} (attempt ${attempt + 1})...`);
              await new Promise((resolve) => setTimeout(resolve, 1500 * attempt));
            }
          }
          const pct = Math.round(((i + 1) / totalChunks) * 100);
          setProcessingStage(`Uploading video file to server... ${pct}%`);
          setJobProgress(5 + Math.round(((i + 1) / totalChunks) * 10));
        }

        res = await fetch("/api/upload-chunk", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          body: JSON.stringify({
            action: "finalize",
            uploadId,
            totalChunks,
            fileName: uploadFile.name,
            customPrompt: prompt || promptInput,
            aspectRatio: "9:16",
            reframeMode,
            captionStyle: jobCaptionStyle,
            removeSilences,
            broll: brollEnabled,
            musicBed: musicBedEnabled,
            ...storedApiKeys,
          }),
        });
      } else if (url) {
        setProcessingStage("Enqueuing video URL for download and AI processing...");
        const storedCookies = (typeof window !== "undefined" && localStorage.getItem("opus_youtube_cookies")) || "";
        const storedProxy = (typeof window !== "undefined" && localStorage.getItem("opus_youtube_proxy")) || "";

        res = await fetch("/api/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          body: JSON.stringify({
            youtubeUrl: url,
            customPrompt: prompt || promptInput,
            aspectRatio: "9:16",
            reframeMode,
            captionStyle: jobCaptionStyle,
            removeSilences,
            broll: brollEnabled,
            musicBed: musicBedEnabled,
            cookies: storedCookies,
            proxy: storedProxy,
            ...storedApiKeys,
          }),
        });
      } else if (filePath) {
        setProcessingStage("Enqueuing video file for AI processing...");
        res = await fetch("/api/jobs", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...getAuthHeaders() },
          body: JSON.stringify({
            fileId: filePath,
            filePath,
            customPrompt: prompt || promptInput,
            aspectRatio: "9:16",
            reframeMode,
            captionStyle: jobCaptionStyle,
            removeSilences,
            broll: brollEnabled,
            musicBed: musicBedEnabled,
            ...storedApiKeys,
          }),
        });
      } else {
        throw new Error("No video file or URL provided.");
      }

      if (res.status === 401) {
        openTokenPrompt();
        throw new Error("Access token required or invalid. Please provide APP_ACCESS_TOKEN.");
      }

      let data: any;
      try {
        data = await res.json();
      } catch {
        throw new Error(
          "The server's reply was cut off — the connection dropped at the last step. Please press Run again; if it keeps happening, the hosting connection is having a bad spell."
        );
      }
      if (!res.ok || data.error) {
        throw new Error(data.error || "Failed to create processing job");
      }

      const jobId = data.jobId;
      localStorage.setItem("active_job_id", jobId);
      setCurrentJobId(jobId);
      setJobProgress(data.progress || 5);
      setJobStatus(data.status || "uploaded");
      setProcessingStage(data.stageMessage || "Job queued for processing...");

      pollJob(jobId);
    } catch (err: any) {
      setErrorMsg(err.message || "An unexpected error occurred during processing.");
      setIsProcessing(false);
    }
  };

  // Real FFmpeg Render & Download
  const handleRenderAndDownload = async (clip: RealClip) => {
    setIsRendering(true);
    try {
      const res = await fetch("/api/render-clip", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...getAuthHeaders() },
        body: JSON.stringify({
          inputPath: clip.videoFilePath,
          startTime: clip.startTime,
          duration: clip.duration,
          aspectRatio: clip.aspectRatio || "9:16",
          reframeMode: reframeMode,
          splitScreen: reframeMode === "split-screen",
          // clip.transcript is stored clip-relative (for the editor's
          // display); /api/render-clip expects source-absolute word times,
          // so rebase on send — the same pattern the editor uses.
          transcript: (clip.transcript || []).map((w) => ({
            ...w,
            start: w.start + clip.startTime,
            end: w.end + clip.startTime,
          })),
          headline: clip.hookHeadline || clip.title,
          captionStyle: clip.captionStyle || "hormozi",
        }),
      });
      let data: any = {};
      try {
        data = await res.json();
      } catch {
        throw new Error("The server reply was cut off — please retry the render.");
      }
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
          ? {
              ...c,
              videoUrl: data.downloadUrl,
              renderedVideoUrl: data.downloadUrl,
              previewUrl: data.previewDownloadUrl || (c as any).previewUrl,
            }
          : c
      );
      setClips(updatedClips);
      if (selectedClip && selectedClip.id === clip.id) {
        setSelectedClip({
          ...selectedClip,
          videoUrl: data.downloadUrl,
          renderedVideoUrl: data.downloadUrl,
          previewUrl: data.previewDownloadUrl || (selectedClip as any).previewUrl,
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
      <header className="sticky top-0 z-40 bg-white border-b-2 border-black px-3 sm:px-6 lg:px-8 py-3.5 shadow-sm">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-2 sm:gap-6">
            <Link href="/" className="flex items-center gap-2 group">
              <div className="w-8 h-8 bg-[#FFC700] border-2 border-black text-black flex items-center justify-center font-black shadow-[2px_2px_0px_#000000] group-hover:translate-x-0.5 group-hover:translate-y-0.5 group-hover:shadow-none transition-all">
                <Scissors className="w-4 h-4 stroke-[2.5]" />
              </div>
              <span className="font-black text-sm min-[420px]:text-base sm:text-lg tracking-tight uppercase">
                OPUS<span className="bg-[#FFC700] px-1 ml-0.5 border border-black">STUDIO</span>
              </span>
            </Link>

            <div className="hidden sm:flex items-center gap-2 text-xs border-2 border-black px-2.5 py-1 bg-[#F8F7F4] font-bold">
              <span className="w-2 h-2 rounded-full bg-emerald-500 border border-black animate-pulse" />
              <span className="uppercase tracking-wider">AI ENGINE READY</span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-3">
            <Link
              href="/editor"
              className="px-2 sm:px-3 py-1.5 text-xs font-black uppercase tracking-wider bg-white hover:bg-[#FFC700] border-2 border-black shadow-[2px_2px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all flex items-center gap-1.5"
            >
              <Sliders className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Studio Editor</span>
            </Link>

            <Link
              href="/schedule"
              className="px-2 sm:px-3 py-1.5 text-xs font-black uppercase tracking-wider bg-white hover:bg-[#FFC700] border-2 border-black shadow-[2px_2px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all flex items-center gap-1.5"
            >
              <Calendar className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Scheduler</span>
            </Link>

            <button
              onClick={() => setSettingsOpen(true)}
              className="px-2 sm:px-3 py-1.5 text-xs font-black uppercase tracking-wider bg-white hover:bg-[#FFC700] border-2 border-black shadow-[2px_2px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Key className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">API Keys</span>
            </button>

            <button
              onClick={() => setActiveTab("upload")}
              className="px-2.5 sm:px-3.5 py-1.5 text-xs font-black uppercase tracking-wider text-black bg-[#FFC700] hover:bg-[#FF5500] hover:text-white border-2 border-black shadow-[2px_2px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5 stroke-[3]" />
              <span className="hidden sm:inline">New Clip</span>
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

        {/* Phase 4: Active Job Floating Banner if modal is dismissed while in progress */}
        {!isProcessing && currentJobId && jobStatus && jobStatus !== "done" && jobStatus !== "failed" && (
          <div className="mb-6 p-3 bg-[#FFFBEA] border-2 border-black shadow-[4px_4px_0px_#000000] flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-6 h-6 bg-[#FFC700] border border-black flex items-center justify-center">
                <Wand2 className="w-3.5 h-3.5 animate-spin text-black" />
              </div>
              <div className="text-xs">
                <span className="font-black uppercase mr-2 tracking-wider">Background Task:</span>
                <span className="font-mono text-neutral-800 font-bold">{processingStage} ({jobProgress}%)</span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsProcessing(true)}
              className="px-3 py-1 bg-black text-white hover:bg-[#FFC700] hover:text-black font-black text-xs uppercase border border-black transition cursor-pointer"
            >
              View Progress
            </button>
          </div>
        )}

        {/* Processing Modal Overlay */}
        {isProcessing && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white max-w-md w-full p-8 border-4 border-black shadow-[8px_8px_0px_#000000] text-center">
              {jobStatus === "failed" ? (
                <div>
                  <div className="w-16 h-16 bg-[#FFE5E5] border-2 border-black text-red-600 flex items-center justify-center mx-auto mb-4 shadow-[3px_3px_0px_#000000]">
                    <AlertCircle className="w-8 h-8 stroke-[2.5]" />
                  </div>
                  <h3 className="text-xl font-black uppercase tracking-tight text-black mb-1">
                    Processing Halted
                  </h3>
                  <div className="text-xs text-red-700 font-mono font-bold mb-5 p-3 border-2 border-black bg-[#FFE5E5] text-left break-words">
                    {errorMsg || "An error occurred during stage execution."}
                  </div>
                  <div className="flex gap-2 justify-center">
                    <button
                      type="button"
                      disabled={isRetrying}
                      onClick={handleRetryJob}
                      className="px-4 py-2.5 bg-[#FFC700] hover:bg-[#FF5500] hover:text-white border-2 border-black font-black text-xs uppercase shadow-[3px_3px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5 transition cursor-pointer flex items-center gap-2"
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>{isRetrying ? "Resuming..." : "Retry From Failed Stage"}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        stopPolling();
                        setIsProcessing(false);
                        localStorage.removeItem("active_job_id");
                        setErrorMsg("");
                      }}
                      className="px-4 py-2.5 bg-white hover:bg-black hover:text-white border-2 border-black font-black text-xs uppercase transition cursor-pointer"
                    >
                      Dismiss
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <div className="w-16 h-16 bg-[#FFC700] border-2 border-black text-black flex items-center justify-center mx-auto mb-4 shadow-[3px_3px_0px_#000000]">
                    <Wand2 className="w-8 h-8 animate-spin" />
                  </div>

                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 bg-black text-white font-mono">
                      {jobStatus ? `STAGE: ${jobStatus.toUpperCase()}` : "QUEUED"}
                    </span>
                    <span className="text-sm font-black font-mono text-black">
                      {jobProgress}%
                    </span>
                  </div>

                  <h3 className="text-xl font-black uppercase tracking-tight text-black mb-2">
                    Processing Video
                  </h3>
                  <p className="text-xs text-black font-mono font-bold mb-4 uppercase border-2 border-black bg-[#F8F7F4] py-2 px-3 min-h-[44px] flex items-center justify-center text-center">
                    {processingStage}
                  </p>

                  <div className="w-full bg-[#F8F7F4] h-5 border-2 border-black overflow-hidden p-0.5 mb-4">
                    <div
                      className="bg-[#FFC700] h-full transition-all duration-300 border-r-2 border-black"
                      style={{ width: `${Math.max(5, Math.min(100, jobProgress))}%` }}
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setIsProcessing(false);
                    }}
                    className="text-[11px] font-bold text-neutral-600 hover:text-black uppercase underline cursor-pointer"
                  >
                    Run in Background (Resume anytime)
                  </button>
                </div>
              )}
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
                            src={(clip as any).previewUrl ? `${(clip as any).previewUrl}#t=0.1` : `${clip.videoUrl}#t=${clip.startTime || 0.1}`}
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
                      <div className="relative w-[260px] max-w-full sm:w-[280px] h-[480px] bg-black border-2 border-black overflow-hidden shadow-[4px_4px_0px_#000000] flex flex-col">
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
                                  src={(selectedClip as any).previewUrl || (selectedClip as any).renderedVideoUrl || selectedClip.videoUrl}
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
                                  src={(selectedClip as any).previewUrl || (selectedClip as any).renderedVideoUrl || selectedClip.videoUrl}
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
                                src={(selectedClip as any).previewUrl || (selectedClip as any).renderedVideoUrl || selectedClip.videoUrl}
                                className="absolute inset-0 w-full h-full object-cover blur-2xl scale-125 opacity-70"
                                preload="auto"
                                muted
                                playsInline
                              />
                              {/* Centered 16:9 Foreground */}
                              <video
                                ref={videoRef}
                                key={`fit-${selectedClip.id}-${(selectedClip as any).renderedVideoUrl || ""}`}
                                src={(selectedClip as any).previewUrl || (selectedClip as any).renderedVideoUrl || selectedClip.videoUrl}
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
                                src={(selectedClip as any).previewUrl || (selectedClip as any).renderedVideoUrl || selectedClip.videoUrl}
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
                      <div className="flex gap-3 mt-3 text-[11px] font-black uppercase tracking-wide">
                        <span className="px-2 py-1 border border-black bg-white">Hook {selectedClip.hookStrength}</span>
                        <span className="px-2 py-1 border border-black bg-white">Retention {selectedClip.engagementScore}</span>
                        <span className="px-2 py-1 border border-black bg-white">Trend {selectedClip.trendMatch}</span>
                      </div>
                      {selectedClip.description && (
                        <div className="mt-3 pt-3 border-t border-dashed border-neutral-300">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] font-black uppercase tracking-wider text-neutral-500">Post caption</span>
                            <button
                              type="button"
                              onClick={() => navigator.clipboard?.writeText(selectedClip.description || "")}
                              className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 border border-black bg-[#FFC700] hover:bg-[#ffd83d]"
                            >
                              Copy
                            </button>
                          </div>
                          <p className="text-xs text-neutral-800 leading-relaxed font-medium">{selectedClip.description}</p>
                        </div>
                      )}
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
                  className="w-full bg-[#F8F7F4] text-black text-base sm:text-sm px-4 py-3 border-2 border-black placeholder:text-neutral-500 focus:outline-none focus:bg-white focus:shadow-[3px_3px_0px_#000000] transition-all font-mono"
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
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={removeSilences}
                    onChange={(e) => setRemoveSilences(e.target.checked)}
                    className="w-4 h-4 accent-black cursor-pointer"
                  />
                  <span className="text-xs font-black uppercase tracking-wider text-black">
                    Remove silences, pauses &amp; fillers
                  </span>
                  <span className="text-[10px] font-medium text-neutral-500 normal-case tracking-normal">
                    Tightens each clip by cutting pauses over half a second and um/uh fillers
                  </span>
                </label>
              </div>

              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-black mb-1.5">
                  Caption Style
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {(["kinetic", "hormozi", "neon", "beast", "clean"] as const).map((st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setJobCaptionStyle(st)}
                      className={`px-2.5 py-1.5 border-2 border-black text-[10px] font-black uppercase cursor-pointer ${
                        jobCaptionStyle === st ? "bg-black text-white shadow-[2px_2px_0px_#FFC700]" : "bg-[#F8F7F4] hover:bg-white text-black"
                      }`}
                    >
                      {st === "kinetic" ? "⚡ Kinetic" : st}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] font-medium text-neutral-500 mt-1">
                  Kinetic = huge center-screen words that pop per phrase, like high-retention edits.
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={brollEnabled}
                    onChange={(e) => setBrollEnabled(e.target.checked)}
                    className="w-4 h-4 accent-black cursor-pointer"
                  />
                  <span className="text-xs font-black uppercase tracking-wider text-black">AI B-Roll cutaways</span>
                  <span className="text-[10px] font-medium text-neutral-500 normal-case tracking-normal">
                    AI picks stock photos/videos that match each sentence and cuts away to them
                  </span>
                </label>
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={musicBedEnabled}
                    onChange={(e) => setMusicBedEnabled(e.target.checked)}
                    className="w-4 h-4 accent-black cursor-pointer"
                  />
                  <span className="text-xs font-black uppercase tracking-wider text-black">Music bed + punch-in zooms</span>
                  <span className="text-[10px] font-medium text-neutral-500 normal-case tracking-normal">
                    Quiet background pad that ducks under speech, plus zoom punches on big words
                  </span>
                </label>
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
                  className="w-full bg-[#F8F7F4] text-black text-base sm:text-sm px-4 py-2.5 border-2 border-black placeholder:text-neutral-500 focus:outline-none focus:bg-white focus:shadow-[3px_3px_0px_#000000] transition-all"
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

        {tokenPromptOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
            <div className="bg-[#F8F7F4] border-4 border-black p-6 max-w-md w-full shadow-[8px_8px_0px_#000000]">
              <div className="flex items-center gap-2 mb-3">
                <Lock className="w-5 h-5 text-[#FF5500]" />
                <h3 className="text-lg font-black uppercase text-black">Access Token Required</h3>
              </div>
              <p className="text-xs text-neutral-600 mb-4 font-medium">
                This server requires a shared secret access token (<code className="bg-black/10 px-1 py-0.5 rounded font-mono">APP_ACCESS_TOKEN</code>) to execute processing tasks.
              </p>
              <input
                type="password"
                value={inputToken}
                onChange={(e) => { setInputToken(e.target.value); setTokenError(""); }}
                placeholder="Enter access token..."
                className="w-full bg-white border-2 border-black px-4 py-2.5 text-base sm:text-sm text-black mb-2 focus:outline-none focus:shadow-[3px_3px_0px_#000000]"
              />
              {tokenError ? (
                <p className="text-xs font-bold text-red-600 mb-3">{tokenError}</p>
              ) : (
                <div className="mb-2" />
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    tokenPromptSuppressedRef.current = true;
                    setTokenPromptOpen(false);
                  }}
                  className="px-4 py-2 border-2 border-black text-xs font-black uppercase hover:bg-neutral-200"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (inputToken.trim()) {
                      localStorage.setItem("app_access_token", inputToken.trim());
                      document.cookie = `app_access_token=${encodeURIComponent(inputToken.trim())}; path=/; max-age=31536000; SameSite=Lax`;
                      setTokenPromptOpen(false);
                    }
                  }}
                  className="px-4 py-2 bg-[#FFC700] hover:bg-[#FF5500] hover:text-white border-2 border-black text-xs font-black uppercase shadow-[3px_3px_0px_#000000] active:translate-x-0.5 active:translate-y-0.5"
                >
                  Save Token
                </button>
              </div>
            </div>
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
