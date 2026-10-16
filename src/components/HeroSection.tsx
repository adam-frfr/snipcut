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
    <section className="relative pt-28 pb-16 md:pt-36 md:pb-24 overflow-hidden bg-[#F5EFEB]">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        {/* Top Announcement Pill */}
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#EAE1D7] border border-[#DDD3C7] text-xs text-[#2B1D16] font-medium mb-8">
          <span className="flex h-2 w-2 rounded-full bg-[#3A7D44]" />
          <span className="font-bold text-[#2B1D16]">ClipAnything™ Engine:</span>
          <span className="text-[#6A5A4E]">Natural language prompt to viral shorts</span>
          <ArrowRight className="w-3.5 h-3.5 text-[#C87A47]" />
        </div>

        {/* Main Headline */}
        <h1 className="text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-tight text-[#2B1D16] max-w-4xl mx-auto leading-[1.12]">
          1 Long Video.{" "}
          <span className="text-[#C87A47]">10 Viral Shorts.</span>
          <br />
          <span className="text-[#6A5A4E]">10x Faster with AI.</span>
        </h1>

        {/* Subtitle */}
        <p className="mt-5 text-base sm:text-lg text-[#7A6A5E] max-w-2xl mx-auto font-normal leading-relaxed">
          The warm, intelligent video clipping studio. Turn long podcasts, interviews, and videos into viral clips with dynamic auto-reframing, synchronized speaker tracking, and custom editorial subtitles.
        </p>

        {/* Ingestion Card */}
        <div className="mt-10 max-w-2xl mx-auto bg-white rounded-[32px] p-6 sm:p-8 text-left shadow-md border border-[#E8DDD2]">
          {/* Pill Segmented Tabs */}
          <div className="flex justify-center mb-6">
            <div className="inline-flex p-1.5 rounded-full bg-[#EAE1D7] border border-[#DDD3C7]">
              <button
                type="button"
                onClick={() => setActiveTab("url")}
                className={`flex items-center gap-2 px-5 py-2 rounded-full text-xs sm:text-sm font-semibold transition-all ${
                  activeTab === "url"
                    ? "bg-[#2B1D16] text-white shadow-sm"
                    : "text-[#6A5A4E] hover:text-[#2B1D16]"
                }`}
              >
                <Link2 className="w-4 h-4" />
                <span>Paste Video URL</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("upload")}
                className={`flex items-center gap-2 px-5 py-2 rounded-full text-xs sm:text-sm font-semibold transition-all ${
                  activeTab === "upload"
                    ? "bg-[#2B1D16] text-white shadow-sm"
                    : "text-[#6A5A4E] hover:text-[#2B1D16]"
                }`}
              >
                <Upload className="w-4 h-4" />
                <span>Upload Video File</span>
              </button>
            </div>
          </div>

          <form onSubmit={handleGenerate} className="space-y-4">
            {/* Tab 1: URL input */}
            {activeTab === "url" && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold text-[#2B1D16]">
                    Paste YouTube, Twitch, or Google Drive URL
                  </label>
                  <span className="text-[11px] text-[#7A695F] font-medium">Or try quick sample</span>
                </div>
                <div className="relative">
                  <input
                    type="url"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=..."
                    className="w-full bg-[#FAF6F1] text-[#2B1D16] text-sm sm:text-base px-4 py-3 pl-11 rounded-2xl border border-[#E8DDD2] placeholder:text-[#A09085] focus:outline-none focus:border-[#C87A47] transition-all"
                  />
                  <Link2 className="w-5 h-5 text-[#8C7A6D] absolute left-3.5 top-1/2 -translate-y-1/2" />
                </div>
                
                {/* 1-Click Samples */}
                <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                  <span className="text-[10px] font-bold text-[#7A695F] uppercase">Quick Demos:</span>
                  <button
                    type="button"
                    onClick={() => {
                      setUrlInput("sample");
                    }}
                    className="px-2.5 py-1 rounded-full bg-[#EAE1D7] hover:bg-[#DDD3C7] text-[11px] font-bold text-[#2B1D16] transition cursor-pointer flex items-center gap-1"
                  >
                    <span>⚡ AI Keynote (1-Click)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setUrlInput("sample-podcast");
                    }}
                    className="px-2.5 py-1 rounded-full bg-[#EAE1D7] hover:bg-[#DDD3C7] text-[11px] font-bold text-[#2B1D16] transition cursor-pointer flex items-center gap-1"
                  >
                    <span>🎙️ Dual Speaker Podcast</span>
                  </button>
                </div>
              </div>
            )}

            {/* Tab 2: Upload */}
            {activeTab === "upload" && (
              <div>
                <label className="block text-xs font-bold text-[#2B1D16] mb-1.5">
                  Select video from your device (MP4, MOV, WebM, MKV)
                </label>
                <div className="border-2 border-dashed border-[#D8CCC0] hover:border-[#C87A47] rounded-2xl p-6 text-center transition-colors bg-[#FAF6F1] relative">
                  <input
                    type="file"
                    accept="video/*"
                    onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <div className="w-12 h-12 rounded-full bg-[#EAE1D7] text-[#C87A47] flex items-center justify-center mx-auto mb-2 pointer-events-none">
                    <Upload className="w-6 h-6" />
                  </div>
                  <div className="text-sm font-bold text-[#2B1D16] pointer-events-none">
                    {uploadFile ? uploadFile.name : "Click or drag & drop video file here"}
                  </div>
                  <div className="text-xs text-[#8C7A6D] mt-1 pointer-events-none">
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
                <label className="text-xs font-bold text-[#2B1D16] flex items-center gap-1.5">
                  <Bot className="w-3.5 h-3.5 text-[#C87A47]" />
                  <span>ClipAnything™ Prompt (Optional)</span>
                </label>
                <span className="text-[11px] text-[#8C7A6D]">AI Prompt</span>
              </div>
              <input
                type="text"
                value={promptInput}
                onChange={(e) => setPromptInput(e.target.value)}
                placeholder="e.g. Find high-energy debate, tactical advice, or funny moments..."
                className="w-full bg-[#FAF6F1] text-[#2B1D16] text-xs sm:text-sm px-4 py-2.5 rounded-xl border border-[#E8DDD2] placeholder:text-[#A09085] focus:outline-none focus:border-[#C87A47] transition-all"
              />
            </div>

            {/* Settings Row: Ratio & Duration */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              {/* Aspect Ratio */}
              <div>
                <label className="block text-[11px] font-bold text-[#2B1D16] mb-1.5 flex items-center gap-1">
                  <Video className="w-3 h-3 text-[#C87A47]" />
                  <span>Output Aspect Ratio</span>
                </label>
                <div className="grid grid-cols-3 gap-1 bg-[#EAE1D7] p-1 rounded-full border border-[#DDD3C7]">
                  <button
                    type="button"
                    onClick={() => setSelectedRatio("9:16")}
                    className={`py-1.5 text-xs font-bold rounded-full transition-all ${
                      selectedRatio === "9:16"
                        ? "bg-[#2B1D16] text-white shadow-sm"
                        : "text-[#6A5A4E] hover:text-[#2B1D16]"
                    }`}
                  >
                    9:16
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedRatio("1:1")}
                    className={`py-1.5 text-xs font-bold rounded-full transition-all ${
                      selectedRatio === "1:1"
                        ? "bg-[#2B1D16] text-white shadow-sm"
                        : "text-[#6A5A4E] hover:text-[#2B1D16]"
                    }`}
                  >
                    1:1
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedRatio("16:9")}
                    className={`py-1.5 text-xs font-bold rounded-full transition-all ${
                      selectedRatio === "16:9"
                        ? "bg-[#2B1D16] text-white shadow-sm"
                        : "text-[#6A5A4E] hover:text-[#2B1D16]"
                    }`}
                  >
                    16:9
                  </button>
                </div>
              </div>

              {/* Target Length */}
              <div>
                <label className="block text-[11px] font-bold text-[#2B1D16] mb-1.5 flex items-center gap-1">
                  <Sliders className="w-3 h-3 text-[#3A7D44]" />
                  <span>Clip Length Target</span>
                </label>
                <select
                  value={selectedDuration}
                  onChange={(e) => setSelectedDuration(e.target.value)}
                  className="w-full bg-[#FAF6F1] text-[#2B1D16] text-xs sm:text-sm px-3 py-2 rounded-xl border border-[#E8DDD2] focus:outline-none focus:border-[#C87A47] font-medium"
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
                className="w-full bg-[#C87A47] hover:bg-[#B46A38] py-3.5 rounded-full text-base sm:text-lg font-bold text-white flex items-center justify-center gap-2.5 cursor-pointer shadow-md shadow-[#C87A47]/25 hover:shadow-lg transition-all disabled:opacity-60"
              >
                {isUploading ? (
                  <>
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>Uploading Video...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5 text-amber-200" />
                    <span>Get Clips with AI</span>
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Guarantee / trust */}
          <div className="mt-5 pt-4 border-t border-[#E8DDD2] flex flex-wrap items-center justify-between text-xs text-[#7A6A5E] gap-2">
            <span className="flex items-center gap-1 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#3A7D44]" />
              1080p 60fps Output
            </span>
            <span className="flex items-center gap-1 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#3A7D44]" />
              Dynamic Auto Captions
            </span>
            <span className="flex items-center gap-1 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#3A7D44]" />
              Active Speaker AI Reframe
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
