"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  Link2,
  Upload,
  Play,
  ArrowRight,
  CheckCircle2,
  Sliders,
  Flame,
  Bot,
  Video,
  Layers,
} from "lucide-react";
import { SAMPLE_VIDEOS } from "@/lib/mockData";

export default function HeroSection() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"url" | "upload" | "sample">("url");
  const [urlInput, setUrlInput] = useState("");
  const [promptInput, setPromptInput] = useState("");
  const [selectedDuration, setSelectedDuration] = useState("auto");
  const [selectedRatio, setSelectedRatio] = useState<"9:16" | "1:1" | "16:9">("9:16");
  const [selectedSample, setSelectedSample] = useState(SAMPLE_VIDEOS[0]);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleGenerate = (e: React.FormEvent) => {
    e.preventDefault();
    setIsProcessing(true);
    // Encode parameters to pass to dashboard
    const params = new URLSearchParams({
      source: activeTab === "sample" ? selectedSample.id : "custom",
      url: activeTab === "url" ? urlInput || "https://youtube.com/watch?v=sample-sam-altman" : selectedSample.sourceUrl,
      prompt: promptInput,
      duration: selectedDuration,
      ratio: selectedRatio,
      autostart: "true",
    });
    setTimeout(() => {
      router.push(`/dashboard?${params.toString()}`);
    }, 600);
  };

  const handleSelectSample = (sample: typeof SAMPLE_VIDEOS[0]) => {
    setSelectedSample(sample);
    setUrlInput(sample.sourceUrl);
    setPromptInput(`Find the most contrarian and viral insights by ${sample.speaker1}`);
  };

  return (
    <section className="relative pt-32 pb-20 md:pt-40 md:pb-28 overflow-hidden">
      {/* Background radial ambient lights */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[500px] bg-gradient-to-tr from-[#6723FF]/25 via-[#9333EA]/20 to-[#06B6D4]/15 blur-[120px] rounded-full pointer-events-none -z-10 animate-pulse-glow" />
      <div className="absolute top-12 left-10 w-96 h-96 bg-purple-900/15 blur-[100px] rounded-full pointer-events-none -z-10" />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        {/* Top Announcement Pill */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass-panel border-purple-500/30 text-xs text-purple-200 mb-8 animate-in fade-in duration-500">
          <span className="flex h-2 w-2 rounded-full bg-[#10B981] animate-ping" />
          <span className="font-semibold text-white">Introducing ClipAnything™ 2.0:</span>
          <span>Prompt with natural language to clip anything</span>
          <ArrowRight className="w-3.5 h-3.5 text-purple-400" />
        </div>

        {/* Main Headline */}
        <h1 className="text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-tight text-white max-w-4xl mx-auto leading-[1.12]">
          1 Long Video.{" "}
          <span className="gradient-text-purple">10 Viral Shorts.</span>
          <br />
          <span className="text-zinc-200">10x Faster with AI.</span>
        </h1>

        {/* Subtitle */}
        <p className="mt-6 text-lg sm:text-xl text-zinc-400 max-w-2xl mx-auto font-normal leading-relaxed">
          OpusClip is the #1 AI video clipping tool. Automatically turn podcasts, interviews, and long videos into viral TikToks, YouTube Shorts, and Instagram Reels with dynamic captions, auto-reframe, and Virality Score™.
        </p>

        {/* Interactive Ingestion Card */}
        <div className="mt-12 max-w-3xl mx-auto glass-panel-glow rounded-3xl p-4 sm:p-6 text-left shadow-2xl relative border border-white/[0.12]">
          {/* Tabs */}
          <div className="flex items-center gap-2 border-b border-white/[0.08] pb-4 mb-5">
            <button
              onClick={() => setActiveTab("url")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                activeTab === "url"
                  ? "bg-purple-600 text-white shadow-lg shadow-purple-600/30"
                  : "text-zinc-400 hover:text-white hover:bg-white/[0.05]"
              }`}
            >
              <Link2 className="w-4 h-4" />
              <span>YouTube / Link</span>
            </button>
            <button
              onClick={() => setActiveTab("upload")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                activeTab === "upload"
                  ? "bg-purple-600 text-white shadow-lg shadow-purple-600/30"
                  : "text-zinc-400 hover:text-white hover:bg-white/[0.05]"
              }`}
            >
              <Upload className="w-4 h-4" />
              <span>Upload Video</span>
            </button>
            <button
              onClick={() => {
                setActiveTab("sample");
                handleSelectSample(SAMPLE_VIDEOS[0]);
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${
                activeTab === "sample"
                  ? "bg-purple-600 text-white shadow-lg shadow-purple-600/30"
                  : "text-zinc-400 hover:text-white hover:bg-white/[0.05]"
              }`}
            >
              <Flame className="w-4 h-4 text-amber-400" />
              <span>Try Demo Samples</span>
              <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded font-bold">4 Ready</span>
            </button>
          </div>

          <form onSubmit={handleGenerate} className="space-y-4">
            {/* Tab 1: URL input */}
            {activeTab === "url" && (
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                  Paste YouTube, Twitch, Vimeo or Google Drive URL
                </label>
                <div className="relative">
                  <input
                    type="url"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=..."
                    className="w-full glass-input text-white text-sm sm:text-base px-4 py-3.5 pl-11 rounded-2xl placeholder:text-zinc-500 focus:ring-2 focus:ring-purple-500"
                  />
                  <Link2 className="w-5 h-5 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <button
                    type="button"
                    onClick={() => {
                      setUrlInput("https://www.youtube.com/watch?v=sample-sam-altman");
                      setPromptInput("Find the moment Sam Altman discusses the future of compute clusters");
                    }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-white/[0.08] hover:bg-white/[0.15] text-purple-300 transition-colors"
                  >
                    Paste Sample
                  </button>
                </div>
              </div>
            )}

            {/* Tab 2: Upload */}
            {activeTab === "upload" && (
              <div className="border-2 border-dashed border-white/[0.15] hover:border-purple-500/50 rounded-2xl p-6 text-center cursor-pointer transition-colors bg-white/[0.02]">
                <div className="w-12 h-12 rounded-full bg-purple-500/10 text-purple-400 flex items-center justify-center mx-auto mb-3">
                  <Upload className="w-6 h-6" />
                </div>
                <div className="text-sm font-semibold text-white">Drag & drop your video file here, or browse</div>
                <div className="text-xs text-zinc-500 mt-1">Supports MP4, MOV, MKV, WebM up to 10GB (10 hours)</div>
              </div>
            )}

            {/* Tab 3: Sample Picker */}
            {activeTab === "sample" && (
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-2">
                  Select a popular podcast or interview to test instant AI clipping:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {SAMPLE_VIDEOS.map((sample) => (
                    <div
                      key={sample.id}
                      onClick={() => handleSelectSample(sample)}
                      className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center gap-3 ${
                        selectedSample.id === sample.id
                          ? "bg-purple-950/40 border-purple-500 shadow-lg shadow-purple-900/30 ring-1 ring-purple-500"
                          : "bg-white/[0.03] border-white/[0.08] hover:bg-white/[0.06]"
                      }`}
                    >
                      <img
                        src={sample.thumbnail}
                        alt={sample.title}
                        className="w-14 h-12 object-cover rounded-lg flex-shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-semibold text-white truncate">{sample.title}</div>
                        <div className="text-[11px] text-zinc-400 flex items-center gap-1.5 mt-0.5">
                          <span>{sample.channel}</span>
                          <span>•</span>
                          <span>{sample.duration}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ClipAnything™ Prompting Input */}
            <div className="pt-1">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
                  <Bot className="w-3.5 h-3.5 text-purple-400" />
                  <span>ClipAnything™ Prompt (Optional)</span>
                </label>
                <span className="text-[11px] text-zinc-500">Natural Language AI</span>
              </div>
              <input
                type="text"
                value={promptInput}
                onChange={(e) => setPromptInput(e.target.value)}
                placeholder="e.g. Find moments about artificial intelligence, business mistakes, or high-energy arguments..."
                className="w-full glass-input text-white text-xs sm:text-sm px-4 py-2.5 rounded-xl placeholder:text-zinc-500 focus:ring-1 focus:ring-purple-500"
              />
            </div>

            {/* Settings Row: Ratio & Duration */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {/* Aspect Ratio */}
              <div>
                <label className="block text-[11px] font-medium text-zinc-400 mb-1.5 flex items-center gap-1">
                  <Video className="w-3 h-3 text-cyan-400" />
                  <span>Output Layout & Aspect Ratio</span>
                </label>
                <div className="grid grid-cols-3 gap-1.5 bg-black/40 p-1 rounded-xl border border-white/[0.08]">
                  <button
                    type="button"
                    onClick={() => setSelectedRatio("9:16")}
                    className={`py-1.5 text-xs font-medium rounded-lg transition-all ${
                      selectedRatio === "9:16"
                        ? "bg-purple-600 text-white font-semibold shadow"
                        : "text-zinc-400 hover:text-white"
                    }`}
                  >
                    9:16 Vertical
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedRatio("1:1")}
                    className={`py-1.5 text-xs font-medium rounded-lg transition-all ${
                      selectedRatio === "1:1"
                        ? "bg-purple-600 text-white font-semibold shadow"
                        : "text-zinc-400 hover:text-white"
                    }`}
                  >
                    1:1 Square
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedRatio("16:9")}
                    className={`py-1.5 text-xs font-medium rounded-lg transition-all ${
                      selectedRatio === "16:9"
                        ? "bg-purple-600 text-white font-semibold shadow"
                        : "text-zinc-400 hover:text-white"
                    }`}
                  >
                    16:9 Clip
                  </button>
                </div>
              </div>

              {/* Target Length */}
              <div>
                <label className="block text-[11px] font-medium text-zinc-400 mb-1.5 flex items-center gap-1">
                  <Sliders className="w-3 h-3 text-emerald-400" />
                  <span>Target Clip Length</span>
                </label>
                <select
                  value={selectedDuration}
                  onChange={(e) => setSelectedDuration(e.target.value)}
                  className="w-full glass-input text-white text-xs sm:text-sm px-3 py-2 rounded-xl border border-white/[0.1] bg-[#0C0E16]"
                >
                  <option value="auto">Auto (AI selects optimal length 30s-60s)</option>
                  <option value="under-30">&lt; 30 seconds (Max viral TikToks / Shorts)</option>
                  <option value="30-60">30 - 60 seconds (Standard Reels / Shorts)</option>
                  <option value="60-90">60 - 90 seconds (In-depth knowledge clips)</option>
                  <option value="over-90">90s - 3 mins (Mid-form narrative)</option>
                </select>
              </div>
            </div>

            {/* Submit Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isProcessing}
                className="w-full btn-primary-gradient py-4 rounded-2xl text-base sm:text-lg font-bold text-white flex items-center justify-center gap-2.5 cursor-pointer shadow-xl shadow-purple-600/30 hover:shadow-purple-600/50 transition-all disabled:opacity-60"
              >
                {isProcessing ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Analyzing Multimodal Video with AI...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5 text-amber-300" />
                    <span>Get Clips in 1-Click Free</span>
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Guarantee / trust */}
          <div className="mt-4 pt-3 border-t border-white/[0.06] flex flex-wrap items-center justify-between text-[11px] text-zinc-400 gap-2">
            <span className="flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              90 Free Credits on Sign-up
            </span>
            <span className="flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              No Credit Card Required
            </span>
            <span className="flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              1080p High-Resolution Output
            </span>
          </div>
        </div>

        {/* Brand logos / social proof */}
        <div className="mt-16 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-zinc-500 mb-6">
            Trusted by 20,000,000+ creators, podcasters, and global marketing teams
          </p>
          <div className="flex flex-wrap items-center justify-center gap-8 md:gap-14 opacity-60 grayscale hover:grayscale-0 transition-all text-sm font-bold tracking-tight text-zinc-400">
            <span className="hover:text-white transition-colors">HUBERMAN LAB</span>
            <span className="hover:text-white transition-colors">THE DIARY OF A CEO</span>
            <span className="hover:text-white transition-colors">ALL-IN PODCAST</span>
            <span className="hover:text-white transition-colors">MRBEAST MEDIA</span>
            <span className="hover:text-white transition-colors">HORMOZI NATION</span>
            <span className="hover:text-white transition-colors">Y COMBINATOR</span>
          </div>
        </div>
      </div>
    </section>
  );
}
