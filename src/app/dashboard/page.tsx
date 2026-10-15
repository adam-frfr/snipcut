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
  Share2,
  Sliders,
  Video,
  Wand2,
  Link2,
  Upload,
  Calendar,
  Layers,
  CheckCircle2,
  TrendingUp,
  Volume2,
  VolumeX,
  ArrowRight,
  Plus,
  RefreshCw,
  Clock,
  ChevronRight,
  Filter,
  Key,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import ApiSettingsModal from "@/components/ApiSettingsModal";
import { SAMPLE_VIDEOS, MOCK_CLIPS, GeneratedClip } from "@/lib/mockData";
import confetti from "canvas-confetti";

function DashboardContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // State
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"clips" | "projects" | "upload">("clips");
  const [clips, setClips] = useState<GeneratedClip[]>(MOCK_CLIPS);
  const [selectedClip, setSelectedClip] = useState<GeneratedClip>(MOCK_CLIPS[0]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [currentWordIdx, setCurrentWordIdx] = useState(0);

  // Ingestion form state
  const [urlInput, setUrlInput] = useState("");
  const [promptInput, setPromptInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStage, setProcessingStage] = useState(0);

  const stages = [
    "Downloading video stream & demuxing audio tracks...",
    "Running OpenAI Whisper speech-to-text diarization...",
    "Computer Vision: Detecting active speakers & tracking faces...",
    "ClipAnything™: Extracting high-retention golden nuggets & hooks...",
    "Synthesizing dynamic animated captions & emoji triggers...",
    "Calculating AI Virality Score™ & formatting 9:16 layout...",
  ];

  // Auto-start generation if navigated from hero
  useEffect(() => {
    if (searchParams.get("autostart") === "true") {
      runAiPipeline();
    }
    const sampleId = searchParams.get("source");
    if (sampleId && sampleId !== "custom") {
      const match = SAMPLE_VIDEOS.find((s) => s.id === sampleId);
      if (match) {
        setUrlInput(match.sourceUrl);
      }
    }
  }, [searchParams]);

  const runAiPipeline = () => {
    setIsProcessing(true);
    setProcessingStage(0);

    const interval = setInterval(() => {
      setProcessingStage((prev) => {
        if (prev < stages.length - 1) {
          return prev + 1;
        } else {
          clearInterval(interval);
          setIsProcessing(false);
          setActiveTab("clips");
          try {
            confetti({
              particleCount: 80,
              spread: 60,
              origin: { y: 0.6 },
            });
          } catch (e) {}
          return prev;
        }
      });
    }, 1200);
  };

  // Animate dynamic captions when playing
  useEffect(() => {
    if (!isPlaying || !selectedClip) return;
    const interval = setInterval(() => {
      setCurrentWordIdx((prev) => (prev + 1) % (selectedClip.transcript.length || 1));
    }, 1400);
    return () => clearInterval(interval);
  }, [isPlaying, selectedClip]);

  const handleDownload = (clip: GeneratedClip) => {
    try {
      confetti({
        particleCount: 50,
        spread: 50,
        origin: { y: 0.7 },
      });
    } catch (e) {}
    alert(`Downloading "${clip.title}" in 1080p 60fps MP4!`);
  };

  return (
    <div className="min-h-screen bg-[#08090E] text-white">
      {/* Studio Top Navigation */}
      <header className="sticky top-0 z-40 bg-[#090A10]/90 backdrop-blur-xl border-b border-white/[0.08] px-4 sm:px-6 lg:px-8 py-3">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          {/* Logo & Workspace */}
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

            <div className="hidden md:flex items-center gap-2 pl-6 border-l border-white/[0.08] text-xs">
              <span className="text-zinc-400">Project:</span>
              <span className="font-bold text-white bg-white/[0.05] px-2.5 py-1 rounded-lg border border-white/[0.08]">
                Personal Repurposing Lab
              </span>
            </div>
          </div>

          {/* Credits remaining & action buttons */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-purple-950/30 border border-purple-500/30 text-xs">
              <Sparkles className="w-3.5 h-3.5 text-amber-300" />
              <span className="font-bold text-purple-200">84 / 90 Mins Free</span>
            </div>

            <Link
              href="/editor"
              className="px-3.5 py-1.5 text-xs font-bold rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.1] text-zinc-200 transition-colors flex items-center gap-1.5"
            >
              <Sliders className="w-3.5 h-3.5 text-cyan-400" />
              <span>Opus Editor</span>
            </Link>

            <Link
              href="/schedule"
              className="px-3.5 py-1.5 text-xs font-bold rounded-xl bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.1] text-zinc-200 transition-colors flex items-center gap-1.5"
            >
              <Calendar className="w-3.5 h-3.5 text-pink-400" />
              <span>Scheduler</span>
            </Link>

            <button
              onClick={() => setSettingsOpen(true)}
              className="px-3.5 py-1.5 text-xs font-bold rounded-xl bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/25 text-purple-300 hover:text-white transition-colors flex items-center gap-1.5 cursor-pointer"
              title="Configure OpenAI and Claude API Keys"
            >
              <Key className="w-3.5 h-3.5 text-purple-400" />
              <span>API Keys</span>
            </button>

            <button
              onClick={() => setActiveTab("upload")}
              className="btn-primary-gradient px-4 py-1.5 text-xs font-bold text-white rounded-xl flex items-center gap-1.5 shadow-lg shadow-purple-600/30"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Clip Project</span>
            </button>
          </div>
        </div>

        {/* API Settings Modal */}
        <ApiSettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
      </header>

      {/* Main Studio Viewport */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Processing Modal Overlay */}
        {isProcessing && (
          <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
            <div className="glass-panel-glow max-w-lg w-full p-8 rounded-3xl border border-purple-500/40 text-center shadow-2xl animate-in zoom-in-95 duration-200">
              <div className="w-16 h-16 rounded-2xl bg-purple-600/20 border border-purple-500/40 text-purple-400 flex items-center justify-center mx-auto mb-6 relative">
                <Wand2 className="w-8 h-8 animate-pulse text-purple-300" />
                <span className="absolute -top-1 -right-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-purple-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-purple-500"></span>
                </span>
              </div>

              <h3 className="text-xl font-black text-white mb-2">Generating Viral Clips</h3>
              <p className="text-xs text-zinc-400 mb-6">
                OpusClip AI is analyzing narrative flow, facial speaker focus, and generating viral subtitles.
              </p>

              {/* Step indicator */}
              <div className="space-y-3 text-left mb-6 bg-black/40 p-4 rounded-2xl border border-white/[0.08]">
                {stages.map((stg, sIdx) => {
                  const isDone = sIdx < processingStage;
                  const isCurrent = sIdx === processingStage;
                  return (
                    <div
                      key={sIdx}
                      className={`flex items-center gap-3 text-xs transition-colors ${
                        isCurrent
                          ? "text-purple-300 font-bold"
                          : isDone
                          ? "text-emerald-400"
                          : "text-zinc-600"
                      }`}
                    >
                      {isDone ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                      ) : isCurrent ? (
                        <div className="w-4 h-4 border-2 border-purple-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                      ) : (
                        <div className="w-4 h-4 rounded-full border border-zinc-700 flex-shrink-0" />
                      )}
                      <span>{stg}</span>
                    </div>
                  );
                })}
              </div>

              {/* Progress bar */}
              <div className="w-full bg-white/[0.08] h-2 rounded-full overflow-hidden">
                <div
                  className="bg-gradient-to-r from-purple-500 to-cyan-400 h-full rounded-full transition-all duration-300"
                  style={{ width: `${((processingStage + 1) / stages.length) * 100}%` }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Tab Controls: Clips Gallery vs New Upload vs Projects */}
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
              <span>Generated Viral Clips ({clips.length})</span>
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
            <button
              onClick={() => setActiveTab("projects")}
              className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center gap-2 ${
                activeTab === "projects"
                  ? "bg-purple-600 text-white shadow-lg shadow-purple-600/30"
                  : "text-zinc-400 hover:text-white hover:bg-white/[0.04]"
              }`}
            >
              <Video className="w-4 h-4" />
              <span>Source Videos (4)</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={runAiPipeline}
              className="px-3 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-xs font-semibold text-zinc-300 flex items-center gap-1.5 transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Re-analyze All</span>
            </button>
          </div>
        </div>

        {/* View 1: Generated Clips Gallery */}
        {activeTab === "clips" && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left Clips List */}
            <div className="lg:col-span-7 space-y-4">
              <div className="flex items-center justify-between text-xs text-zinc-400 font-semibold px-1">
                <span>Ranked by AI Virality Score™</span>
                <span>4 Clips Ready for Export</span>
              </div>

              {clips.map((clip, index) => {
                const isSelected = selectedClip.id === clip.id;
                return (
                  <div
                    key={clip.id}
                    onClick={() => {
                      setSelectedClip(clip);
                      setCurrentWordIdx(0);
                    }}
                    className={`p-4 sm:p-5 rounded-2xl border transition-all cursor-pointer flex flex-col sm:flex-row items-start sm:items-center gap-4 ${
                      isSelected
                        ? "bg-purple-950/40 border-purple-500 shadow-xl shadow-purple-900/30 ring-1 ring-purple-500"
                        : "glass-panel hover:bg-white/[0.04] border-white/[0.08]"
                    }`}
                  >
                    {/* Thumbnail with Virality Badge */}
                    <div className="relative w-full sm:w-36 h-28 sm:h-24 rounded-xl overflow-hidden flex-shrink-0 bg-black">
                      <img
                        src={clip.thumbnailUrl}
                        alt={clip.title}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute top-1.5 left-1.5 px-2 py-0.5 rounded-md bg-black/80 backdrop-blur-md text-[10px] font-black text-emerald-400 flex items-center gap-1 border border-emerald-500/30">
                        <Flame className="w-3 h-3 fill-emerald-400" />
                        <span>{clip.viralityScore}</span>
                      </div>
                      <div className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/80 text-[10px] text-zinc-300 font-mono">
                        {clip.duration}
                      </div>
                    </div>

                    {/* Clip Metadata */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-extrabold px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 uppercase">
                          Clip #{index + 1}
                        </span>
                        <span className="text-[11px] text-zinc-400">{clip.aspectRatio} Vertical</span>
                        <span className="text-[11px] text-zinc-400">•</span>
                        <span className="text-[11px] text-zinc-400 capitalize">{clip.captionStyle} Style</span>
                      </div>

                      <h4 className="text-sm font-bold text-white truncate mb-1">{clip.title}</h4>

                      <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed mb-3">
                        {clip.viralityReason}
                      </p>

                      {/* Micro score breakdown */}
                      <div className="flex items-center gap-3 text-[11px]">
                        <span className="text-emerald-400 font-semibold">Hook: {clip.hookStrength}%</span>
                        <span className="text-zinc-600">•</span>
                        <span className="text-cyan-400 font-semibold">Retention: {clip.engagementScore}%</span>
                        <span className="text-zinc-600">•</span>
                        <span className="text-purple-400 font-semibold">Trend: {clip.trendMatch}%</span>
                      </div>
                    </div>

                    {/* Quick action buttons */}
                    <div className="flex sm:flex-col gap-2 w-full sm:w-auto pt-2 sm:pt-0 border-t sm:border-t-0 border-white/[0.06]">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDownload(clip);
                        }}
                        className="flex-1 sm:flex-none p-2 rounded-xl bg-purple-600/30 hover:bg-purple-600 text-purple-300 hover:text-white border border-purple-500/30 text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                        title="Download 1080p MP4"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span className="sm:hidden">Download</span>
                      </button>

                      <Link
                        href={`/editor?clip=${clip.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="flex-1 sm:flex-none p-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-zinc-300 hover:text-white border border-white/[0.08] text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                        title="Open in Opus Editor"
                      >
                        <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                        <span className="sm:hidden">Edit</span>
                      </Link>

                      <Link
                        href={`/schedule?clip=${clip.id}`}
                        onClick={(e) => e.stopPropagation()}
                        className="flex-1 sm:flex-none p-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-zinc-300 hover:text-white border border-white/[0.08] text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors"
                        title="Schedule Post"
                      >
                        <Calendar className="w-3.5 h-3.5 text-pink-400" />
                        <span className="sm:hidden">Schedule</span>
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Right Live Player & Virality Analysis */}
            <div className="lg:col-span-5 space-y-5">
              {/* Vertical Short Live Player */}
              <div className="glass-panel-glow p-5 rounded-3xl border border-white/[0.12] flex flex-col items-center">
                <div className="relative w-[260px] sm:w-[280px] h-[480px] bg-black rounded-2xl overflow-hidden shadow-2xl border border-white/[0.1] flex flex-col">
                  {/* Top overlay */}
                  <div className="absolute top-0 left-0 right-0 z-30 p-3 flex items-center justify-between bg-gradient-to-b from-black/80 to-transparent">
                    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-md text-[10px] font-black text-emerald-400 border border-emerald-500/30">
                      <Flame className="w-3 h-3 fill-emerald-400" />
                      <span>{selectedClip.viralityScore} Virality Score</span>
                    </div>
                    <button
                      onClick={() => setIsMuted(!isMuted)}
                      className="p-1.5 rounded-full bg-black/60 text-white"
                    >
                      {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                    </button>
                  </div>

                  {/* Video Viewport */}
                  <div className="relative flex-1 bg-zinc-950 flex flex-col">
                    {selectedClip.layout === "split-screen" ? (
                      <div className="flex-1 flex flex-col h-full">
                        <div className="relative flex-1 overflow-hidden border-b border-purple-500/20">
                          <img
                            src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600&auto=format&fit=crop&q=80"
                            alt="Host"
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="relative flex-1 overflow-hidden">
                          <img
                            src={selectedClip.thumbnailUrl}
                            alt="Guest"
                            className="w-full h-full object-cover scale-105"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="relative w-full h-full">
                        <img
                          src={selectedClip.thumbnailUrl}
                          alt="Centered Speaker"
                          className="w-full h-full object-cover scale-110"
                        />
                      </div>
                    )}

                    {/* Dynamic Subtitle overlay */}
                    <div className="absolute bottom-12 inset-x-2 z-30 text-center pointer-events-none">
                      <div className="inline-block px-3 py-1.5 rounded-xl bg-black/50 backdrop-blur-sm">
                        <div className="caption-hormozi text-xl text-yellow-300">
                          {selectedClip.transcript[currentWordIdx]?.text || "Viral moment"}{" "}
                          {selectedClip.transcript[currentWordIdx]?.emoji && (
                            <span>{selectedClip.transcript[currentWordIdx].emoji}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Bottom Play bar */}
                    <div className="absolute bottom-2 inset-x-3 flex items-center justify-between z-30">
                      <button
                        onClick={() => setIsPlaying(!isPlaying)}
                        className="p-2 rounded-full bg-black/70 text-white hover:bg-black"
                      >
                        {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                      </button>
                      <span className="text-[10px] text-zinc-400 font-mono">
                        00:0{currentWordIdx} / {selectedClip.duration}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Primary Action Buttons */}
                <div className="w-full grid grid-cols-2 gap-2 mt-5">
                  <button
                    onClick={() => handleDownload(selectedClip)}
                    className="btn-primary-gradient py-2.5 rounded-xl font-bold text-xs text-white flex items-center justify-center gap-1.5 cursor-pointer shadow-lg shadow-purple-600/30"
                  >
                    <Download className="w-4 h-4" />
                    <span>Download 1080p</span>
                  </button>
                  <Link
                    href={`/editor?clip=${selectedClip.id}`}
                    className="py-2.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-white font-bold text-xs flex items-center justify-center gap-1.5 border border-white/[0.1] transition-colors"
                  >
                    <Sliders className="w-4 h-4 text-cyan-400" />
                    <span>Edit in Studio</span>
                  </Link>
                </div>
              </div>

              {/* Virality Diagnostic Inspector Card */}
              <div className="glass-panel p-5 rounded-3xl border border-white/[0.08]">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs font-bold text-white uppercase tracking-wider">
                      AI Virality Diagnostic
                    </span>
                  </div>
                  <span className="text-xs font-black text-emerald-400">
                    {selectedClip.viralityScore} / 100
                  </span>
                </div>

                <div className="space-y-3 mb-4">
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-zinc-400">Hook Strength (0-3s)</span>
                      <span className="font-bold text-white">{selectedClip.hookStrength}%</span>
                    </div>
                    <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-emerald-400 h-full rounded-full"
                        style={{ width: `${selectedClip.hookStrength}%` }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-zinc-400">Engagement & Flow</span>
                      <span className="font-bold text-white">{selectedClip.engagementScore}%</span>
                    </div>
                    <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-cyan-400 h-full rounded-full"
                        style={{ width: `${selectedClip.engagementScore}%` }}
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-zinc-400">Trend Alignment</span>
                      <span className="font-bold text-white">{selectedClip.trendMatch}%</span>
                    </div>
                    <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                      <div
                        className="bg-purple-400 h-full rounded-full"
                        style={{ width: `${selectedClip.trendMatch}%` }}
                      />
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06] text-xs text-zinc-300 leading-relaxed">
                  <span className="font-bold text-purple-300">AI Recommendation:</span> Post to TikTok between 6:00 PM – 8:30 PM with the suggested hook title. High probability of algorithmic retention spike.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* View 2: Import New Video */}
        {activeTab === "upload" && (
          <div className="max-w-2xl mx-auto glass-panel-glow p-8 rounded-3xl border border-white/[0.12]">
            <h3 className="text-xl font-black text-white mb-2">Import Video for AI Repurposing</h3>
            <p className="text-xs text-zinc-400 mb-6">
              Paste a link or pick a demo sample to generate 10 viral clips.
            </p>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                runAiPipeline();
              }}
              className="space-y-4"
            >
              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-1.5">
                  YouTube, Twitch, Vimeo, or Google Drive URL
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
                  ClipAnything™ Prompt (Optional)
                </label>
                <input
                  type="text"
                  value={promptInput}
                  onChange={(e) => setPromptInput(e.target.value)}
                  placeholder="e.g. Find the most controversial statement about technology..."
                  className="w-full glass-input text-white text-sm px-4 py-3 rounded-xl focus:ring-1 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-300 mb-2">
                  Or Pick a Ready Demo Podcast:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {SAMPLE_VIDEOS.map((s) => (
                    <button
                      type="button"
                      key={s.id}
                      onClick={() => setUrlInput(s.sourceUrl)}
                      className="p-2.5 rounded-xl border border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.06] text-left text-xs"
                    >
                      <div className="font-bold text-white truncate">{s.title}</div>
                      <div className="text-[10px] text-zinc-400 mt-0.5">{s.channel}</div>
                    </button>
                  ))}
                </div>
              </div>

              <button
                type="submit"
                className="w-full btn-primary-gradient py-3.5 rounded-xl font-bold text-white text-sm mt-4 shadow-xl shadow-purple-600/30 flex items-center justify-center gap-2 cursor-pointer"
              >
                <Sparkles className="w-4 h-4 text-amber-300" />
                <span>Run OpusClip AI Pipeline</span>
              </button>
            </form>
          </div>
        )}

        {/* View 3: Source Videos */}
        {activeTab === "projects" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {SAMPLE_VIDEOS.map((sample) => (
              <div
                key={sample.id}
                className="glass-panel rounded-2xl overflow-hidden border border-white/[0.08] hover:border-purple-500/40 transition-colors p-3"
              >
                <img
                  src={sample.thumbnail}
                  alt={sample.title}
                  className="w-full h-36 object-cover rounded-xl mb-3"
                />
                <h4 className="text-xs font-bold text-white truncate">{sample.title}</h4>
                <div className="text-[11px] text-zinc-400 mt-1 flex items-center justify-between">
                  <span>{sample.channel}</span>
                  <span className="font-mono">{sample.duration}</span>
                </div>
                <button
                  onClick={() => {
                    setUrlInput(sample.sourceUrl);
                    runAiPipeline();
                  }}
                  className="w-full mt-3 py-2 rounded-xl bg-purple-600/30 hover:bg-purple-600 text-purple-300 hover:text-white text-xs font-bold transition-colors flex items-center justify-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Generate Clips</span>
                </button>
              </div>
            ))}
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
