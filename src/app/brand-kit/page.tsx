"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Palette,
  ArrowLeft,
  Upload,
  Check,
  Type,
  Image as ImageIcon,
  Sliders,
  Sparkles,
  Save,
} from "lucide-react";

export default function BrandKitPage() {
  const [brandName, setBrandName] = useState("My Creator Channel");
  const [selectedFont, setSelectedFont] = useState("Impact / Bold Display");
  const [primaryColor, setPrimaryColor] = useState("#FACC15");
  const [secondaryColor, setSecondaryColor] = useState("#22C55E");
  const [watermarkPos, setWatermarkPos] = useState<"top-right" | "top-left" | "bottom-right" | "bottom-left">("top-right");
  const [watermarkOpacity, setWatermarkOpacity] = useState(80);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSave = () => {
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2500);
  };

  return (
    <div className="min-h-screen bg-[#08090E] text-white">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-[#090A10]/90 backdrop-blur-xl border-b border-white/[0.08] px-4 sm:px-6 py-3">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="p-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-zinc-300 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-sm tracking-tight text-white">
                Brand Kit & Templates
              </span>
              <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded font-mono">
                Brand Uniformity
              </span>
            </div>
          </div>

          <button
            onClick={handleSave}
            className="btn-primary-gradient px-4 py-1.5 text-xs font-bold text-white rounded-xl flex items-center gap-1.5 shadow-lg shadow-purple-600/30 cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{savedSuccess ? "Saved Successfully!" : "Save Brand Kit"}</span>
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white">Brand Kit Settings</h1>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1">
            Configure custom fonts, watermark logos, brand colors, and outro bumper templates applied to all generated clips.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Settings Left */}
          <div className="lg:col-span-7 space-y-6">
            {/* General Brand Name */}
            <div className="glass-panel p-5 rounded-3xl border border-white/[0.08]">
              <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider block mb-2">
                Brand Kit Profile Name
              </label>
              <input
                type="text"
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
                className="w-full glass-input text-white text-xs sm:text-sm px-4 py-2.5 rounded-xl"
              />
            </div>

            {/* Typography */}
            <div className="glass-panel p-5 rounded-3xl border border-white/[0.08]">
              <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider block mb-3 flex items-center gap-1.5">
                <Type className="w-3.5 h-3.5 text-purple-400" />
                <span>Subtitle Typography</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  "Impact / Bold Display",
                  "Geist Sans / Modern Tech",
                  "Montserrat / Heavy Clean",
                  "Anton / High Contrast",
                  "Outfit / Premium Rounded",
                  "Custom Font Upload (.ttf)",
                ].map((font) => (
                  <button
                    key={font}
                    onClick={() => setSelectedFont(font)}
                    className={`p-3 rounded-xl border text-left text-xs font-bold transition-all flex items-center justify-between ${
                      selectedFont === font
                        ? "bg-purple-950/40 border-purple-500 text-white ring-1 ring-purple-500"
                        : "bg-white/[0.02] border-white/[0.08] text-zinc-400 hover:bg-white/[0.05]"
                    }`}
                  >
                    <span className="truncate">{font}</span>
                    {selectedFont === font && <Check className="w-3 h-3 text-purple-400" />}
                  </button>
                ))}
              </div>
            </div>

            {/* Brand Colors */}
            <div className="glass-panel p-5 rounded-3xl border border-white/[0.08]">
              <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider block mb-3 flex items-center gap-1.5">
                <Palette className="w-3.5 h-3.5 text-amber-400" />
                <span>Brand Colors</span>
              </label>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-xs text-zinc-400 block mb-1.5">Primary Caption Color</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="w-9 h-9 rounded-xl bg-transparent cursor-pointer border border-white/20"
                    />
                    <span className="text-xs font-mono text-zinc-300 font-bold">{primaryColor}</span>
                  </div>
                </div>

                <div>
                  <span className="text-xs text-zinc-400 block mb-1.5">Highlight Word Color</span>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={secondaryColor}
                      onChange={(e) => setSecondaryColor(e.target.value)}
                      className="w-9 h-9 rounded-xl bg-transparent cursor-pointer border border-white/20"
                    />
                    <span className="text-xs font-mono text-zinc-300 font-bold">{secondaryColor}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Watermark Logo */}
            <div className="glass-panel p-5 rounded-3xl border border-white/[0.08]">
              <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider block mb-3 flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5 text-cyan-400" />
                <span>Watermark Placement</span>
              </label>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                {[
                  { id: "top-left", label: "Top Left" },
                  { id: "top-right", label: "Top Right" },
                  { id: "bottom-left", label: "Bottom Left" },
                  { id: "bottom-right", label: "Bottom Right" },
                ].map((pos) => (
                  <button
                    key={pos.id}
                    onClick={() => setWatermarkPos(pos.id as any)}
                    className={`py-2 rounded-xl text-xs font-semibold border ${
                      watermarkPos === pos.id
                        ? "bg-purple-600 border-purple-500 text-white"
                        : "bg-white/[0.02] border-white/[0.08] text-zinc-400"
                    }`}
                  >
                    {pos.label}
                  </button>
                ))}
              </div>

              <div>
                <div className="flex justify-between text-xs text-zinc-400 mb-1.5">
                  <span>Watermark Opacity</span>
                  <span className="font-bold text-white">{watermarkOpacity}%</span>
                </div>
                <input
                  type="range"
                  min="20"
                  max="100"
                  value={watermarkOpacity}
                  onChange={(e) => setWatermarkOpacity(Number(e.target.value))}
                  className="w-full h-1.5 bg-zinc-800 rounded appearance-none cursor-pointer accent-purple-500"
                />
              </div>
            </div>
          </div>

          {/* Right Live Preview */}
          <div className="lg:col-span-5">
            <div className="glass-panel-glow p-5 rounded-3xl border border-white/[0.12] text-center">
              <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider block mb-4">
                Live Brand Kit Preview
              </span>

              <div className="relative w-64 h-[440px] bg-black rounded-2xl mx-auto overflow-hidden shadow-2xl border border-white/[0.1] flex flex-col justify-between p-4">
                <img
                  src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=600&auto=format&fit=crop&q=80"
                  alt="Preview"
                  className="absolute inset-0 w-full h-full object-cover scale-105"
                />

                {/* Branded Watermark in chosen corner */}
                <div
                  style={{ opacity: watermarkOpacity / 100 }}
                  className={`absolute z-20 px-2 py-0.5 rounded-full bg-black/60 backdrop-blur-md text-[9px] font-black text-white border border-white/20 ${
                    watermarkPos === "top-right"
                      ? "top-3 right-3"
                      : watermarkPos === "top-left"
                      ? "top-3 left-3"
                      : watermarkPos === "bottom-right"
                      ? "bottom-3 right-3"
                      : "bottom-3 left-3"
                  }`}
                >
                  {brandName}
                </div>

                {/* Dynamic Subtitle with Brand Palette */}
                <div className="relative z-20 mt-auto mb-10 text-center">
                  <div className="inline-block px-3 py-1 rounded-xl bg-black/60 backdrop-blur-sm">
                    <span
                      style={{ color: primaryColor }}
                      className="font-black text-xl uppercase caption-hormozi"
                    >
                      Branded <span style={{ color: secondaryColor }}>Viral Clip</span> 🚀
                    </span>
                  </div>
                </div>
              </div>

              <p className="text-xs text-zinc-400 mt-4">
                These settings will automatically be inherited by all new clips generated.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
