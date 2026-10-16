"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Sparkles,
  Video,
  Scissors,
  Wand2,
  Calendar,
  Layers,
  ChevronDown,
  Menu,
  X,
  ArrowRight,
  Zap,
  Key,
} from "lucide-react";
import ApiSettingsModal from "./ApiSettingsModal";

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [productsOpen, setProductsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-[#F5EFEB]/90 backdrop-blur-xl border-b border-[#E8DDD2] shadow-sm py-3"
          : "bg-transparent py-5"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-10 h-10 rounded-2xl bg-[#C87A47] flex items-center justify-center shadow-sm transition-transform duration-200 group-hover:scale-105">
              <Scissors className="w-5 h-5 text-white" />
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-extrabold text-2xl tracking-tight text-[#2B1D16]">
                Opus<span className="text-[#C87A47]">Clip</span>
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#E8DDD2] text-[#5C4A3E]">
                Studio
              </span>
            </div>
          </Link>

          {/* Desktop Nav Links */}
          <nav className="hidden lg:flex items-center gap-6">
            {/* Products Dropdown */}
            <div className="relative" onMouseLeave={() => setProductsOpen(false)}>
              <button
                onClick={() => setProductsOpen(!productsOpen)}
                onMouseEnter={() => setProductsOpen(true)}
                className="flex items-center gap-1.5 text-sm font-bold text-[#5C4A3E] hover:text-[#2B1D16] transition-colors py-2"
              >
                <span>Features</span>
                <ChevronDown
                  className={`w-4 h-4 transition-transform duration-200 ${
                    productsOpen ? "rotate-180 text-[#C87A47]" : ""
                  }`}
                />
              </button>

              {productsOpen && (
                <div
                  onMouseEnter={() => setProductsOpen(true)}
                  className="absolute top-full left-0 mt-2 w-80 rounded-[28px] bg-white p-3 shadow-xl border border-[#E8DDD2] animate-in fade-in slide-in-from-top-2 duration-200"
                >
                  <div className="space-y-1">
                    <Link
                      href="/dashboard"
                      className="flex items-start gap-3 p-2.5 rounded-2xl hover:bg-[#FAF6F1] transition-colors group"
                    >
                      <div className="p-2 rounded-xl bg-[#FAF6F1] text-[#C87A47] border border-[#E8DDD2]">
                        <Wand2 className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-[#2B1D16] flex items-center gap-1.5">
                          ClipAnything™
                          <span className="text-[9px] bg-[#EAE1D7] text-[#5C4A3E] px-1.5 py-0.2 rounded-full font-bold">NEW</span>
                        </div>
                        <div className="text-xs text-[#7A695F]">Natural language prompt scene extraction</div>
                      </div>
                    </Link>

                    <Link
                      href="/dashboard"
                      className="flex items-start gap-3 p-2.5 rounded-2xl hover:bg-[#FAF6F1] transition-colors group"
                    >
                      <div className="p-2 rounded-xl bg-[#FAF6F1] text-[#3A7D44] border border-[#E8DDD2]">
                        <Video className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-[#2B1D16]">ReframeAnything™</div>
                        <div className="text-xs text-[#7A695F]">Active speaker face tracking & 9:16 split-screen</div>
                      </div>
                    </Link>

                    <Link
                      href="/editor"
                      className="flex items-start gap-3 p-2.5 rounded-2xl hover:bg-[#FAF6F1] transition-colors group"
                    >
                      <div className="p-2 rounded-xl bg-[#FAF6F1] text-[#2B1D16] border border-[#E8DDD2]">
                        <Sparkles className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-[#2B1D16]">AI Virality Score™</div>
                        <div className="text-xs text-[#7A695F]">0–100 algorithm predicting viral reach</div>
                      </div>
                    </Link>

                    <Link
                      href="/schedule"
                      className="flex items-start gap-3 p-2.5 rounded-2xl hover:bg-[#FAF6F1] transition-colors group"
                    >
                      <div className="p-2 rounded-xl bg-[#FAF6F1] text-[#C87A47] border border-[#E8DDD2]">
                        <Calendar className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-[#2B1D16]">Social Scheduler</div>
                        <div className="text-xs text-[#7A695F]">1-click auto-post to Shorts, Reels & TikTok</div>
                      </div>
                    </Link>

                    <Link
                      href="/brand-kit"
                      className="flex items-start gap-3 p-2.5 rounded-2xl hover:bg-[#FAF6F1] transition-colors group"
                    >
                      <div className="p-2 rounded-xl bg-[#FAF6F1] text-[#5C4A3E] border border-[#E8DDD2]">
                        <Layers className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-sm font-bold text-[#2B1D16]">Brand Kit</div>
                        <div className="text-xs text-[#7A695F]">Custom fonts, colors, and outro bumpers</div>
                      </div>
                    </Link>
                  </div>
                </div>
              )}
            </div>

            <Link href="/dashboard" className="text-sm font-bold text-[#5C4A3E] hover:text-[#2B1D16] transition-colors">
              Clips Dashboard
            </Link>
            <Link href="/editor" className="text-sm font-bold text-[#5C4A3E] hover:text-[#2B1D16] transition-colors">
              Studio Editor
            </Link>
            <Link href="/pricing" className="text-sm font-bold text-[#5C4A3E] hover:text-[#2B1D16] transition-colors">
              Pricing
            </Link>
          </nav>

          {/* Action CTAs */}
          <div className="hidden sm:flex items-center gap-3">
            <button
              onClick={() => setSettingsOpen(true)}
              className="warm-btn-secondary flex items-center gap-1.5 text-xs font-bold cursor-pointer"
              title="Configure OpenAI and Claude API Keys"
            >
              <Key className="w-3.5 h-3.5 text-[#C87A47]" />
              <span>API Settings</span>
            </button>

            <Link
              href="/dashboard"
              className="warm-btn-primary flex items-center gap-2 text-xs font-bold"
            >
              <span>Launch Studio</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {/* Mobile menu trigger */}
          <div className="lg:hidden flex items-center gap-2">
            <Link
              href="/dashboard"
              className="warm-btn-terracotta px-3.5 py-1.5 text-xs font-bold text-white rounded-xl shadow-sm"
            >
              Studio
            </Link>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 text-[#2B1D16] hover:bg-[#EAE1D7] rounded-xl transition-colors cursor-pointer"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden bg-[#FAF6F1] border-b border-[#E8DDD2] px-4 pt-3 pb-6 space-y-3 shadow-lg">
          <Link
            href="/dashboard"
            onClick={() => setMobileMenuOpen(false)}
            className="block py-2 text-sm font-bold text-[#2B1D16] hover:text-[#C87A47]"
          >
            Studio Dashboard
          </Link>
          <Link
            href="/editor"
            onClick={() => setMobileMenuOpen(false)}
            className="block py-2 text-sm font-bold text-[#2B1D16] hover:text-[#C87A47]"
          >
            Opus Video Editor
          </Link>
          <Link
            href="/schedule"
            onClick={() => setMobileMenuOpen(false)}
            className="block py-2 text-sm font-bold text-[#2B1D16] hover:text-[#C87A47]"
          >
            Social Scheduler
          </Link>
          <Link
            href="/brand-kit"
            onClick={() => setMobileMenuOpen(false)}
            className="block py-2 text-sm font-bold text-[#2B1D16] hover:text-[#C87A47]"
          >
            Brand Kit
          </Link>
          <a
            href="#pricing"
            onClick={() => setMobileMenuOpen(false)}
            className="block py-2 text-sm font-bold text-[#2B1D16] hover:text-[#C87A47]"
          >
            Pricing
          </a>
          <div className="pt-2">
            <Link
              href="/dashboard"
              onClick={() => setMobileMenuOpen(false)}
              className="w-full warm-btn-terracotta py-2.5 rounded-xl font-bold text-center block text-white text-sm shadow-sm"
            >
              Try OpusClip Free
            </Link>
          </div>
        </div>
      )}

      {/* API Keys Settings Modal */}
      <ApiSettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </header>
  );
}
