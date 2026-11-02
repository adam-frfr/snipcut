"use client";

import React from "react";
import Link from "next/link";
import {
  Wand2,
  Video,
  Type,
  Sliders,
  ArrowRight,
  Check,
} from "lucide-react";

export default function FeaturesSection() {
  const features = [
    {
      id: "reframe-anything",
      tag: "COMPUTER VISION",
      tagColor: "bg-[#FFC700]",
      icon: Video,
      title: "Active Speaker Detection and 9:16 Reframe",
      description:
        "Automatically detects speakers in landscape 16:9 videos and keeps their face centered in vertical 9:16 with smooth camera motion. Switches to dual stack in conversations.",
      points: [
        "Dynamic camera pan following natural speech",
        "Dual-speaker vertical stack layout for podcasts",
        "Safe zone margins for TikTok & Reels UI",
      ],
    },
    {
      id: "clip-anything",
      tag: "NATURAL LANGUAGE",
      tagColor: "bg-[#FF5500] text-white",
      icon: Wand2,
      title: "ClipAnything Scene Discovery",
      description:
        "Prompt OpusClip with plain English to isolate exact topics, emotional arguments, or specific scenes across hours of video instead of blind guessing.",
      points: [
        "Multimodal visual and audio narrative analysis",
        "Instant topic isolation across long-form video",
        "Extract key hooks and conclusions in seconds",
      ],
    },
    {
      id: "dynamic-captions",
      tag: "VIRAL CAPTIONS",
      tagColor: "bg-black text-white",
      icon: Type,
      title: "Hardcoded Dynamic Word Highlighting",
      description:
        "97%+ accurate speech-to-text with animated karaoke word highlighting. Injects bold colors and high-contrast outline strokes for maximum viewer retention.",
      points: [
        "Presets: Hormozi, MrBeast, Cyber, Clean Minimal",
        "Stroke outlines, background boxes, custom fonts",
        "Burned-in directly via FFmpeg without watermark",
      ],
    },
    {
      id: "manual-editor",
      tag: "STUDIO CONTROLS",
      tagColor: "bg-[#FFC700]",
      icon: Sliders,
      title: "CapCut-Grade Manual Editing Suite",
      description:
        "Full timeline control with zoom, horizontal mirroring, rotation, color grading adjustments, playback speed, and word-by-word transcript trimming.",
      points: [
        "Scale, position offset, and 90-degree rotation",
        "Brightness, contrast, saturation, and color warmth",
        "Cut filler pauses with 1-click text strikeout",
      ],
    },
  ];

  return (
    <section id="features" className="py-20 bg-[#F8F7F4] border-t-2 border-black">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section Header */}
        <div className="text-center max-w-2xl mx-auto mb-14">
          <div className="inline-block bg-[#FFC700] text-black font-black uppercase text-xs tracking-widest px-3 py-1 border-2 border-black shadow-[2px_2px_0px_#000000] mb-4">
            CORE CAPABILITIES
          </div>
          <h2 className="text-3xl sm:text-5xl font-black text-black uppercase tracking-tight leading-tight">
            EVERY TOOL BUILT FOR
            <br />
            <span className="bg-[#FFC700] px-2 py-0.5 border-2 border-black inline-block mt-1">
              SHORT-FORM REACH
            </span>
          </h2>
          <p className="mt-4 text-xs sm:text-sm text-[#555555] font-bold">
            No fluff. No bloated menus. A focused video clipping pipeline engineered for creators and editors.
          </p>
        </div>

        {/* 4 Neo-Brutalist Feature Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {features.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.id}
                className="bg-white border-2 border-black rounded-2xl p-6 sm:p-7 shadow-[4px_4px_0px_#000000] hover:translate-x-[-1px] hover:translate-y-[-1px] hover:shadow-[6px_6px_0px_#000000] transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-10 h-10 border-2 border-black bg-[#F8F7F4] flex items-center justify-center shadow-[2px_2px_0px_#000000]">
                      <Icon className="w-5 h-5 text-black stroke-[2.5]" />
                    </div>
                    <span className={`text-[10px] font-black uppercase tracking-wider px-2.5 py-1 border-2 border-black ${item.tagColor}`}>
                      {item.tag}
                    </span>
                  </div>

                  <h3 className="text-lg sm:text-xl font-black uppercase text-black mb-2 tracking-tight">
                    {item.title}
                  </h3>

                  <p className="text-xs text-[#555555] font-bold leading-relaxed mb-5">
                    {item.description}
                  </p>

                  <div className="space-y-2 mb-6">
                    {item.points.map((pt, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-xs font-bold text-black">
                        <div className="w-4 h-4 rounded-full border border-black bg-[#FFC700] flex items-center justify-center flex-shrink-0">
                          <Check className="w-2.5 h-2.5 stroke-[3]" />
                        </div>
                        <span>{pt}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-4 border-t-2 border-black/10 flex items-center justify-between">
                  <span className="text-[11px] font-black uppercase text-[#666666]">PRODUCTION READY</span>
                  <Link
                    href="/dashboard"
                    className="inline-flex items-center gap-1.5 text-xs font-black uppercase text-black hover:text-[#FF5500] transition-colors"
                  >
                    <span>Launch</span>
                    <ArrowRight className="w-3.5 h-3.5 stroke-[3]" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>

        {/* Minimal Bottom CTA Banner */}
        <div className="mt-14 bg-white border-2 border-black rounded-2xl p-7 sm:p-10 text-center shadow-[5px_5px_0px_#000000] relative overflow-hidden">
          <h3 className="text-2xl sm:text-4xl font-black uppercase text-black tracking-tight mb-2">
            READY TO REPURPOSE YOUR VIDEO?
          </h3>
          <p className="text-xs sm:text-sm text-[#555555] font-bold max-w-lg mx-auto mb-6">
            Paste any link or drop an MP4. Extract clean, reframed vertical clips with burned-in subtitles.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/dashboard"
              className="inline-flex items-stretch border-2 border-black rounded-xl overflow-hidden shadow-[3px_3px_0px_#000000] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[2px_2px_0px_#000000] transition-all group w-full sm:w-auto"
            >
              <span className="bg-[#FFC700] group-hover:bg-[#FFD633] text-black font-black uppercase tracking-wider text-xs sm:text-sm py-3 px-6 flex items-center justify-center">
                Open Studio Dashboard
              </span>
              <span className="bg-black text-white px-3.5 flex items-center justify-center group-hover:bg-[#FF5500] transition-colors">
                <ArrowRight className="w-4 h-4 stroke-[3]" />
              </span>
            </Link>

            <Link
              href="/editor"
              className="neo-btn-white py-3 px-6 rounded-xl text-xs font-black uppercase tracking-wider w-full sm:w-auto text-center"
            >
              Studio Editor
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
