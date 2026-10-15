"use client";

import React, { useState } from "react";
import Link from "next/link";
import {
  Wand2,
  TrendingUp,
  Video,
  Type,
  Layers,
  Calendar,
  VolumeX,
  Palette,
  ArrowRight,
  CheckCircle2,
  Sparkles,
  Bot,
  Zap,
} from "lucide-react";

export default function FeaturesSection() {
  const [activeTab, setActiveTab] = useState(0);

  const features = [
    {
      id: "clip-anything",
      tag: "FLAGSHIP AI",
      icon: Wand2,
      color: "from-purple-500 to-indigo-600",
      accent: "text-purple-400",
      title: "ClipAnything™: Prompt with Natural Language",
      description:
        "Don't just let an algorithm guess blindly. Prompt OpusClip with plain English to find exact scenes, emotional arguments, or specific topics across hours of video.",
      bullets: [
        "Multimodal visual, audio, sentiment, and narrative comprehension",
        "Type 'Find moments about AI compute clusters' or 'Extract the closing advice'",
        "Handles talking-head podcasts, vlogs, sports, commentary, and gaming",
      ],
      previewImg:
        "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800&auto=format&fit=crop&q=80",
      stats: "10x Faster scene discovery",
    },
    {
      id: "virality-score",
      tag: "AI ALGORITHM",
      icon: TrendingUp,
      color: "from-emerald-500 to-teal-600",
      accent: "text-emerald-400",
      title: "AI Virality Score™: Know What Hits Before Posting",
      description:
        "Trained on 500,000+ top-performing shorts across TikTok, YouTube, and Instagram. Every clip gets a 0–100 score analyzing hook strength, narrative retention, and pacing.",
      bullets: [
        "Instant breakdown of Hook Quality, Pacing, and Trend Relevance",
        "AI reasoning explaining exactly why the clip is primed to convert",
        "Save 15+ hours of guessing which video to upload first",
      ],
      previewImg:
        "https://images.unsplash.com/photo-1551836022-d5d88e9218df?w=800&auto=format&fit=crop&q=80",
      stats: "98% Correlation with viral reach",
    },
    {
      id: "reframe-anything",
      tag: "COMPUTER VISION",
      icon: Video,
      color: "from-cyan-500 to-blue-600",
      accent: "text-cyan-400",
      title: "Active Speaker Detection & Auto Reframe",
      description:
        "Automatically identifies who is talking in landscape 16:9 videos and keeps their face centered in vertical 9:16. Switches to split-screen when two people converse.",
      bullets: [
        "Smart face & speaker tracking keeps eyes on the action",
        "Dynamic multi-speaker layout for 2-person podcast discussions",
        "1-click layout toggle: Single-focus, Split-screen, or Blurred background fit",
      ],
      previewImg:
        "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800&auto=format&fit=crop&q=80",
      stats: "100% Automated 9:16 framing",
    },
    {
      id: "dynamic-captions",
      tag: "VIRAL CAPTIONS",
      icon: Type,
      color: "from-amber-500 to-orange-600",
      accent: "text-amber-400",
      title: "Word-by-Word Dynamic Captions & Auto-Emojis",
      description:
        "97%+ accurate speech-to-text with animated karaoke word highlighting. Injects context-relevant emojis automatically to skyrocket viewer retention.",
      bullets: [
        "Presets: Alex Hormozi punch, Cyberpunk Neon, MrBeast, Minimal Clean",
        "Auto-highlights crucial keywords in contrasting colors",
        "Full support for 30+ global languages with zero transcription errors",
      ],
      previewImg:
        "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=800&auto=format&fit=crop&q=80",
      stats: "+65% Average watch-time boost",
    },
    {
      id: "ai-b-roll",
      tag: "RETENTION ENGINE",
      icon: Layers,
      color: "from-pink-500 to-rose-600",
      accent: "text-pink-400",
      title: "Contextual AI B-Roll & Visual Cutaways",
      description:
        "Eliminate boring talking heads. OpusClip automatically understands what the speaker is discussing and injects relevant stock footage, B-roll, and images at the exact timestamp.",
      bullets: [
        "High-definition royalty-free stock videos and images matched by AI",
        "Prevents audience drop-off during long explanations",
        "Easily replace or re-time any B-roll in our built-in timeline editor",
      ],
      previewImg:
        "https://images.unsplash.com/photo-1579783902614-a3fb3927b675?w=800&auto=format&fit=crop&q=80",
      stats: "3x Higher retention through cutaways",
    },
    {
      id: "social-scheduler",
      tag: "AUTO PUBLISHING",
      icon: Calendar,
      color: "from-violet-500 to-purple-600",
      accent: "text-violet-400",
      title: "1-Click Social Media Scheduler & Auto-Post",
      description:
        "Directly connect your TikTok, YouTube Shorts, Instagram Reels, and LinkedIn accounts. Schedule a month worth of clips in less than 5 minutes.",
      bullets: [
        "AI generates optimized viral titles, hooks, and hashtags for each platform",
        "Best-time-to-post AI recommendations based on your audience timezone",
        "Set and forget your social media distribution pipeline",
      ],
      previewImg:
        "https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=800&auto=format&fit=crop&q=80",
      stats: "Publish to 4 platforms simultaneously",
    },
    {
      id: "filler-removal",
      tag: "AUDIO CLEANUP",
      icon: VolumeX,
      color: "from-red-500 to-rose-600",
      accent: "text-red-400",
      title: "Filler Words & Awkward Silence Cutter",
      description:
        "Automatically strips out 'um', 'uh', repetitive phrases, throat clears, and dead silence over 0.5s to make the speaker sound 10x more articulate and punchy.",
      bullets: [
        "Zero awkward speech gaps or dead pauses",
        "Detects false starts, coughs, and retakes automatically",
        "Voice leveling and studio-grade background noise reduction",
      ],
      previewImg:
        "https://images.unsplash.com/photo-1590602847861-f357a9332bbc?w=800&auto=format&fit=crop&q=80",
      stats: "Average 18% runtime trimmed cleanly",
    },
    {
      id: "brand-kit",
      tag: "CUSTOM BRANDING",
      icon: Palette,
      color: "from-amber-400 to-yellow-600",
      accent: "text-amber-400",
      title: "Brand Kit, Watermarks & Outro Bumpers",
      description:
        "Keep your brand consistent. Store your logo, custom font typography, brand color hex codes, intro sound effects, and custom call-to-action outro bumpers.",
      bullets: [
        "Upload your custom TTF/OTF fonts or pick from Google Fonts",
        "Add subtle semi-transparent watermark logos in any corner",
        "Attach branded outro cards prompting viewers to subscribe",
      ],
      previewImg:
        "https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=800&auto=format&fit=crop&q=80",
      stats: "Unified creator brand identity",
    },
  ];

  return (
    <section id="how-it-works" className="py-24 relative overflow-hidden bg-[#08090E]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-xs font-semibold text-purple-300 mb-4">
            <Zap className="w-3.5 h-3.5 text-amber-300" />
            <span>Complete Feature Suite</span>
          </div>
          <h2 className="text-3xl sm:text-5xl font-extrabold text-white tracking-tight">
            Every Feature You Need to <span className="gradient-text-purple">Dominate Short-Form</span>
          </h2>
          <p className="mt-4 text-zinc-400 text-base sm:text-lg">
            Everything built into Opus.pro is designed to turn hours of long video into an automated machine for viral social clips.
          </p>
        </div>

        {/* Feature Grid / Interactive Showcase */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((item, idx) => {
            const Icon = item.icon;
            return (
              <div
                key={item.id}
                className="glass-panel p-6 rounded-3xl border border-white/[0.08] hover:border-purple-500/40 transition-all duration-300 group hover:-translate-y-1 relative flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <div className={`p-3 rounded-2xl bg-gradient-to-tr ${item.color} text-white shadow-lg`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/[0.06] text-zinc-300 border border-white/[0.08]">
                      {item.tag}
                    </span>
                  </div>

                  <h3 className="text-lg font-bold text-white mb-2 group-hover:text-purple-300 transition-colors">
                    {item.title}
                  </h3>

                  <p className="text-xs text-zinc-400 leading-relaxed mb-4">
                    {item.description}
                  </p>

                  <ul className="space-y-2 mb-4">
                    {item.bullets.slice(0, 2).map((bullet, bIdx) => (
                      <li key={bIdx} className="text-[11px] text-zinc-300 flex items-start gap-1.5">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0 mt-0.5" />
                        <span>{bullet}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="pt-3 border-t border-white/[0.06] flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-purple-400">{item.stats}</span>
                  <Link
                    href="/dashboard"
                    className="text-xs font-bold text-white hover:text-purple-300 flex items-center gap-1 group-hover:translate-x-0.5 transition-transform"
                  >
                    Try it <ArrowRight className="w-3.5 h-3.5" />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>

        {/* CTA Banner */}
        <div className="mt-16 rounded-3xl glass-panel-glow p-8 md:p-12 text-center relative overflow-hidden border border-purple-500/30">
          <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-purple-600/20 blur-3xl rounded-full" />
          <h3 className="text-2xl sm:text-4xl font-extrabold text-white mb-4">
            Ready to generate your first 10 viral clips?
          </h3>
          <p className="text-zinc-300 text-sm sm:text-base max-w-xl mx-auto mb-8">
            Upload your podcast or video link now and get 90 free processing minutes immediately.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/dashboard"
              className="btn-primary-gradient px-8 py-3.5 rounded-2xl font-bold text-white text-base shadow-xl flex items-center gap-2 cursor-pointer"
            >
              <Sparkles className="w-5 h-5 text-amber-300" />
              <span>Generate Clips Now Free</span>
            </Link>
            <Link
              href="/editor"
              className="px-6 py-3.5 rounded-2xl font-bold text-zinc-200 hover:text-white bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.1] text-base"
            >
              Open Studio Editor
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
