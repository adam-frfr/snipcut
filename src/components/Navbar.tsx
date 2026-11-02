"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Scissors,
  Menu,
  X,
  ArrowRight,
  Key,
} from "lucide-react";
import ApiSettingsModal from "./ApiSettingsModal";

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 15);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-200 ${
        scrolled
          ? "bg-[#F8F7F4]/95 backdrop-blur-md border-b-2 border-black py-2.5 shadow-[0_2px_0px_#000000]"
          : "bg-[#F8F7F4] border-b-2 border-black py-3.5"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between">
          {/* Brand Logo - Neo Brutalist Style */}
          <Link href="/" className="flex items-center gap-2 group">
            <div className="w-8 h-8 bg-[#FFC700] border-2 border-black flex items-center justify-center font-black text-black shadow-[2px_2px_0px_#000000] group-hover:translate-x-[1px] group-hover:translate-y-[1px] transition-transform">
              <Scissors className="w-4 h-4 stroke-[3]" />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="font-black text-xl tracking-tighter text-black uppercase">
                OPUS<span className="bg-[#FFC700] px-1 py-0.2 border border-black ml-0.5">CLIP</span>
              </span>
            </div>
          </Link>

          {/* Desktop Nav Links - Clean & Minimal */}
          <nav className="hidden md:flex items-center gap-6">
            <Link
              href="/dashboard"
              className="text-xs font-black uppercase tracking-wider text-black hover:text-[#FF5500] transition-colors"
            >
              Dashboard
            </Link>
            <Link
              href="/editor"
              className="text-xs font-black uppercase tracking-wider text-black hover:text-[#FF5500] transition-colors"
            >
              Studio Editor
            </Link>
            <Link
              href="/schedule"
              className="text-xs font-black uppercase tracking-wider text-black hover:text-[#FF5500] transition-colors"
            >
              Scheduler
            </Link>
            <Link
              href="/brand-kit"
              className="text-xs font-black uppercase tracking-wider text-black hover:text-[#FF5500] transition-colors"
            >
              Brand Kit
            </Link>
          </nav>

          {/* Action Buttons */}
          <div className="hidden sm:flex items-center gap-3">
            <button
              onClick={() => setSettingsOpen(true)}
              className="neo-btn-white px-3 py-1.5 rounded-lg text-xs font-black uppercase flex items-center gap-1.5 cursor-pointer"
              title="Configure API Keys"
            >
              <Key className="w-3.5 h-3.5" />
              <span>Keys</span>
            </button>

            {/* Split Neo-Brutalist CTA Button */}
            <Link
              href="/dashboard"
              className="inline-flex items-stretch border-2 border-black rounded-lg overflow-hidden shadow-[3px_3px_0px_#000000] hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-[2px_2px_0px_#000000] transition-all group"
            >
              <span className="bg-[#FFC700] text-black font-black uppercase tracking-wider text-xs px-3.5 py-2 flex items-center">
                Launch Studio
              </span>
              <span className="bg-black text-white px-2.5 flex items-center justify-center group-hover:bg-[#FF5500] transition-colors">
                <ArrowRight className="w-3.5 h-3.5 stroke-[3]" />
              </span>
            </Link>
          </div>

          {/* Mobile menu trigger */}
          <div className="md:hidden flex items-center gap-2">
            <Link
              href="/dashboard"
              className="bg-[#FFC700] text-black border-2 border-black font-black uppercase text-xs px-2.5 py-1.5 rounded-lg shadow-[2px_2px_0px_#000000]"
            >
              Studio
            </Link>
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-1.5 border-2 border-black bg-white rounded-lg text-black shadow-[2px_2px_0px_#000000] cursor-pointer"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-[#F8F7F4] border-t-2 border-b-2 border-black px-4 py-4 space-y-3 shadow-[0_4px_0px_#000000]">
          <Link
            href="/dashboard"
            onClick={() => setMobileMenuOpen(false)}
            className="block py-2 text-xs font-black uppercase tracking-wider text-black border-b border-black/10"
          >
            Dashboard
          </Link>
          <Link
            href="/editor"
            onClick={() => setMobileMenuOpen(false)}
            className="block py-2 text-xs font-black uppercase tracking-wider text-black border-b border-black/10"
          >
            Studio Editor
          </Link>
          <Link
            href="/schedule"
            onClick={() => setMobileMenuOpen(false)}
            className="block py-2 text-xs font-black uppercase tracking-wider text-black border-b border-black/10"
          >
            Scheduler
          </Link>
          <Link
            href="/brand-kit"
            onClick={() => setMobileMenuOpen(false)}
            className="block py-2 text-xs font-black uppercase tracking-wider text-black border-b border-black/10"
          >
            Brand Kit
          </Link>

          <div className="pt-2 flex flex-col gap-2">
            <button
              onClick={() => {
                setMobileMenuOpen(false);
                setSettingsOpen(true);
              }}
              className="w-full neo-btn-white py-2 rounded-lg text-xs font-black uppercase flex items-center justify-center gap-1.5"
            >
              <Key className="w-3.5 h-3.5" />
              <span>Configure API Keys</span>
            </button>
            <Link
              href="/dashboard"
              onClick={() => setMobileMenuOpen(false)}
              className="w-full neo-btn-yellow py-2.5 rounded-lg text-center block text-xs font-black uppercase"
            >
              Start Clipping Now
            </Link>
          </div>
        </div>
      )}

      {/* API Keys Settings Modal */}
      <ApiSettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </header>
  );
}
