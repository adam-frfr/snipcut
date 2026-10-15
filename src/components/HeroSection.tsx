"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  Link2,
  Upload,
  ArrowRight,
  CheckCircle2,
  Sliders,
  Bot,
  Video,
} from "lucide-react";

export default function HeroSection() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"url" | "upload">("url");
  const [urlInput, setUrlInput] = useState("");
  const [promptInput, setPromptInput] = useState("");
  const [selectedDuration, setSelectedDuration] = useState("auto");
  const [selectedRatio, setSelectedRatio] = useState<"9:16" | "1:1" | "16:9">("9:16");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();

    if (activeTab === "upload" && uploadFile) {
      setIsUploading(true);
      try {
        const formData = new FormData();
        formData.append("file", uploadFile);
        const res = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });
        const data = await res.json();
        if (data.filePath) {
          const params = new URLSearchParams({
            filePath: data.filePath,
            fileUrl: data.fileUrl,
            fileName: data.fileName,
            prompt: promptInput,
            duration: selectedDuration,
            ratio: selectedRatio,
            autostart: "true",
          });
          router.push(`/dashboard?${params.toString()}`);
          return;
        }
      } catch (err) {
        alert("Upload failed. Please try again.");
      } finally {
        setIsUploading(false);
      }
    } else if (urlInput.trim()) {
      const params = new URLSearchParams({
        url: urlInput.trim(),
        prompt: promptInput,
        duration: selectedDuration,
        ratio: selectedRatio,
        autostart: "true",
      });
      router.push(`/dashboard?${params.toString()}`);
    } else {
      router.push("/dashboard");
    }
  };

  return (
    <section className="relative pt-32 pb-20 md:pt-40 md:pb-28 overflow-hidden">
      {/* Background ambient lighting */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[500px] bg-gradient-to-tr from-[#6723FF]/25 via-[#9333EA]/20 to-[#06B6D4]/15 blur-[120px] rounded-full pointer-events-none -z-10 animate-pulse-glow" />

      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        {/* Top Announcement Pill */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full glass-panel border-purple-500/30 text-xs text-purple-200 mb-8">
          <span className="flex h-2 w-2 rounded-full bg-[#10B981] animate-ping" />
          <span className="font-semibold text-white">ClipAnything™ Engine:</span>
          <span>Prompt with natural language to extract viral clips</span>
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
          The AI video clipping platform for creators. Turn long podcasts, interviews, and videos into viral clips for TikTok, YouTube Shorts, and Instagram Reels with dynamic captions, auto-reframe, and Virality Score™.
        </p>

        {/* Ingestion Card */}
        <div className="mt-12 max-w-3xl mx-auto glass-panel-glow rounded-3xl p-5 sm:p-7 text-left shadow-2xl relative border border-white/[0.12]">
          {/* Tabs */}
          <div className="flex items-center gap-2 border-b border-white/[0.08] pb-4 mb-5">
            <button
              type="button"
              onClick={() => setActiveTab("url")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                activeTab === "url"
                  ? "bg-purple-600 text-white shadow-lg shadow-purple-600/30"
                  : "text-zinc-400 hover:text-white hover:bg-white/[0.05]"
              }`}
            >
              <Link2 className="w-4 h-4" />
              <span>Paste Video URL</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("upload")}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all ${
                activeTab === "upload"
                  ? "bg-purple-600 text-white shadow-lg shadow-purple-600/30"
                  : "text-zinc-400 hover:text-white hover:bg-white/[0.05]"
              }`}
            >
              <Upload className="w-4 h-4" />
              <span>Upload Video File</span>
            </button>
          </div>

          <form onSubmit={handleGenerate} className="space-y-4">
            {/* Tab 1: URL input */}
            {activeTab === "url" && (
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                  Paste YouTube, Twitch, Vimeo, or Google Drive URL
                </label>
                <div className="relative">
                  <input
                    type="url"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=..."
                    className="w-full glass-input text-white text-sm sm:text-base px-4 py-3 pl-11 rounded-2xl placeholder:text-zinc-500 focus:ring-2 focus:ring-purple-500"
                  />
                  <Link2 className="w-5 h-5 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                </div>
              </div>
            )}

            {/* Tab 2: Upload */}
            {activeTab === "upload" && (
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1.5">
                  Select video from your device (MP4, MOV, WebM, MKV)
                </label>
                <div className="border-2 border-dashed border-white/[0.15] hover:border-purple-500/50 rounded-2xl p-6 text-center transition-colors bg-white/[0.02] relative">
                  <input
                    type="file"
                    accept="video/*"
                    onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <div className="w-12 h-12 rounded-full bg-purple-500/10 text-purple-400 flex items-center justify-center mx-auto mb-2 pointer-events-none">
                    <Upload className="w-6 h-6" />
                  </div>
                  <div className="text-sm font-semibold text-white pointer-events-none">
                    {uploadFile ? uploadFile.name : "Click or drag & drop video file here"}
                  </div>
                  <div className="text-xs text-zinc-500 mt-1 pointer-events-none">
                    {uploadFile
                      ? `${(uploadFile.size / (1024 * 1024)).toFixed(1)} MB selected`
                      : "Supports MP4, MOV, WebM up to 2GB"}
                  </div>
                </div>
              </div>
            )}

            {/* ClipAnything™ Prompting Input */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
                  <Bot className="w-3.5 h-3.5 text-purple-400" />
                  <span>ClipAnything™ Prompt (Optional)</span>
                </label>
                <span className="text-[11px] text-zinc-500">Natural Language Prompt</span>
              </div>
              <input
                type="text"
                value={promptInput}
                onChange={(e) => setPromptInput(e.target.value)}
                placeholder="e.g. Find high-energy debate, tactical advice, or funny moments..."
                className="w-full glass-input text-white text-xs sm:text-sm px-4 py-2.5 rounded-xl placeholder:text-zinc-500 focus:ring-1 focus:ring-purple-500"
              />
            </div>

            {/* Settings Row: Ratio & Duration */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {/* Aspect Ratio */}
              <div>
                <label className="block text-[11px] font-medium text-zinc-400 mb-1.5 flex items-center gap-1">
                  <Video className="w-3 h-3 text-cyan-400" />
                  <span>Output Aspect Ratio</span>
                </label>
                <div className="grid grid-cols-3 gap-1 bg-black/40 p-1 rounded-xl border border-white/[0.08]">
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
                  <span>Clip Length Target</span>
                </label>
                <select
                  value={selectedDuration}
                  onChange={(e) => setSelectedDuration(e.target.value)}
                  className="w-full glass-input text-white text-xs sm:text-sm px-3 py-2 rounded-xl border border-white/[0.1] bg-[#0C0E16]"
                >
                  <option value="auto">Auto (AI detects natural story arc 30s-60s)</option>
                  <option value="under-30">&lt; 30 seconds (Max viral TikToks / Shorts)</option>
                  <option value="30-60">30 - 60 seconds (Standard Reels / Shorts)</option>
                  <option value="60-90">60 - 90 seconds (In-depth knowledge clips)</option>
                </select>
              </div>
            </div>

            {/* Submit Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={isUploading}
                className="w-full btn-primary-gradient py-4 rounded-2xl text-base sm:text-lg font-bold text-white flex items-center justify-center gap-2.5 cursor-pointer shadow-xl shadow-purple-600/30 hover:shadow-purple-600/50 transition-all disabled:opacity-60"
              >
                {isUploading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Uploading Video...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5 text-amber-300" />
                    <span>Get Clips with AI</span>
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
              1080p 60fps Output
            </span>
            <span className="flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              Auto Dynamic Captions
            </span>
            <span className="flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              Active Speaker Auto-Reframe
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
