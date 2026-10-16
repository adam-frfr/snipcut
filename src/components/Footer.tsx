"use client";

import React from "react";
import Link from "next/link";
import { Scissors, Sparkles, Heart } from "lucide-react";

export default function Footer() {
  return (
    <footer className="bg-[#EAE1D7] border-t border-[#DDD3C7] text-[#7A695F] text-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-12">
          {/* Brand info */}
          <div className="col-span-2">
            <Link href="/" className="flex items-center gap-2.5 mb-4">
              <div className="w-8 h-8 rounded-full bg-[#C87A47] text-white flex items-center justify-center shadow-sm">
                <Scissors className="w-4 h-4" />
              </div>
              <span className="font-extrabold text-lg text-[#2B1D16]">
                Opus<span className="text-[#C87A47]">Clip</span>
              </span>
            </Link>
            <p className="text-[#7A695F] max-w-sm text-xs leading-relaxed mb-4">
              OpusClip turns long-form video into high-retention viral clips, and auto-publishes to TikTok, YouTube Shorts, and Instagram Reels in 1-click. Empowering 20M+ creators worldwide.
            </p>
            <div className="flex items-center gap-2 text-[#7A695F]">
              <span className="flex h-2 w-2 rounded-full bg-[#3A7D44]" />
              <span className="font-medium text-[#2B1D16]">All AI Systems Operational</span>
            </div>
          </div>

          {/* Product links */}
          <div>
            <div className="font-extrabold text-[#2B1D16] uppercase tracking-wider mb-3 text-[11px]">AI Tools</div>
            <ul className="space-y-2">
              <li><Link href="/dashboard" className="hover:text-[#2B1D16] transition-colors">ClipAnything™</Link></li>
              <li><Link href="/dashboard" className="hover:text-[#2B1D16] transition-colors">ReframeAnything™</Link></li>
              <li><Link href="/editor" className="hover:text-[#2B1D16] transition-colors">AI Virality Score™</Link></li>
              <li><Link href="/editor" className="hover:text-[#2B1D16] transition-colors">Dynamic Captions</Link></li>
              <li><Link href="/schedule" className="hover:text-[#2B1D16] transition-colors">Social Scheduler</Link></li>
              <li><Link href="/brand-kit" className="hover:text-[#2B1D16] transition-colors">Brand Kit</Link></li>
            </ul>
          </div>

          {/* Use cases */}
          <div>
            <div className="font-extrabold text-[#2B1D16] uppercase tracking-wider mb-3 text-[11px]">Use Cases</div>
            <ul className="space-y-2">
              <li><Link href="/dashboard" className="hover:text-[#2B1D16] transition-colors">Podcasters</Link></li>
              <li><Link href="/dashboard" className="hover:text-[#2B1D16] transition-colors">YouTubers</Link></li>
              <li><Link href="/dashboard" className="hover:text-[#2B1D16] transition-colors">Agency Owners</Link></li>
              <li><Link href="/dashboard" className="hover:text-[#2B1D16] transition-colors">Educators</Link></li>
              <li><Link href="/dashboard" className="hover:text-[#2B1D16] transition-colors">Gaming Streamers</Link></li>
            </ul>
          </div>

          {/* Comparisons */}
          <div>
            <div className="font-extrabold text-[#2B1D16] uppercase tracking-wider mb-3 text-[11px]">Compare</div>
            <ul className="space-y-2">
              <li><span className="text-[#A09085]">OpusClip vs CapCut</span></li>
              <li><span className="text-[#A09085]">OpusClip vs Descript</span></li>
              <li><span className="text-[#A09085]">OpusClip vs Munch</span></li>
              <li><span className="text-[#A09085]">OpusClip vs Submagic</span></li>
              <li><Link href="/pricing" className="hover:text-[#2B1D16] transition-colors">Pricing & Plans</Link></li>
            </ul>
          </div>
        </div>

        {/* Bottom credits */}
        <div className="pt-8 border-t border-[#DDD3C7] flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-[#8C7A6D] text-[11px]">
            © 2026 OpusClip Clone. Built for personal creator productivity. All rights reserved.
          </div>
          <div className="flex items-center gap-4 text-[11px] text-[#8C7A6D]">
            <span className="hover:text-[#2B1D16] cursor-pointer">Privacy Policy</span>
            <span>•</span>
            <span className="hover:text-[#2B1D16] cursor-pointer">Terms of Service</span>
            <span>•</span>
            <span className="hover:text-[#2B1D16] cursor-pointer">API Status</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
