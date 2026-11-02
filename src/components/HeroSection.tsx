"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Link2,
  Upload,
  ArrowRight,
  Check,
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
    <section className="relative pt-24 pb-16 md:pt-32 md:pb-24 overflow-hidden bg-[#F8F7F4]">
      {/* Decorative Corner Matrix Dots */}
      <div className="absolute top-16 left-6 hidden sm:grid grid-cols-4 gap-1.5 opacity-30 pointer-events-none">
        {Array.from({ length: 16 }).map((_, i) => (
          <div key={i} className="w-1.5 h-1.5 bg-black rounded-full" />
        ))}
      </div>
      <div className="absolute top-20 right-8 hidden sm:grid grid-cols-4 gap-1.5 opacity-30 pointer-events-none">
        {Array.from({ length: 16 }).map((_, i) => (
          <div key={i} className="w-1.5 h-1.5 bg-black rounded-full" />
        ))}
      </div>

      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        {/* Top Minimal Geometric Badge */}
        <div className="inline-block mb-6">
          <div className="bg-[#FFC700] text-black font-black uppercase text-xs tracking-widest px-3.5 py-1 border-2 border-black shadow-[2px_2px_0px_#000000]">
            AUTOMATED VIDEO REPURPOSING
          </div>
        </div>

        {/* Main Headline - Bold Swiss/Neo-Brutalist Typography */}
        <h1 className="text-4xl sm:text-6xl md:text-7xl font-black tracking-tight text-black uppercase leading-[1.05]">
          VIRAL SHORTS.
          <br />
          <span className="bg-[#FFC700] px-2.5 py-0.5 border-2 border-black inline-block mt-1 sm:mt-2 shadow-[4px_4px_0px_#000000]">
            ON TIME.
          </span>{" "}
          EVERY TIME.
        </h1>

        {/* Subtitle */}
        <p className="mt-5 text-sm sm:text-base text-[#444444] max-w-xl mx-auto font-bold leading-relaxed">
          Extract high-retention 9:16 vertical shorts from any YouTube link or raw video file. Active speaker auto-reframe, burned captions, and full studio editing.
        </p>

        {/* Ingestion Card */}
        <div className="mt-8 max-w-xl mx-auto bg-white rounded-2xl p-5 sm:p-7 text-left border-2 border-black shadow-[5px_5px_0px_#000000]">
          {/* Segmented Neo-Brutalist Toggle */}
          <div className="grid grid-cols-2 gap-2 mb-5">
            <button
              type="button"
              onClick={() => setActiveTab("url")}
              className={`py-2 px-3 border-2 border-black text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-2 ${
                activeTab === "url"
                  ? "bg-black text-white shadow-[2px_2px_0px_#FFC700]"
                  : "bg-white text-black hover:bg-[#F4F2EC]"
              }`}
            >
              <Link2 className="w-3.5 h-3.5" />
              <span>Paste URL</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("upload")}
              className={`py-2 px-3 border-2 border-black text-xs font-black uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-2 ${
                activeTab === "upload"
                  ? "bg-black text-white shadow-[2px_2px_0px_#FFC700]"
                  : "bg-white text-black hover:bg-[#F4F2EC]"
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Upload Video</span>
            </button>
          </div>

          <form onSubmit={handleGenerate} className="space-y-4">
            {/* Tab 1: URL input */}
            {activeTab === "url" && (
              <div>
                <label className="block text-xs font-black uppercase text-black mb-1.5 tracking-wider">
                  YouTube Video Link
                </label>
                <div className="relative">
                  <input
                    type="url"
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    placeholder="https://www.youtube.com/watch?v=..."
                    className="w-full neo-input py-3 pl-4 pr-4 text-xs sm:text-sm font-bold text-black placeholder:text-[#999999]"
                  />
                </div>

                {/* 1-Click Minimal Demo Samples */}
                <div className="flex items-center gap-2 mt-2.5 flex-wrap">
                  <span className="text-[10px] font-black uppercase text-black">Instant Demos:</span>
                  <button
                    type="button"
                    onClick={() => setUrlInput("sample")}
                    className="bg-[#F8F7F4] hover:bg-[#FFC700] text-black border border-black font-black uppercase text-[10px] px-2.5 py-1 rounded transition-colors cursor-pointer"
                  >
                    Tech Keynote (1-Click)
                  </button>
                  <button
                    type="button"
                    onClick={() => setUrlInput("sample-podcast")}
                    className="bg-[#F8F7F4] hover:bg-[#FFC700] text-black border border-black font-black uppercase text-[10px] px-2.5 py-1 rounded transition-colors cursor-pointer"
                  >
                    Dual-Cam Podcast
                  </button>
                </div>
              </div>
            )}

            {/* Tab 2: Upload */}
            {activeTab === "upload" && (
              <div>
                <label className="block text-xs font-black uppercase text-black mb-1.5 tracking-wider">
                  Select Video File (MP4, MOV, WebM)
                </label>
                <div className="border-2 border-dashed border-black hover:bg-[#FFFDF5] rounded-xl p-5 text-center transition-colors bg-[#F8F7F4] relative cursor-pointer">
                  <input
                    type="file"
                    accept="video/*"
                    onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  />
                  <div className="w-10 h-10 border-2 border-black bg-[#FFC700] text-black flex items-center justify-center mx-auto mb-2 pointer-events-none shadow-[2px_2px_0px_#000000]">
                    <Upload className="w-4 h-4 stroke-[3]" />
                  </div>
                  <div className="text-xs font-black uppercase text-black">
                    {uploadFile ? uploadFile.name : "Click to Browse Video"}
                  </div>
                  <div className="text-[10px] font-bold text-[#666666] mt-0.5">
                    {uploadFile ? `${(uploadFile.size / (1024 * 1024)).toFixed(1)} MB` : "Files up to 2GB supported"}
                  </div>
                </div>
              </div>
            )}

            {/* Natural Language Prompt */}
            <div>
              <label className="block text-xs font-black uppercase text-black mb-1.5 tracking-wider">
                ClipAnything Prompt (Optional)
              </label>
              <input
                type="text"
                value={promptInput}
                onChange={(e) => setPromptInput(e.target.value)}
                placeholder="e.g. Find key insights about future tech or the funniest moment"
                className="w-full neo-input py-2.5 px-3.5 text-xs font-bold text-black placeholder:text-[#999999]"
              />
            </div>

            {/* Split Neo-Brutalist Submit Button */}
            <button
              type="submit"
              disabled={isUploading}
              className="w-full flex items-stretch border-2 border-black rounded-xl overflow-hidden shadow-[4px_4px_0px_#000000] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[3px_3px_0px_#000000] active:translate-x-[3px] active:translate-y-[3px] active:shadow-[1px_1px_0px_#000000] transition-all cursor-pointer group disabled:opacity-50 mt-2"
            >
              <span className="flex-1 bg-[#FFC700] group-hover:bg-[#FFD633] text-black font-black uppercase tracking-wider text-xs sm:text-sm py-3 px-4 flex items-center justify-center">
                {isUploading ? "Uploading Video..." : "Start Clipping Now"}
              </span>
              <span className="bg-black text-white px-4 flex items-center justify-center group-hover:bg-[#FF5500] transition-colors">
                <ArrowRight className="w-4 h-4 stroke-[3]" />
              </span>
            </button>
          </form>

          {/* Minimal Feature Row */}
          <div className="mt-5 pt-4 border-t-2 border-black/10 flex items-center justify-between text-[11px] font-black uppercase text-black flex-wrap gap-2">
            <span className="flex items-center gap-1">
              <Check className="w-3.5 h-3.5 text-black stroke-[3]" />
              <span>Auto-Reframe</span>
            </span>
            <span className="flex items-center gap-1">
              <Check className="w-3.5 h-3.5 text-black stroke-[3]" />
              <span>Burned Subtitles</span>
            </span>
            <span className="flex items-center gap-1">
              <Check className="w-3.5 h-3.5 text-black stroke-[3]" />
              <span>No Watermark</span>
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
