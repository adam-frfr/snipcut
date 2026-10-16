"use client";

import React, { useState } from "react";
import Link from "next/link";
import { Check, Sparkles, Zap, ArrowRight, Star, ShieldCheck } from "lucide-react";

export default function PricingSection() {
  const [isAnnual, setIsAnnual] = useState(true);
  const [proMinutes, setProMinutes] = useState(300);

  // Pro price based on minutes
  const proPriceMonthly = Math.round((proMinutes / 300) * 19);
  const proPriceAnnual = Math.round((proMinutes / 300) * 15);

  return (
    <section id="pricing" className="py-20 relative overflow-hidden bg-[#F5EFEB] text-[#2B1D16]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-14">
          <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-[#EAE1D7] border border-[#DDD3C7] text-xs font-bold text-[#2B1D16] mb-4">
            <Zap className="w-3.5 h-3.5 text-[#C87A47]" />
            <span>Transparent Pricing</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-[#2B1D16] tracking-tight">
            Flexible Plans for <span className="text-[#C87A47]">Every Creator</span>
          </h2>
          <p className="mt-3 text-[#7A695F] text-sm sm:text-base">
            Start free with 90 trial minutes. Upgrade or cancel anytime. Unused minutes roll over!
          </p>

          {/* Monthly / Annual Toggle */}
          <div className="mt-8 inline-flex items-center gap-2 p-1.5 rounded-full bg-[#EAE1D7] border border-[#DDD3C7]">
            <button
              onClick={() => setIsAnnual(false)}
              className={`px-5 py-2 rounded-full text-xs sm:text-sm font-bold transition-all ${
                !isAnnual ? "bg-[#2B1D16] text-white shadow-sm" : "text-[#7A695F] hover:text-[#2B1D16]"
              }`}
            >
              Monthly Billing
            </button>
            <button
              onClick={() => setIsAnnual(true)}
              className={`px-5 py-2 rounded-full text-xs sm:text-sm font-bold transition-all flex items-center gap-1.5 ${
                isAnnual ? "bg-[#2B1D16] text-white shadow-sm" : "text-[#7A695F] hover:text-[#2B1D16]"
              }`}
            >
              <span>Annual Billing</span>
              <span className="text-[10px] bg-[#3A7D44] text-white px-2 py-0.5 rounded-full font-extrabold">
                SAVE 20%
              </span>
            </button>
          </div>
        </div>

        {/* Pricing Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 items-stretch">
          {/* Plan 1: Free Forever */}
          <div className="bg-white rounded-[28px] p-6 sm:p-7 border border-[#E8DDD2] flex flex-col justify-between shadow-sm">
            <div>
              <div className="text-xs font-bold text-[#7A695F] uppercase tracking-wider mb-2">Free Forever</div>
              <h3 className="text-2xl font-extrabold text-[#2B1D16]">Starter Free</h3>
              <p className="text-xs text-[#7A695F] mt-1 mb-5">Perfect to test out AI clipping with your first videos.</p>

              <div className="flex items-baseline gap-1 mb-6">
                <span className="text-4xl font-extrabold text-[#2B1D16]">$0</span>
                <span className="text-xs text-[#7A695F] font-semibold">/ month</span>
              </div>

              <div className="text-xs font-bold text-[#2B1D16] bg-[#FAF6F1] px-3 py-1.5 rounded-full border border-[#E8DDD2] mb-6">
                60 Upload Minutes / mo
              </div>

              <ul className="space-y-3 mb-6">
                <li className="text-xs text-[#2B1D16] flex items-center gap-2">
                  <Check className="w-4 h-4 text-[#3A7D44] flex-shrink-0" />
                  <span>720p HD resolution</span>
                </li>
                <li className="text-xs text-[#2B1D16] flex items-center gap-2">
                  <Check className="w-4 h-4 text-[#3A7D44] flex-shrink-0" />
                  <span>Auto dynamic captions</span>
                </li>
                <li className="text-xs text-[#2B1D16] flex items-center gap-2">
                  <Check className="w-4 h-4 text-[#3A7D44] flex-shrink-0" />
                  <span>Basic speaker center</span>
                </li>
                <li className="text-xs text-[#7A695F] flex items-center gap-2">
                  <span className="text-[#DDD3C7] font-bold">•</span>
                  <span>Small watermark included</span>
                </li>
              </ul>
            </div>

            <Link
              href="/dashboard"
              className="w-full py-3 rounded-full bg-[#FAF6F1] hover:bg-[#EAE1D7] text-[#2B1D16] border border-[#E8DDD2] font-bold text-xs text-center transition-colors block"
            >
              Get Started Free
            </Link>
          </div>

          {/* Plan 2: Starter */}
          <div className="bg-white rounded-[28px] p-6 sm:p-7 border border-[#E8DDD2] flex flex-col justify-between shadow-sm">
            <div>
              <div className="text-xs font-bold text-[#7A695F] uppercase tracking-wider mb-2">Individual</div>
              <h3 className="text-2xl font-extrabold text-[#2B1D16]">Starter</h3>
              <p className="text-xs text-[#7A695F] mt-1 mb-5">For independent creators publishing 2-3 clips weekly.</p>

              <div className="flex items-baseline gap-1 mb-6">
                <span className="text-4xl font-extrabold text-[#2B1D16]">
                  ${isAnnual ? "7" : "9"}
                </span>
                <span className="text-xs text-[#7A695F] font-semibold">/ month</span>
              </div>

              <div className="text-xs font-bold text-[#C87A47] bg-[#FAF6F1] px-3 py-1.5 rounded-full border border-[#E8DDD2] mb-6">
                150 Upload Minutes / mo
              </div>

              <ul className="space-y-3 mb-6">
                <li className="text-xs text-[#2B1D16] flex items-center gap-2">
                  <Check className="w-4 h-4 text-[#3A7D44] flex-shrink-0" />
                  <span>1080p Full HD resolution</span>
                </li>
                <li className="text-xs text-[#2B1D16] flex items-center gap-2">
                  <Check className="w-4 h-4 text-[#3A7D44] flex-shrink-0" />
                  <span>No watermark</span>
                </li>
                <li className="text-xs text-[#2B1D16] flex items-center gap-2">
                  <Check className="w-4 h-4 text-[#3A7D44] flex-shrink-0" />
                  <span>AI Virality Score™ breakdown</span>
                </li>
                <li className="text-xs text-[#2B1D16] flex items-center gap-2">
                  <Check className="w-4 h-4 text-[#3A7D44] flex-shrink-0" />
                  <span>Auto-emojis & highlights</span>
                </li>
              </ul>
            </div>

            <Link
              href="/dashboard"
              className="w-full py-3 rounded-full bg-[#FAF6F1] hover:bg-[#EAE1D7] text-[#2B1D16] border border-[#E8DDD2] font-bold text-xs text-center transition-colors block"
            >
              Choose Starter
            </Link>
          </div>

          {/* Plan 3: Pro (FLAGSHIP / MOST POPULAR) */}
          <div className="bg-white rounded-[28px] p-6 sm:p-7 border-2 border-[#2B1D16] shadow-md flex flex-col justify-between relative">
            {/* Best value badge */}
            <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-[#2B1D16] text-white text-[10px] font-extrabold uppercase tracking-wider shadow-sm flex items-center gap-1">
              <Star className="w-3 h-3 fill-amber-300 text-amber-300" />
              <span>Most Popular</span>
            </div>

            <div>
              <div className="text-xs font-bold text-[#C87A47] uppercase tracking-wider mb-2">Serious Creators</div>
              <h3 className="text-2xl font-extrabold text-[#2B1D16]">Pro Creator</h3>
              <p className="text-xs text-[#7A695F] mt-1 mb-4">Every single AI feature unlocked for rapid viral scaling.</p>

              <div className="flex items-baseline gap-1 mb-3">
                <span className="text-4xl font-extrabold text-[#2B1D16]">
                  ${isAnnual ? proPriceAnnual : proPriceMonthly}
                </span>
                <span className="text-xs text-[#7A695F] font-semibold">/ month</span>
              </div>

              {/* Interactive Credit Slider inside Pro */}
              <div className="p-3 rounded-2xl bg-[#FAF6F1] border border-[#E8DDD2] mb-5">
                <div className="flex justify-between text-[11px] font-bold text-[#2B1D16] mb-1">
                  <span>Credit Allowance:</span>
                  <span className="text-[#C87A47]">{proMinutes} Mins / mo</span>
                </div>
                <input
                  type="range"
                  min="300"
                  max="1200"
                  step="150"
                  value={proMinutes}
                  onChange={(e) => setProMinutes(Number(e.target.value))}
                  className="w-full h-1.5 bg-[#EAE1D7] rounded appearance-none cursor-pointer accent-[#C87A47]"
                />
              </div>

              <ul className="space-y-3 mb-6">
                <li className="text-xs text-[#2B1D16] font-medium flex items-center gap-2">
                  <Check className="w-4 h-4 text-[#3A7D44] flex-shrink-0" />
                  <span>ClipAnything™ Natural Prompting</span>
                </li>
                <li className="text-xs text-[#2B1D16] font-medium flex items-center gap-2">
                  <Check className="w-4 h-4 text-[#3A7D44] flex-shrink-0" />
                  <span>ReframeAnything™ Multi-Speaker Split</span>
                </li>
                <li className="text-xs text-[#2B1D16] font-medium flex items-center gap-2">
                  <Check className="w-4 h-4 text-[#3A7D44] flex-shrink-0" />
                  <span>Contextual AI B-Roll & Cutaways</span>
                </li>
                <li className="text-xs text-[#2B1D16] font-medium flex items-center gap-2">
                  <Check className="w-4 h-4 text-[#3A7D44] flex-shrink-0" />
                  <span>1-Click Social Media Scheduler</span>
                </li>
                <li className="text-xs text-[#2B1D16] font-medium flex items-center gap-2">
                  <Check className="w-4 h-4 text-[#3A7D44] flex-shrink-0" />
                  <span>Brand Kit (Custom fonts & logos)</span>
                </li>
                <li className="text-xs text-[#2B1D16] font-medium flex items-center gap-2">
                  <Check className="w-4 h-4 text-[#3A7D44] flex-shrink-0" />
                  <span>Filler words & pause cutter</span>
                </li>
              </ul>
            </div>

            <Link
              href="/dashboard"
              className="w-full bg-[#C87A47] hover:bg-[#B66D3D] py-3.5 rounded-full text-white font-bold text-xs text-center shadow-md shadow-[#C87A47]/20 transition-all block"
            >
              Start 7-Day Free Pro Trial
            </Link>
          </div>

          {/* Plan 4: Enterprise */}
          <div className="bg-white rounded-[28px] p-6 sm:p-7 border border-[#E8DDD2] flex flex-col justify-between shadow-sm">
            <div>
              <div className="text-xs font-bold text-[#7A695F] uppercase tracking-wider mb-2">Agencies & Media</div>
              <h3 className="text-2xl font-extrabold text-[#2B1D16]">Enterprise</h3>
              <p className="text-xs text-[#7A695F] mt-1 mb-5">For media companies, agencies, and high-volume networks.</p>

              <div className="flex items-baseline gap-1 mb-6">
                <span className="text-4xl font-extrabold text-[#2B1D16]">
                  ${isAnnual ? "79" : "99"}
                </span>
                <span className="text-xs text-[#7A695F] font-semibold">/ month</span>
              </div>

              <div className="text-xs font-bold text-[#2B1D16] bg-[#FAF6F1] px-3 py-1.5 rounded-full border border-[#E8DDD2] mb-6">
                3,000+ Mins / mo & Team Seats
              </div>

              <ul className="space-y-3 mb-6">
                <li className="text-xs text-[#2B1D16] flex items-center gap-2">
                  <Check className="w-4 h-4 text-[#3A7D44] flex-shrink-0" />
                  <span>Dedicated GPU rendering cluster</span>
                </li>
                <li className="text-xs text-[#2B1D16] flex items-center gap-2">
                  <Check className="w-4 h-4 text-[#3A7D44] flex-shrink-0" />
                  <span>Full API & Webhook access</span>
                </li>
                <li className="text-xs text-[#2B1D16] flex items-center gap-2">
                  <Check className="w-4 h-4 text-[#3A7D44] flex-shrink-0" />
                  <span>Unlimited team seats & workspaces</span>
                </li>
                <li className="text-xs text-[#2B1D16] flex items-center gap-2">
                  <Check className="w-4 h-4 text-[#3A7D44] flex-shrink-0" />
                  <span>Dedicated account manager</span>
                </li>
              </ul>
            </div>

            <Link
              href="/dashboard"
              className="w-full py-3 rounded-full bg-[#FAF6F1] hover:bg-[#EAE1D7] text-[#2B1D16] border border-[#E8DDD2] font-bold text-xs text-center transition-colors block"
            >
              Contact Enterprise
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
