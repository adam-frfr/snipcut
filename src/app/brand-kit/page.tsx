"use client";

import React, { useState, useEffect } from "react";
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

  // Persisted on this device (localStorage opus_brand_kit) and restored on
  // mount — previously "Save" was cosmetic and every choice was lost.
  useEffect(() => {
    try {
      const raw = localStorage.getItem("opus_brand_kit");
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (typeof saved.brandName === "string") setBrandName(saved.brandName);
      if (typeof saved.selectedFont === "string") setSelectedFont(saved.selectedFont);
      if (typeof saved.primaryColor === "string") setPrimaryColor(saved.primaryColor);
      if (typeof saved.secondaryColor === "string") setSecondaryColor(saved.secondaryColor);
      if (["top-right", "top-left", "bottom-right", "bottom-left"].includes(saved.watermarkPos))
        setWatermarkPos(saved.watermarkPos);
      if (typeof saved.watermarkOpacity === "number") setWatermarkOpacity(saved.watermarkOpacity);
    } catch {}
  }, []);

  const handleSave = () => {
    try {
      localStorage.setItem(
        "opus_brand_kit",
        JSON.stringify({ brandName, selectedFont, primaryColor, secondaryColor, watermarkPos, watermarkOpacity })
      );
    } catch {}
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[#F8F7F4] text-black">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-[#F8F7F4] border-b-2 border-black px-4 sm:px-6 py-3.5">
        <div className="flex items-center justify-between max-w-6xl mx-auto">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="p-1.5 border-2 border-black bg-white hover:bg-[#FFC700] rounded-lg transition-colors"
            >
              <ArrowLeft className="w-4 h-4 stroke-[3]" />
            </Link>
            <div className="flex items-center gap-2">
              <span className="font-black text-sm uppercase tracking-tight text-black">
                Brand Kit
              </span>
              <span className="neo-tag-yellow text-[10px]">
                Preset Uniformity
              </span>
            </div>
          </div>

          <button
            onClick={handleSave}
            className="neo-btn-yellow px-4 py-2 text-xs font-black uppercase rounded-lg flex items-center gap-1.5 cursor-pointer"
          >
            <Save className="w-3.5 h-3.5 stroke-[3]" />
            <span>{savedSuccess ? "Saved!" : "Save Brand Kit"}</span>
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="mb-8">
          <h1 className="text-2xl sm:text-4xl font-black uppercase text-black tracking-tight">
            Brand Kit Styling
          </h1>
          <p className="text-xs sm:text-sm text-[#555555] font-bold mt-1">
            Configure default font family, watermark logo, and caption highlight colors.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Settings Left */}
          <div className="lg:col-span-7 space-y-6">
            {/* General Brand Name */}
            <div className="bg-white border-2 border-black rounded-2xl p-6 shadow-[4px_4px_0px_#000000]">
              <label className="text-xs font-black uppercase tracking-wider block mb-2 text-black">
                Brand Profile Name
              </label>
              <input
                type="text"
                value={brandName}
                onChange={(e) => setBrandName(e.target.value)}
                className="w-full neo-input text-xs sm:text-sm px-3.5 py-2.5 font-bold"
              />
            </div>

            {/* Typography */}
            <div className="bg-white border-2 border-black rounded-2xl p-6 shadow-[4px_4px_0px_#000000]">
              <label className="text-xs font-black uppercase tracking-wider block mb-3.5 flex items-center gap-2 text-black">
                <Type className="w-4 h-4 stroke-[3]" />
                <span>Default Subtitle Font</span>
              </label>
              <div className="grid grid-cols-2 gap-2.5">
                {[
                  "Impact / Bold Display",
                  "Geist Sans / Modern Tech",
                  "Montserrat / Heavy Clean",
                  "Anton / High Contrast",
                  "Outfit / Premium Rounded",
                  "Plus Jakarta Sans",
                ].map((font) => {
                  const isSelected = selectedFont === font;
                  return (
                    <button
                      key={font}
                      onClick={() => setSelectedFont(font)}
                      className={`p-3 border-2 border-black rounded-xl text-left text-xs font-black uppercase transition-all flex items-center justify-between gap-2 cursor-pointer ${
                        isSelected
                          ? "bg-black text-white shadow-[2px_2px_0px_#FFC700]"
                          : "bg-[#F8F7F4] text-black hover:bg-white"
                      }`}
                    >
                      <span className="min-w-0 leading-snug">{font}</span>
                      {isSelected && <Check className="w-3.5 h-3.5 text-[#FFC700] shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Brand Colors */}
            <div className="bg-white border-2 border-black rounded-2xl p-6 shadow-[4px_4px_0px_#000000]">
              <label className="text-xs font-black uppercase tracking-wider block mb-3.5 flex items-center gap-2 text-black">
                <Palette className="w-4 h-4 stroke-[3]" />
                <span>Brand Colors</span>
              </label>
              <div className="grid grid-cols-2 gap-5">
                <div>
                  <span className="text-xs font-black uppercase text-[#555555] block mb-2">
                    Primary Caption Color
                  </span>
                  <div className="flex items-center gap-2.5">
                    <input
                      type="color"
                      value={primaryColor}
                      onChange={(e) => setPrimaryColor(e.target.value)}
                      className="w-10 h-10 border-2 border-black rounded-lg cursor-pointer bg-white p-0.5"
                    />
                    <span className="text-xs font-mono text-black font-black">
                      {primaryColor}
                    </span>
                  </div>
                </div>

                <div>
                  <span className="text-xs font-black uppercase text-[#555555] block mb-2">
                    Highlight Keyword Color
                  </span>
                  <div className="flex items-center gap-2.5">
                    <input
                      type="color"
                      value={secondaryColor}
                      onChange={(e) => setSecondaryColor(e.target.value)}
                      className="w-10 h-10 border-2 border-black rounded-lg cursor-pointer bg-white p-0.5"
                    />
                    <span className="text-xs font-mono text-black font-black">
                      {secondaryColor}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Watermark Logo */}
            <div className="bg-white border-2 border-black rounded-2xl p-6 shadow-[4px_4px_0px_#000000]">
              <label className="text-xs font-black uppercase tracking-wider block mb-3.5 flex items-center gap-2 text-black">
                <ImageIcon className="w-4 h-4 stroke-[3]" />
                <span>Watermark Placement</span>
              </label>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
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
                      className={`py-2 border-2 border-black rounded-lg text-xs font-black uppercase transition-colors cursor-pointer ${
                        isSelected
                          ? "bg-[#FFC700] text-black shadow-[2px_2px_0px_#000000]"
                          : "bg-[#F8F7F4] text-black hover:bg-white"
                      }`}
                    >
                      {pos.label}
                    </button>
                  );
                })}
              </div>

              <div>
                <div className="flex justify-between text-xs font-black uppercase text-black mb-1.5">
                  <span>Opacity</span>
                  <span className="font-mono">{watermarkOpacity}%</span>
                </div>
                <input
                  type="range"
                  min="20"
                  max="100"
                  value={watermarkOpacity}
                  onChange={(e) => setWatermarkOpacity(Number(e.target.value))}
                  className="w-full h-2 bg-[#E0DDD5] rounded appearance-none cursor-pointer accent-[#FFC700]"
                />
              </div>
            </div>
          </div>

          {/* Right Live Preview */}
          <div className="lg:col-span-5">
            <div className="bg-white border-2 border-black rounded-2xl p-6 text-center shadow-[4px_4px_0px_#000000] sticky top-24">
              <span className="text-xs font-black uppercase tracking-wider block mb-4 text-black">
                Brand Kit Preview
              </span>

              <div className="relative w-64 h-[440px] bg-black rounded-xl mx-auto overflow-hidden border-2 border-black shadow-[4px_4px_0px_#000000] flex flex-col justify-between p-4">
                <img
                  src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=600&auto=format&fit=crop&q=80"
                  alt="Preview"
                  className="absolute inset-0 w-full h-full object-cover"
                />

                {/* Branded Watermark in chosen corner */}
                <div
                  style={{ opacity: watermarkOpacity / 100 }}
                  className={`absolute z-20 px-2 py-0.5 bg-black text-white text-[9px] font-black uppercase border border-white ${
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

                {/* Dynamic Subtitle with Brand Palette - Zero Emojis */}
                <div className="relative z-20 mt-auto mb-10 text-center">
                  <div className="inline-block px-3 py-1 bg-black/90 border border-white/20">
                    <span
                      style={{ color: primaryColor }}
                      className="font-black text-xl uppercase tracking-tight"
                    >
                      Branded <span style={{ color: secondaryColor }}>Viral Clip</span>
                    </span>
                  </div>
                </div>
              </div>

              <p className="text-xs text-[#555555] font-bold mt-4">
                Applied automatically to newly generated clips.
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
