"use client";

import React from "react";
import Link from "next/link";
import { Scissors } from "lucide-react";

export default function Footer() {
  return (
    <footer className="bg-[#F8F7F4] border-t-2 border-black text-black text-xs py-12">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-10">
          {/* Brand info */}
          <div className="md:col-span-2">
            <Link href="/" className="inline-flex items-center gap-2 mb-3">
              <div className="w-7 h-7 bg-[#FFC700] border-2 border-black flex items-center justify-center font-black text-black shadow-[2px_2px_0px_#000000]">
                <Scissors className="w-3.5 h-3.5 stroke-[3]" />
              </div>
              <span className="font-black text-lg tracking-tighter uppercase">
                OPUS<span className="bg-[#FFC700] px-1 py-0.2 border border-black ml-0.5">CLIP</span>
              </span>
            </Link>
            <p className="text-[#555555] max-w-sm text-xs font-bold leading-relaxed mb-4">
              Automated video repurposing pipeline. Extract, reframe, subtitle, and distribute 9:16 vertical shorts from any long-form video.
            </p>
            <div className="inline-block bg-black text-white px-2.5 py-1 text-[10px] font-black uppercase tracking-wider border border-black">
              SYSTEM STATUS: OPERATIONAL
            </div>
          </div>

          {/* Core Tools */}
          <div>
            <div className="font-black uppercase tracking-wider mb-3 text-xs">TOOLS</div>
            <ul className="space-y-2 font-bold text-[#555555]">
              <li><Link href="/dashboard" className="hover:text-black transition-colors">Clips Dashboard</Link></li>
              <li><Link href="/editor" className="hover:text-black transition-colors">Studio Editor</Link></li>
              <li><Link href="/schedule" className="hover:text-black transition-colors">Social Scheduler</Link></li>
              <li><Link href="/brand-kit" className="hover:text-black transition-colors">Brand Kit</Link></li>
            </ul>
          </div>

          {/* Quick Actions */}
          <div>
            <div className="font-black uppercase tracking-wider mb-3 text-xs">RESOURCES</div>
            <ul className="space-y-2 font-bold text-[#555555]">
              <li><Link href="/dashboard" className="hover:text-black transition-colors">Active Speaker Reframe</Link></li>
              <li><Link href="/editor" className="hover:text-black transition-colors">CapCut Manual Controls</Link></li>
              <li><Link href="/dashboard" className="hover:text-black transition-colors">Subtitles & Captions</Link></li>
              <li><Link href="/dashboard" className="hover:text-black transition-colors">Sample Videos</Link></li>
            </ul>
          </div>
        </div>

        {/* Bottom credits */}
        <div className="pt-6 border-t-2 border-black/10 flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] font-bold text-[#666666]">
          <div>
            &copy; 2026 OPUSCLIP. MINIMAL VIDEO REPURPOSING.
          </div>
          <div className="flex items-center gap-4">
            <span className="hover:text-black cursor-pointer">PRIVACY</span>
            <span>&bull;</span>
            <span className="hover:text-black cursor-pointer">TERMS</span>
            <span>&bull;</span>
            <span className="hover:text-black cursor-pointer">STUDIO API</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
