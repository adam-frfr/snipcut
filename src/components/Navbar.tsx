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
          ? "bg-[#090A10]/85 backdrop-blur-xl border-b border-white/[0.08] shadow-2xl shadow-purple-950/20 py-3"
          : "bg-transparent py-5"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="relative w-9 h-9 rounded-xl bg-gradient-to-tr from-[#6723FF] via-[#8E55FF] to-[#38BDF8] p-[1.5px] transition-transform duration-300 group-hover:scale-105">
              <div className="w-full h-full bg-[#090A10] rounded-[10px] flex items-center justify-center">
                <Scissors className="w-4 h-4 text-[#A855F7] group-hover:text-white transition-colors" />
              </div>
            </div>
            <div className="flex items-baseline gap-1.5">
              <span className="font-extrabold text-xl tracking-tight text-white font-sans">
                Opus<span className="text-[#A855F7]">Clip</span>
              </span>
              <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-[#6723FF]/20 text-[#C084FC] border border-[#6723FF]/30">
                AI 3.0
              </span>
            </div>
          </Link>

          {/* Desktop Nav Links */}
          <nav className="hidden lg:flex items-center gap-7">
            {/* Products Dropdown */}
            <div className="relative" onMouseLeave={() => setProductsOpen(false)}>
              <button
                onClick={() => setProductsOpen(!productsOpen)}
                onMouseEnter={() => setProductsOpen(true)}
                className="flex items-center gap-1.5 text-sm font-medium text-zinc-300 hover:text-white transition-colors py-2"
              >
                <span>Features & AI Tools</span>
                <ChevronDown
                  className={`w-4 h-4 transition-transform duration-200 ${
                    productsOpen ? "rotate-180 text-[#A855F7]" : ""
                  }`}
                />
              </button>

              {productsOpen && (
                <div
                  onMouseEnter={() => setProductsOpen(true)}
                  className="absolute top-full left-0 mt-2 w-80 rounded-2xl glass-panel-glow p-3 shadow-2xl border border-white/[0.1] animate-in fade-in slide-in-from-top-2 duration-200"
                >
                  <div className="space-y-1">
                    <Link
                      href="/dashboard"
                      className="flex items-start gap-3 p-2.5 rounded-xl hover:bg-white/[0.06] transition-colors group"
                    >
                      <div className="p-2 rounded-lg bg-purple-500/10 text-purple-400 group-hover:bg-purple-500/20">
                        <Wand2 className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-white flex items-center gap-1.5">
                          ClipAnything™
                          <span className="text-[9px] bg-purple-500/20 text-purple-300 px-1 py-0.2 rounded font-mono">NEW</span>
                        </div>
                        <div className="text-xs text-zinc-400">Natural language prompt scene extraction</div>
                      </div>
                    </Link>

                    <Link
                      href="/dashboard"
                      className="flex items-start gap-3 p-2.5 rounded-xl hover:bg-white/[0.06] transition-colors group"
                    >
                      <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400 group-hover:bg-cyan-500/20">
                        <Video className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-white">ReframeAnything™</div>
                        <div className="text-xs text-zinc-400">Active speaker face tracking & 9:16 split-screen</div>
                      </div>
                    </Link>

                    <Link
                      href="/editor"
                      className="flex items-start gap-3 p-2.5 rounded-xl hover:bg-white/[0.06] transition-colors group"
                    >
                      <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 group-hover:bg-emerald-500/20">
                        <Sparkles className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-white">AI Virality Score™</div>
                        <div className="text-xs text-zinc-400">0–100 algorithm predicting viral potential</div>
                      </div>
                    </Link>

                    <Link
                      href="/schedule"
                      className="flex items-start gap-3 p-2.5 rounded-xl hover:bg-white/[0.06] transition-colors group"
                    >
                      <div className="p-2 rounded-lg bg-pink-500/10 text-pink-400 group-hover:bg-pink-500/20">
                        <Calendar className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-white">Social Media Scheduler</div>
                        <div className="text-xs text-zinc-400">1-click auto-post to Shorts, Reels & TikTok</div>
                      </div>
                    </Link>

                    <Link
                      href="/brand-kit"
                      className="flex items-start gap-3 p-2.5 rounded-xl hover:bg-white/[0.06] transition-colors group"
                    >
                      <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 group-hover:bg-amber-500/20">
                        <Layers className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-white">Brand Kit & Watermarks</div>
                        <div className="text-xs text-zinc-400">Custom fonts, colors, and outro bumpers</div>
                      </div>
                    </Link>
                  </div>
                </div>
              )}
            </div>

            <a href="#how-it-works" className="text-sm font-medium text-zinc-300 hover:text-white transition-colors">
              How It Works
            </a>
            <a href="#interactive-demo" className="text-sm font-medium text-zinc-300 hover:text-white transition-colors">
              Interactive Demo
            </a>
            <a href="#pricing" className="text-sm font-medium text-zinc-300 hover:text-white transition-colors">
              Pricing
            </a>
            <a href="#calculator" className="text-sm font-medium text-zinc-300 hover:text-white transition-colors">
              ROI Calculator
            </a>
          </nav>

          {/* Action CTAs */}
          <div className="hidden sm:flex items-center gap-3.5">
            <Link
              href="/dashboard"
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-white/[0.05] border border-white/[0.1] text-zinc-300 hover:text-white hover:bg-white/[0.1] transition-all"
            >
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>90 Free Mins</span>
            </Link>

            <Link
              href="/dashboard"
              className="px-4 py-2 text-sm font-medium text-zinc-200 hover:text-white transition-colors"
            >
              Sign In
            </Link>

            <button
              onClick={() => setSettingsOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-300 hover:text-white hover:bg-purple-500/20 transition-all cursor-pointer"
              title="Configure OpenAI and Claude API Keys"
            >
              <Key className="w-3.5 h-3.5" />
              <span>API Keys</span>
            </button>

            <Link
              href="/dashboard"
              className="btn-primary-gradient px-4 py-2 text-sm font-semibold text-white rounded-xl flex items-center gap-2 group cursor-pointer"
            >
              <span>Launch Studio</span>
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>

          {/* Mobile menu trigger */}
          <div className="lg:hidden flex items-center gap-2">
            <Link
              href="/dashboard"
              className="btn-primary-gradient px-3 py-1.5 text-xs font-semibold text-white rounded-lg"
            >
              Studio
            </Link>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 text-zinc-300 hover:text-white"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="lg:hidden bg-[#0A0C14] border-b border-white/[0.1] px-4 pt-3 pb-6 space-y-3">
          <Link
            href="/dashboard"
            onClick={() => setMobileMenuOpen(false)}
            className="block py-2 text-base font-medium text-zinc-200 hover:text-white"
          >
            Studio Dashboard
          </Link>
          <Link
            href="/editor"
            onClick={() => setMobileMenuOpen(false)}
            className="block py-2 text-base font-medium text-zinc-200 hover:text-white"
          >
            Opus Video Editor
          </Link>
          <Link
            href="/schedule"
            onClick={() => setMobileMenuOpen(false)}
            className="block py-2 text-base font-medium text-zinc-200 hover:text-white"
          >
            Social Scheduler
          </Link>
          <Link
            href="/brand-kit"
            onClick={() => setMobileMenuOpen(false)}
            className="block py-2 text-base font-medium text-zinc-200 hover:text-white"
          >
            Brand Kit
          </Link>
          <a
            href="#pricing"
            onClick={() => setMobileMenuOpen(false)}
            className="block py-2 text-base font-medium text-zinc-200 hover:text-white"
          >
            Pricing
          </a>
          <div className="pt-2">
            <Link
              href="/dashboard"
              onClick={() => setMobileMenuOpen(false)}
              className="w-full btn-primary-gradient py-2.5 rounded-xl font-bold text-center block text-white text-sm"
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
