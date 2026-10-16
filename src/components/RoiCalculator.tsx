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
    <section id="calculator" className="py-20 relative overflow-hidden bg-[#F5EFEB] border-t border-b border-[#E8DDD2] text-[#2B1D16]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-14">
          <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-[#EAE1D7] border border-[#DDD3C7] text-xs font-bold text-[#2B1D16] mb-4">
            <Calculator className="w-3.5 h-3.5 text-[#C87A47]" />
            <span>Interactive ROI Calculator</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-[#2B1D16] tracking-tight">
            Calculate Your <span className="text-[#C87A47]">Time & Money Saved</span>
          </h2>
          <p className="mt-3 text-[#7A695F] text-sm sm:text-base">
            See how much manual labor and production costs you eliminate by letting Opus Studio repurpose your content.
          </p>
        </div>

        <div className="bg-white rounded-[32px] p-6 sm:p-10 border border-[#E8DDD2] max-w-4xl mx-auto shadow-sm">
          {/* Slider Row */}
          <div className="mb-10">
            <div className="flex items-center justify-between mb-4">
              <label className="text-sm sm:text-base font-bold text-[#2B1D16] flex items-center gap-2">
                <span>Long-form Video Hours You Record Per Month:</span>
              </label>
              <div className="px-4 py-1.5 rounded-full bg-[#FAF6F1] border border-[#E8DDD2] text-[#C87A47] font-extrabold text-lg">
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
              className="w-full h-3 bg-[#EAE1D7] rounded-lg appearance-none cursor-pointer accent-[#C87A47] focus:outline-none"
            />
            <div className="flex justify-between text-xs text-[#7A695F] mt-2 font-medium">
              <span>1 hr (occasional creator)</span>
              <span>10 hrs (weekly podcaster)</span>
              <span>40+ hrs (media agency)</span>
            </div>
          </div>

          {/* Interactive Metric Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {/* Metric 1 */}
            <div className="bg-[#FAF6F1] p-5 rounded-[24px] border border-[#E8DDD2] text-center">
              <div className="w-10 h-10 rounded-2xl bg-white text-[#C87A47] flex items-center justify-center mx-auto mb-2 border border-[#E8DDD2]">
                <Sparkles className="w-5 h-5" />
              </div>
              <div className="text-3xl font-black text-[#2B1D16]">{clipsGenerated}</div>
              <div className="text-xs font-bold text-[#7A695F] mt-1">Viral Shorts Generated</div>
            </div>

            {/* Metric 2 */}
            <div className="bg-[#FAF6F1] p-5 rounded-[24px] border border-[#E8DDD2] text-center">
              <div className="w-10 h-10 rounded-2xl bg-white text-[#C87A47] flex items-center justify-center mx-auto mb-2 border border-[#E8DDD2]">
                <Clock className="w-5 h-5" />
              </div>
              <div className="text-3xl font-black text-[#C87A47]">{hoursSaved} hrs</div>
              <div className="text-xs font-bold text-[#7A695F] mt-1">Editing Hours Saved</div>
            </div>

            {/* Metric 3 */}
            <div className="bg-[#FAF6F1] p-5 rounded-[24px] border border-[#E8DDD2] text-center">
              <div className="w-10 h-10 rounded-2xl bg-white text-[#3A7D44] flex items-center justify-center mx-auto mb-2 border border-[#E8DDD2]">
                <DollarSign className="w-5 h-5" />
              </div>
              <div className="text-3xl font-black text-[#3A7D44]">${moneySaved}</div>
              <div className="text-xs font-bold text-[#7A695F] mt-1">Editor Cost Saved</div>
            </div>

            {/* Metric 4 */}
            <div className="bg-[#FAF6F1] p-5 rounded-[24px] border border-[#E8DDD2] text-center">
              <div className="w-10 h-10 rounded-2xl bg-white text-[#2B1D16] flex items-center justify-center mx-auto mb-2 border border-[#E8DDD2]">
                <Eye className="w-5 h-5" />
              </div>
              <div className="text-3xl font-black text-[#2B1D16]">+{estimatedViews}</div>
              <div className="text-xs font-bold text-[#7A695F] mt-1">Est. Organic Views</div>
            </div>
          </div>

          {/* Bottom Bar */}
          <div className="pt-4 border-t border-[#E8DDD2] flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="text-xs text-[#7A695F] text-center sm:text-left">
              Based on benchmarks across 20M+ videos analyzed on TikTok, Reels, and Shorts.
            </p>
            <Link
              href="/dashboard"
              className="bg-[#C87A47] hover:bg-[#B66D3D] px-6 py-2.5 rounded-full font-bold text-white text-xs sm:text-sm flex items-center gap-2 cursor-pointer shadow-md shadow-[#C87A47]/20 transition-all"
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
