"use client";

import React, { useState } from "react";
import { ChevronDown, HelpCircle } from "lucide-react";
import { FAQS } from "@/lib/mockData";

export default function FaqSection() {
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  return (
    <section className="py-20 relative overflow-hidden bg-[#F5EFEB] border-t border-[#E8DDD2] text-[#2B1D16]">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-[#EAE1D7] border border-[#DDD3C7] text-xs font-bold text-[#2B1D16] mb-4">
            <HelpCircle className="w-3.5 h-3.5 text-[#C87A47]" />
            <span>Got Questions?</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-[#2B1D16] tracking-tight">
            Frequently Asked <span className="text-[#C87A47]">Questions</span>
          </h2>
          <p className="mt-3 text-[#7A695F] text-sm sm:text-base">
            Everything you need to know about the AI clipping models, pricing, and output formats.
          </p>
        </div>

        <div className="space-y-3.5">
          {FAQS.map((faq, idx) => {
            const isOpen = openIdx === idx;
            return (
              <div
                key={idx}
                className="bg-white rounded-2xl border border-[#E8DDD2] shadow-sm overflow-hidden transition-all duration-200"
              >
                <button
                  onClick={() => setOpenIdx(isOpen ? null : idx)}
                  className="w-full p-5 text-left flex items-center justify-between gap-4 hover:bg-[#FAF6F1]/50 cursor-pointer"
                >
                  <span className="text-base font-bold text-[#2B1D16]">{faq.q}</span>
                  <ChevronDown
                    className={`w-5 h-5 text-[#C87A47] flex-shrink-0 transition-transform duration-200 ${
                      isOpen ? "rotate-180" : ""
                    }`}
                  />
                </button>
                {isOpen && (
                  <div className="px-5 pb-5 text-xs sm:text-sm text-[#7A695F] leading-relaxed border-t border-[#E8DDD2] pt-3">
                    {faq.a}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
