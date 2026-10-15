"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Calculator, Clock, Eye, DollarSign, Sparkles, ArrowRight } from "lucide-react";

export default function RoiCalculator() {
  const [hoursPerMonth, setHoursPerMonth] = useState(6);

  // Calculations
  const clipsGenerated = Math.round(hoursPerMonth * 7.5);
  const hoursSaved = Math.round(hoursPerMonth * 6.2);
  const estimatedViews = (clipsGenerated * 28500).toLocaleString();
  const moneySaved = (hoursSaved * 45).toLocaleString(); // Freelancer rate $45/hr

  return (
    <section id="calculator" className="py-24 relative overflow-hidden bg-[#0A0C14] border-t border-b border-white/[0.08]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-xs font-semibold text-cyan-300 mb-4">
            <Calculator className="w-3.5 h-3.5" />
            <span>Interactive ROI Calculator</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight">
            Calculate Your <span className="gradient-text-purple">Time & Money Saved</span>
          </h2>
          <p className="mt-3 text-zinc-400 text-sm sm:text-base">
            See how much manual labor and production costs you eliminate by letting OpusClip repurpose your content.
          </p>
        </div>

        <div className="glass-panel-glow rounded-3xl p-6 sm:p-10 border border-white/[0.12] max-w-4xl mx-auto">
          {/* Slider Row */}
          <div className="mb-10">
            <div className="flex items-center justify-between mb-4">
              <label className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <span>Long-form Video Hours You Record Per Month:</span>
              </label>
              <div className="px-4 py-1.5 rounded-xl bg-purple-600/30 border border-purple-500/40 text-purple-300 font-extrabold text-lg">
                {hoursPerMonth} {hoursPerMonth === 1 ? "Hour" : "Hours"} / mo
              </div>
            </div>

            <input
              type="range"
              min="1"
              max="40"
              step="1"
              value={hoursPerMonth}
              onChange={(e) => setHoursPerMonth(Number(e.target.value))}
              className="w-full h-3 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-purple-500 focus:outline-none"
            />
            <div className="flex justify-between text-xs text-zinc-500 mt-2 font-medium">
              <span>1 hr (occasional creator)</span>
              <span>10 hrs (weekly podcaster)</span>
              <span>40+ hrs (media agency)</span>
            </div>
          </div>

          {/* Interactive Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {/* Metric 1 */}
            <div className="glass-panel p-5 rounded-2xl border border-white/[0.08] text-center">
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 text-purple-400 flex items-center justify-center mx-auto mb-2">
                <Sparkles className="w-5 h-5" />
              </div>
              <div className="text-3xl font-black text-white">{clipsGenerated}</div>
              <div className="text-xs font-semibold text-zinc-400 mt-1">Viral Shorts Generated</div>
            </div>

            {/* Metric 2 */}
            <div className="glass-panel p-5 rounded-2xl border border-white/[0.08] text-center">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center mx-auto mb-2">
                <Clock className="w-5 h-5" />
              </div>
              <div className="text-3xl font-black text-cyan-400">{hoursSaved} hrs</div>
              <div className="text-xs font-semibold text-zinc-400 mt-1">Editing Hours Saved</div>
            </div>

            {/* Metric 3 */}
            <div className="glass-panel p-5 rounded-2xl border border-white/[0.08] text-center">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center mx-auto mb-2">
                <DollarSign className="w-5 h-5" />
              </div>
              <div className="text-3xl font-black text-emerald-400">${moneySaved}</div>
              <div className="text-xs font-semibold text-zinc-400 mt-1">Editor Cost Saved</div>
            </div>

            {/* Metric 4 */}
            <div className="glass-panel p-5 rounded-2xl border border-white/[0.08] text-center">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center mx-auto mb-2">
                <Eye className="w-5 h-5" />
              </div>
              <div className="text-3xl font-black text-amber-400">+{estimatedViews}</div>
              <div className="text-xs font-semibold text-zinc-400 mt-1">Est. Organic Views</div>
            </div>
          </div>

          {/* Bottom Bar */}
          <div className="pt-4 border-t border-white/[0.08] flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-zinc-400 text-center sm:text-left">
              Based on benchmarks across 20M+ videos analyzed on TikTok, Reels, and Shorts.
            </p>
            <Link
              href="/dashboard"
              className="btn-primary-gradient px-6 py-2.5 rounded-xl font-bold text-white text-xs sm:text-sm flex items-center gap-2 cursor-pointer shadow-lg"
            >
              <span>Start Saving Time Now</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
