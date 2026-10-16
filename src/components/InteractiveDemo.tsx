"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Sparkles,
  Flame,
  UserCheck,
  Type,
  Smile,
  Layers,
  Check,
  Share2,
  TrendingUp,
} from "lucide-react";
import { CAPTION_PRESETS } from "@/lib/mockData";

export default function InteractiveDemo() {
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(true);
  const [activeTab, setActiveTab] = useState<"reframe" | "raw">("reframe");
  const [selectedStyle, setSelectedStyle] = useState("hormozi");
  const [showEmojis, setShowEmojis] = useState(true);
  const [showBRoll, setShowBRoll] = useState(true);
  const [speakerMode, setSpeakerMode] = useState<"single" | "split">("split");
  const [currentWordIdx, setCurrentWordIdx] = useState(0);

  const words = [
    { text: "Most", emoji: "" },
    { text: "people", emoji: "" },
    { text: "think", emoji: "" },
    { text: "AGI", emoji: "🤖" },
    { text: "is", emoji: "" },
    { text: "decades", emoji: "" },
    { text: "away,", emoji: "⏳" },
    { text: "but", emoji: "" },
    { text: "look", emoji: "" },
    { text: "at", emoji: "" },
    { text: "exponential", emoji: "📈" },
    { text: "compute.", emoji: "⚡" },
    { text: "The", emoji: "" },
    { text: "models", emoji: "" },
    { text: "we", emoji: "" },
    { text: "are", emoji: "" },
    { text: "building", emoji: "🏗️" },
    { text: "today", emoji: "" },
    { text: "will", emoji: "" },
    { text: "shock", emoji: "🤯" },
    { text: "the", emoji: "" },
    { text: "world.", emoji: "🌍" },
  ];

  // Animate dynamic karaoke subtitles
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setCurrentWordIdx((prev) => (prev + 1) % words.length);
    }, 450);
    return () => clearInterval(interval);
  }, [isPlaying, words.length]);

  return (
    <section id="interactive-demo" className="py-20 relative overflow-hidden bg-[#F5EFEB] border-t border-b border-[#E8DDD2] text-[#2B1D16]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-14">
          <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-[#EAE1D7] border border-[#DDD3C7] text-xs font-bold text-[#2B1D16] mb-4">
            <Sparkles className="w-3.5 h-3.5 text-[#C87A47]" />
            <span>Interactive Live Product Simulator</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-[#2B1D16] tracking-tight">
            See the Magic of <span className="text-[#C87A47]">Reframe & Captions</span>
          </h2>
          <p className="mt-4 text-[#7A695F] text-base sm:text-lg">
            Experience how OpusClip automatically isolates speakers, reframes into vertical 9:16, generates viral karaoke subtitles, and calculates the Virality Score™.
          </p>
        </div>

        {/* Main Interactive Demo Container */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Left Controls & Virality Breakdown */}
          <div className="lg:col-span-4 space-y-4 order-2 lg:order-1">
            {/* View Mode Toggle */}
            <div className="bg-white p-5 rounded-[28px] border border-[#E8DDD2] shadow-sm">
              <label className="text-xs font-extrabold text-[#2B1D16] uppercase tracking-wider block mb-2.5">
                Display Mode
              </label>
              <div className="grid grid-cols-2 gap-1 bg-[#EAE1D7] p-1 rounded-full border border-[#DDD3C7]">
                <button
                  onClick={() => setActiveTab("reframe")}
                  className={`py-2 text-xs font-bold rounded-full transition-all ${
                    activeTab === "reframe"
                      ? "bg-[#2B1D16] text-white shadow-sm"
                      : "text-[#7A695F] hover:text-[#2B1D16]"
                  }`}
                >
                  9:16 AI Reframe
                </button>
                <button
                  onClick={() => setActiveTab("raw")}
                  className={`py-2 text-xs font-bold rounded-full transition-all ${
                    activeTab === "raw"
                      ? "bg-[#2B1D16] text-white shadow-sm"
                      : "text-[#7A695F] hover:text-[#2B1D16]"
                  }`}
                >
                  16:9 Raw Source
                </button>
              </div>
            </div>

            {/* Dynamic Captions Preset Picker */}
            <div className="bg-white p-5 rounded-[28px] border border-[#E8DDD2] shadow-sm">
              <div className="flex items-center justify-between mb-2.5">
                <label className="text-xs font-extrabold text-[#2B1D16] uppercase tracking-wider flex items-center gap-1.5">
                  <Type className="w-3.5 h-3.5 text-[#C87A47]" />
                  <span>Dynamic Caption Style</span>
                </label>
                <span className="text-[11px] text-[#3A7D44] font-bold">97%+ Accuracy</span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {CAPTION_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    onClick={() => setSelectedStyle(preset.id)}
                    className={`p-2.5 rounded-2xl border text-left transition-all ${
                      selectedStyle === preset.id
                        ? "bg-[#2B1D16] border-[#2B1D16] text-white shadow-sm"
                        : "bg-[#FAF6F1] border-[#E8DDD2] text-[#7A695F] hover:bg-white hover:text-[#2B1D16]"
                    }`}
                  >
                    <div className="text-xs font-bold flex items-center justify-between">
                      <span>{preset.name}</span>
                      {selectedStyle === preset.id && <Check className="w-3.5 h-3.5 text-[#C87A47]" />}
                    </div>
                    <div className={`text-[10px] mt-0.5 truncate ${selectedStyle === preset.id ? "text-[#DDD3C7]" : "text-[#A09085]"}`}>{preset.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Auto Toggles: Emojis, B-Roll, Speaker Layout */}
            <div className="bg-white p-5 rounded-[28px] border border-[#E8DDD2] shadow-sm space-y-3">
              <label className="text-xs font-extrabold text-[#2B1D16] uppercase tracking-wider block">
                AI Video Enhancers
              </label>

              {/* Auto Emojis */}
              <div className="flex items-center justify-between p-2.5 rounded-2xl bg-[#FAF6F1] border border-[#E8DDD2]">
                <div className="flex items-center gap-2">
                  <Smile className="w-4 h-4 text-[#C87A47]" />
                  <span className="text-xs font-bold text-[#2B1D16]">Auto-Highlight & Emojis</span>
                </div>
                <button
                  onClick={() => setShowEmojis(!showEmojis)}
                  className={`w-10 h-5 rounded-full transition-colors relative ${
                    showEmojis ? "bg-[#C87A47]" : "bg-[#DDD3C7]"
                  }`}
                >
                  <div
                    className={`w-3.5 h-3.5 bg-white rounded-full transition-transform absolute top-0.75 ${
                      showEmojis ? "right-1" : "left-1"
                    }`}
                  />
                </button>
              </div>

              {/* AI B-Roll */}
              <div className="flex items-center justify-between p-2.5 rounded-2xl bg-[#FAF6F1] border border-[#E8DDD2]">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-[#3A7D44]" />
                  <span className="text-xs font-bold text-[#2B1D16]">Contextual AI B-Roll Cutaway</span>
                </div>
                <button
                  onClick={() => setShowBRoll(!showBRoll)}
                  className={`w-10 h-5 rounded-full transition-colors relative ${
                    showBRoll ? "bg-[#C87A47]" : "bg-[#DDD3C7]"
                  }`}
                >
                  <div
                    className={`w-3.5 h-3.5 bg-white rounded-full transition-transform absolute top-0.75 ${
                      showBRoll ? "right-1" : "left-1"
                    }`}
                  />
                </button>
              </div>

              {/* Speaker Tracking Layout */}
              <div className="flex items-center justify-between p-2.5 rounded-2xl bg-[#FAF6F1] border border-[#E8DDD2]">
                <div className="flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-[#2B1D16]" />
                  <span className="text-xs font-bold text-[#2B1D16]">Speaker Layout</span>
                </div>
                <div className="flex gap-1 bg-[#EAE1D7] p-0.5 rounded-full border border-[#DDD3C7]">
                  <button
                    onClick={() => setSpeakerMode("split")}
                    className={`px-3 py-1 text-[11px] rounded-full font-bold transition-all ${
                      speakerMode === "split" ? "bg-[#2B1D16] text-white shadow-sm" : "text-[#7A695F]"
                    }`}
                  >
                    Split
                  </button>
                  <button
                    onClick={() => setSpeakerMode("single")}
                    className={`px-3 py-1 text-[11px] rounded-full font-bold transition-all ${
                      speakerMode === "single" ? "bg-[#2B1D16] text-white shadow-sm" : "text-[#7A695F]"
                    }`}
                  >
                    1-Face
                  </button>
                </div>
              </div>
            </div>

            {/* Virality Score Card */}
            <div className="bg-white p-5 rounded-[28px] border border-[#E8DDD2] shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-xl bg-[#FAF6F1] text-[#3A7D44]">
                    <TrendingUp className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold text-[#2B1D16]">AI Virality Score™</div>
                    <div className="text-[10px] text-[#7A695F]">Estimated Viral Potential</div>
                  </div>
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-black text-[#3A7D44]">98</span>
                  <span className="text-xs text-[#A09085] font-bold">/100</span>
                </div>
              </div>
              <div className="w-full bg-[#EAE1D7] h-2 rounded-full overflow-hidden mb-2">
                <div className="bg-[#3A7D44] h-full rounded-full w-[98%]" />
              </div>
              <p className="text-[11px] text-[#7A695F] leading-relaxed">
                <span className="text-[#3A7D44] font-bold">Why it will go viral:</span> Immediate high-stakes contrarian statement in the first 3 seconds with high retention pacing.
              </p>
            </div>
          </div>

          {/* Right Video Canvas Viewport */}
          <div className="lg:col-span-8 flex flex-col items-center justify-center order-1 lg:order-2">
            <div className="relative p-3.5 rounded-[32px] bg-white border border-[#E8DDD2] shadow-md">
              {/* Vertical 9:16 Mock Phone / Short Viewport */}
              {activeTab === "reframe" ? (
                <div className="relative w-[280px] sm:w-[320px] md:w-[350px] h-[520px] sm:h-[580px] bg-[#1C130E] rounded-[24px] overflow-hidden shadow-xl border border-[#E8DDD2] flex flex-col">
                  {/* Top Bar Overlay */}
                  <div className="absolute top-0 left-0 right-0 z-30 p-3 flex items-center justify-between bg-black/60">
                    <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-black/60 backdrop-blur-md border border-white/20 text-[10px] text-white font-bold">
                      <Flame className="w-3 h-3 text-[#3A7D44] fill-[#3A7D44]" />
                      <span>98 Virality Score</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setIsMuted(!isMuted)}
                        className="p-1.5 rounded-full bg-black/60 text-white hover:bg-black/80 backdrop-blur-md"
                      >
                        {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  {/* Video Layers Container */}
                  <div className="relative flex-1 bg-zinc-950 overflow-hidden flex flex-col">
                    {speakerMode === "split" ? (
                      /* Multi-Speaker Split Screen Layout */
                      <div className="flex-1 flex flex-col h-full">
                        {/* Top Speaker: Host (Lex Fridman) */}
                        <div className="relative flex-1 overflow-hidden border-b border-purple-500/30">
                          <img
                            src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=600&auto=format&fit=crop&q=80"
                            alt="Host"
                            className="w-full h-full object-cover brightness-95"
                          />
                          <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/70 backdrop-blur-sm text-[10px] text-zinc-300 font-semibold border border-white/10">
                            Host: Lex Fridman
                          </div>
                        </div>

                        {/* Bottom Speaker: Active Guest (Sam Altman) */}
                        <div className="relative flex-1 overflow-hidden">
                          <img
                            src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=600&auto=format&fit=crop&q=80"
                            alt="Guest Active Speaker"
                            className="w-full h-full object-cover brightness-105 scale-105"
                          />
                          {/* Active Speaker Ring Indicator */}
                          <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/80 text-white text-[9px] font-bold shadow-lg">
                            <span className="w-1.5 h-1.5 rounded-full bg-white animate-ping" />
                            <span>TALKING</span>
                          </div>
                          <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-black/70 backdrop-blur-sm text-[10px] text-zinc-300 font-semibold border border-white/10">
                            Sam Altman (OpenAI)
                          </div>
                        </div>
                      </div>
                    ) : (
                      /* Single Face Auto-Center Focus */
                      <div className="relative w-full h-full">
                        <img
                          src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=800&auto=format&fit=crop&q=80"
                          alt="Speaker Centered"
                          className="w-full h-full object-cover scale-110"
                        />
                        <div className="absolute top-3 left-3 flex items-center gap-1.5 px-2 py-1 rounded-full bg-purple-600/80 text-white text-[10px] font-bold">
                          <UserCheck className="w-3 h-3" />
                          <span>AI Face Centered</span>
                        </div>
                      </div>
                    )}

                    {/* AI B-Roll Cutaway Overlay if enabled */}
                    {showBRoll && currentWordIdx >= 10 && currentWordIdx <= 15 && (
                      <div className="absolute inset-x-2 top-10 h-36 rounded-xl overflow-hidden border border-cyan-400/40 shadow-2xl z-20 animate-in fade-in zoom-in-95 duration-300">
                        <img
                          src="https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=600&auto=format&fit=crop&q=80"
                          alt="AI Compute B-Roll"
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute top-1 left-2 text-[9px] font-bold uppercase tracking-wider text-cyan-300 bg-black/70 px-1.5 py-0.2 rounded">
                          AI B-Roll: Neural Compute Cluster
                        </div>
                      </div>
                    )}

                    {/* Live Dynamic Animated Subtitles Engine */}
                    <div className="absolute bottom-14 inset-x-3 z-30 text-center pointer-events-none">
                      <div className="inline-block px-3 py-2 rounded-xl backdrop-blur-sm bg-black/40">
                        {/* Selected Preset Rendering */}
                        {selectedStyle === "hormozi" && (
                          <div className="caption-hormozi text-xl sm:text-2xl text-yellow-300 drop-shadow-md">
                            {words.slice(Math.max(0, currentWordIdx - 2), currentWordIdx + 2).map((w, idx) => {
                              const isCurrent = words.indexOf(w) === currentWordIdx;
                              return (
                                <span
                                  key={idx}
                                  className={`inline-block mx-1 transition-all duration-150 ${
                                    isCurrent
                                      ? "text-emerald-400 scale-125 -translate-y-1"
                                      : "text-yellow-400"
                                  }`}
                                >
                                  {w.text} {showEmojis && w.emoji && <span>{w.emoji}</span>}
                                </span>
                              );
                            })}
                          </div>
                        )}

                        {selectedStyle === "neon" && (
                          <div className="caption-neon text-lg sm:text-xl text-white">
                            {words.slice(Math.max(0, currentWordIdx - 2), currentWordIdx + 2).map((w, idx) => {
                              const isCurrent = words.indexOf(w) === currentWordIdx;
                              return (
                                <span
                                  key={idx}
                                  className={`inline-block mx-1 transition-all ${
                                    isCurrent ? "text-cyan-300 scale-120 font-black" : "text-purple-200"
                                  }`}
                                >
                                  {w.text} {showEmojis && w.emoji && <span>{w.emoji}</span>}
                                </span>
                              );
                            })}
                          </div>
                        )}

                        {selectedStyle === "beast" && (
                          <div className="font-black text-2xl uppercase tracking-tighter text-white">
                            {words.slice(Math.max(0, currentWordIdx - 1), currentWordIdx + 2).map((w, idx) => {
                              const isCurrent = words.indexOf(w) === currentWordIdx;
                              return (
                                <span
                                  key={idx}
                                  className={`inline-block mx-1 px-1.5 py-0.5 rounded ${
                                    isCurrent ? "bg-red-600 text-white scale-110" : "text-white"
                                  }`}
                                >
                                  {w.text} {showEmojis && w.emoji && <span>{w.emoji}</span>}
                                </span>
                              );
                            })}
                          </div>
                        )}

                        {selectedStyle === "clean" && (
                          <div className="font-semibold text-base sm:text-lg text-white">
                            {words.slice(Math.max(0, currentWordIdx - 2), currentWordIdx + 2).map((w, idx) => {
                              const isCurrent = words.indexOf(w) === currentWordIdx;
                              return (
                                <span
                                  key={idx}
                                  className={`inline-block mx-1 ${
                                    isCurrent ? "text-purple-400 font-bold underline" : "text-zinc-200"
                                  }`}
                                >
                                  {w.text} {showEmojis && w.emoji && <span>{w.emoji}</span>}
                                </span>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Bottom Play/Pause & Social Watermark overlay */}
                    <div className="absolute bottom-2 left-0 right-0 px-3 flex items-center justify-between z-30">
                      <button
                        onClick={() => setIsPlaying(!isPlaying)}
                        className="p-2 rounded-full bg-black/60 text-white hover:bg-black/90 backdrop-blur-md"
                      >
                        {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                      </button>
                      <div className="text-[10px] text-zinc-400 bg-black/60 px-2 py-0.5 rounded-full border border-white/10">
                        @samaltman #ai #tech
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* Raw 16:9 Landscape Video View */
                <div className="relative w-[340px] sm:w-[480px] md:w-[560px] h-[315px] bg-black rounded-2xl overflow-hidden shadow-2xl border border-white/[0.1] flex items-center justify-center">
                  <img
                    src="https://images.unsplash.com/photo-1590602847861-f357a9332bbc?w=1000&auto=format&fit=crop&q=80"
                    alt="Raw 16:9 Landscape Podcast"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center p-6 text-center">
                    <div className="px-3 py-1 rounded-full bg-red-500/20 text-red-400 border border-red-500/30 text-xs font-bold mb-3">
                      Original 16:9 Wide Format (Not Vertical)
                    </div>
                    <p className="text-sm text-zinc-300 max-w-sm">
                      Requires manual crop, repositioning, and subtitle timing. OpusClip automates this whole process in seconds.
                    </p>
                    <button
                      onClick={() => setActiveTab("reframe")}
                      className="mt-4 px-6 py-2.5 rounded-full bg-[#C87A47] hover:bg-[#B66D3D] text-xs font-bold text-white shadow-md shadow-[#C87A47]/20 transition-all cursor-pointer"
                    >
                      Convert to 9:16 Viral Short
                    </button>
                  </div>
                </div>
              )}
            </div>
            <div className="mt-4 text-center">
              <span className="text-xs text-zinc-400">
                Live interactive rendering • Try clicking caption styles and speaker layout on the left!
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
