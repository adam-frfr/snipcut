"use client";

import React from "react";
import Link from "next/link";
import { Scissors, Sparkles, Heart } from "lucide-react";

export default function Footer() {
  return (
    <footer className="bg-[#05060A] border-t border-white/[0.08] text-zinc-400 text-xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-12">
          {/* Brand info */}
          <div className="col-span-2">
            <Link href="/" className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-[#6723FF] to-[#38BDF8] flex items-center justify-center p-[1px]">
                <div className="w-full h-full bg-[#090A10] rounded-[10px] flex items-center justify-center">
                  <Scissors className="w-3.5 h-3.5 text-purple-400" />
                </div>
              </div>
              <span className="font-black text-lg text-white">
                Opus<span className="text-[#A855F7]">Clip</span>
              </span>
            </Link>
            <p className="text-zinc-400 max-w-sm text-xs leading-relaxed mb-4">
              OpusClip turns long-form video into high-retention viral clips, and auto-publishes to TikTok, YouTube Shorts, and Instagram Reels in 1-click. Empowering 20M+ creators worldwide.
            </p>
            <div className="flex items-center gap-2 text-zinc-500">
              <span className="flex h-2 w-2 rounded-full bg-emerald-500" />
              <span>All AI Systems Operational</span>
            </div>
          </div>

          {/* Product links */}
          <div>
            <div className="font-bold text-white uppercase tracking-wider mb-3 text-[11px]">AI Tools</div>
            <ul className="space-y-2">
              <li><Link href="/dashboard" className="hover:text-white transition-colors">ClipAnything™</Link></li>
              <li><Link href="/dashboard" className="hover:text-white transition-colors">ReframeAnything™</Link></li>
              <li><Link href="/editor" className="hover:text-white transition-colors">AI Virality Score™</Link></li>
              <li><Link href="/editor" className="hover:text-white transition-colors">Dynamic Captions</Link></li>
              <li><Link href="/schedule" className="hover:text-white transition-colors">Social Scheduler</Link></li>
              <li><Link href="/brand-kit" className="hover:text-white transition-colors">Brand Kit</Link></li>
            </ul>
          </div>

          {/* Use cases */}
          <div>
            <div className="font-bold text-white uppercase tracking-wider mb-3 text-[11px]">Use Cases</div>
            <ul className="space-y-2">
              <li><Link href="/dashboard" className="hover:text-white transition-colors">Podcasters</Link></li>
              <li><Link href="/dashboard" className="hover:text-white transition-colors">YouTubers</Link></li>
              <li><Link href="/dashboard" className="hover:text-white transition-colors">Agency Owners</Link></li>
              <li><Link href="/dashboard" className="hover:text-white transition-colors">Educators</Link></li>
              <li><Link href="/dashboard" className="hover:text-white transition-colors">Gaming Streamers</Link></li>
            </ul>
          </div>

          {/* Comparisons */}
          <div>
            <div className="font-bold text-white uppercase tracking-wider mb-3 text-[11px]">Compare</div>
            <ul className="space-y-2">
              <li><span className="text-zinc-500">OpusClip vs CapCut</span></li>
              <li><span className="text-zinc-500">OpusClip vs Descript</span></li>
              <li><span className="text-zinc-500">OpusClip vs Munch</span></li>
              <li><span className="text-zinc-500">OpusClip vs Submagic</span></li>
              <li><Link href="/pricing" className="hover:text-white transition-colors">Pricing & Plans</Link></li>
            </ul>
          </div>
        </div>

        {/* Bottom credits */}
        <div className="pt-8 border-t border-white/[0.06] flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-zinc-500 text-[11px]">
            © 2026 OpusClip Clone. Built for personal creator productivity. All rights reserved.
          </div>
          <div className="flex items-center gap-4 text-[11px] text-zinc-500">
            <span className="hover:text-zinc-400 cursor-pointer">Privacy Policy</span>
            <span>•</span>
            <span className="hover:text-zinc-400 cursor-pointer">Terms of Service</span>
            <span>•</span>
            <span className="hover:text-zinc-400 cursor-pointer">API Status</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
