"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Palette,
  ArrowLeft,
  Check,
  Type,
  Image as ImageIcon,
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
    <div className="min-h-screen bg-[#F5EFEB] text-[#2B1D16]">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-[#FAF6F1]/90 backdrop-blur-xl border-b border-[#E8DDD2] px-4 sm:px-6 py-3.5">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="p-2 rounded-xl bg-white border border-[#E8DDD2] text-[#2B1D16] hover:bg-[#EAE1D7] transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div className="flex items-center gap-2.5">
              <span className="font-black text-sm sm:text-base tracking-tight text-[#2B1D16]">
                Brand Kit & Templates
              </span>
              <span className="text-[11px] bg-[#EAE1D7] text-[#2B1D16] px-2.5 py-0.5 rounded-full font-bold">
                Brand Uniformity
              </span>
            </div>
          </div>

          <button
            onClick={handleSave}
            className="warm-btn-terracotta px-4 py-2 text-xs font-bold text-white rounded-xl flex items-center gap-1.5 shadow-sm cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{savedSuccess ? "Saved Successfully!" : "Save Brand Kit"}</span>
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="mb-8">
          <h1 className="text-2xl sm:text-3xl font-black text-[#2B1D16] tracking-tight">
            Brand Kit Settings
          </h1>
          <p className="text-xs sm:text-sm text-[#7A6B63] mt-1.5 font-medium">
            Configure custom fonts, watermark logos, brand colors, and templates applied to all generated clips.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Settings Left */}
          <div className="lg:col-span-7 space-y-6">
            {/* General Brand Name */}
            <div className="warm-card p-6 rounded-[28px] border border-[#E8DDD2]">
              <label className="text-xs font-black text-[#7A6B63] uppercase tracking-wider block mb-2">
                Brand Kit Profile Name
              </label>
              <input
                type="text"
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
                className="w-full warm-input text-[#2B1D16] font-bold text-xs sm:text-sm px-4 py-3 rounded-2xl"
              />
            </div>

            {/* Typography */}
            <div className="warm-card p-6 rounded-[28px] border border-[#E8DDD2]">
              <label className="text-xs font-black text-[#7A6B63] uppercase tracking-wider block mb-3.5 flex items-center gap-2">
                <Type className="w-4 h-4 text-[#C87A47]" />
                <span>Subtitle Typography</span>
              </label>
              <div className="grid grid-cols-2 gap-2.5">
                {[
                  "Impact / Bold Display",
                  "Geist Sans / Modern Tech",
                  "Montserrat / Heavy Clean",
                  "Anton / High Contrast",
                  "Outfit / Premium Rounded",
                  "Custom Font Upload (.ttf)",
                ].map((font) => {
                  const isSelected = selectedFont === font;
                  return (
                    <button
                      key={font}
                      onClick={() => setSelectedFont(font)}
                      className={`p-3.5 rounded-2xl border text-left text-xs font-bold transition-all flex items-center justify-between cursor-pointer ${
                        isSelected
                          ? "bg-[#2B1D16] border-[#2B1D16] text-white shadow-sm"
                          : "bg-[#FAF6F1] border-[#E8DDD2] text-[#2B1D16] hover:bg-[#EAE1D7]"
                      }`}
                    >
                      <span className="truncate">{font}</span>
                      {isSelected && <Check className="w-3.5 h-3.5 text-white" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Brand Colors */}
            <div className="warm-card p-6 rounded-[28px] border border-[#E8DDD2]">
              <label className="text-xs font-black text-[#7A6B63] uppercase tracking-wider block mb-3.5 flex items-center gap-2">
                <Palette className="w-4 h-4 text-[#C87A47]" />
                <span>Brand Colors</span>
              </label>
              <div className="grid grid-cols-2 gap-5">
                <div>
                  <span className="text-xs font-bold text-[#7A6B63] block mb-2">
                    Primary Caption Color
                  </span>
                  <div className="flex items-center gap-2.5">
                    <input
                      type="color"
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="w-10 h-10 rounded-xl bg-white cursor-pointer border border-[#E8DDD2] p-1"
                    />
                    <span className="text-xs font-mono text-[#2B1D16] font-bold">
                      {primaryColor}
                    </span>
                  </div>
                </div>

                <div>
                  <span className="text-xs font-bold text-[#7A6B63] block mb-2">
                    Highlight Word Color
                  </span>
                  <div className="flex items-center gap-2.5">
                    <input
                      type="color"
                      value={secondaryColor}
                      onChange={(e) => setSecondaryColor(e.target.value)}
                      className="w-10 h-10 rounded-xl bg-white cursor-pointer border border-[#E8DDD2] p-1"
                    />
                    <span className="text-xs font-mono text-[#2B1D16] font-bold">
                      {secondaryColor}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Watermark Logo */}
            <div className="warm-card p-6 rounded-[28px] border border-[#E8DDD2]">
              <label className="text-xs font-black text-[#7A6B63] uppercase tracking-wider block mb-3.5 flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-[#C87A47]" />
                <span>Watermark Placement</span>
              </label>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
                {[
                  { id: "top-left", label: "Top Left" },
                  { id: "top-right", label: "Top Right" },
                  { id: "bottom-left", label: "Bottom Left" },
                  { id: "bottom-right", label: "Bottom Right" },
                ].map((pos) => {
                  const isSelected = watermarkPos === pos.id;
                  return (
                    <button
                      key={pos.id}
                      onClick={() => setWatermarkPos(pos.id as any)}
                      className={`py-2.5 rounded-xl text-xs font-bold border transition-colors cursor-pointer ${
                        isSelected
                          ? "bg-[#C87A47] border-[#C87A47] text-white shadow-sm"
                          : "bg-[#FAF6F1] border-[#E8DDD2] text-[#7A6B63] hover:bg-[#EAE1D7]"
                      }`}
                    >
                      {pos.label}
                    </button>
                  );
                })}
              </div>

              <div>
                <div className="flex justify-between text-xs font-bold text-[#7A6B63] mb-2">
                  <span>Watermark Opacity</span>
                  <span className="font-mono text-[#2B1D16]">{watermarkOpacity}%</span>
                </div>
                <input
                  type="range"
                  min="20"
                  max="100"
                  value={watermarkOpacity}
                  onChange={(e) => setWatermarkOpacity(Number(e.target.value))}
                  className="w-full h-2 bg-[#EAE1D7] rounded-lg appearance-none cursor-pointer accent-[#C87A47]"
                />
              </div>
            </div>
          </div>

          {/* Right Live Preview */}
          <div className="lg:col-span-5">
            <div className="warm-card p-6 rounded-[32px] border border-[#E8DDD2] text-center sticky top-24">
              <span className="text-xs font-black text-[#7A6B63] uppercase tracking-wider block mb-4">
                Live Brand Kit Preview
              </span>

              <div className="relative w-64 h-[440px] bg-[#1A1412] rounded-[28px] mx-auto overflow-hidden shadow-lg border border-[#E8DDD2] flex flex-col justify-between p-4">
                <img
                  src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=600&auto=format&fit=crop&q=80"
                  alt="Preview"
                  className="absolute inset-0 w-full h-full object-cover scale-105"
                />

                {/* Branded Watermark in chosen corner */}
                <div
                  style={{ opacity: watermarkOpacity / 100 }}
                  className={`absolute z-20 px-2.5 py-1 rounded-full bg-black/70 backdrop-blur-md text-[9px] font-black text-white border border-white/20 shadow-sm ${
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
                  <div className="inline-block px-3.5 py-1.5 rounded-xl bg-black/70 backdrop-blur-sm">
                    <span
                      style={{ color: primaryColor }}
                      className="font-black text-xl uppercase caption-hormozi drop-shadow"
                    >
                      Branded <span style={{ color: secondaryColor }}>Viral Clip</span> 🚀
                    </span>
                  </div>
                </div>
              </div>

              <p className="text-xs text-[#7A6B63] mt-5 font-medium">
                These settings will automatically be inherited by all new clips generated.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
