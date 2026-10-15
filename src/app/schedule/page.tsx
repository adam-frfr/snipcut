"use client";

import React, { useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Calendar as CalendarIcon,
  Clock,
  Sparkles,
  Share2,
  CheckCircle2,
  ArrowLeft,
  Flame,
  Plus,
  Send,
  Sliders,
} from "lucide-react";
import { MOCK_CLIPS } from "@/lib/mockData";
import confetti from "canvas-confetti";

function ScheduleContent() {
  const searchParams = useSearchParams();
  const clipId = searchParams.get("clip") || "clip-1";
  const clip = MOCK_CLIPS.find((c) => c.id === clipId) || MOCK_CLIPS[0];

  // Connected accounts state
  const [connected, setConnected] = useState({
    youtube: true,
    tiktok: true,
    instagram: true,
    linkedin: false,
    x: false,
  });

  const [scheduledPosts, setScheduledPosts] = useState([
    {
      id: "p-1",
      platform: "TikTok",
      time: "Today at 7:30 PM",
      title: "AGI isn't coming in 20 years, it's happening right now 🤯",
      status: "Scheduled",
      virality: 98,
    },
    {
      id: "p-2",
      platform: "YouTube Shorts",
      time: "Tomorrow at 11:00 AM",
      title: "The #1 Reason Why Small Businesses Go Broke 💸",
      status: "Scheduled",
      virality: 94,
    },
    {
      id: "p-3",
      platform: "Instagram Reels",
      time: "Friday at 6:00 PM",
      title: "Do this for 10 minutes every morning to fix your focus ☀️",
      status: "Scheduled",
      virality: 91,
    },
  ]);

  const [postTitle, setPostTitle] = useState(clip.title);
  const [postCaption, setPostCaption] = useState(
    "Sam Altman on the exponential compute curve and why waiting until 2030 will make your business obsolete. Thoughts on AGI timelines? 👇\n\n#ai #samaltman #tech #openai #artificialintelligence #shorts"
  );
  const [selectedTime, setSelectedTime] = useState("18:30");
  const [selectedDate, setSelectedDate] = useState("2026-10-16");

  const handleSchedule = (e: React.FormEvent) => {
    e.preventDefault();
    const newPost = {
      id: `p-${Date.now()}`,
      platform: connected.tiktok ? "TikTok & Shorts" : "YouTube Shorts",
      time: `${selectedDate} at ${selectedTime}`,
      title: postTitle,
      status: "Scheduled",
      virality: clip.viralityScore,
    };
    setScheduledPosts([newPost, ...scheduledPosts]);
    try {
      confetti({
        particleCount: 70,
        spread: 60,
        origin: { y: 0.6 },
      });
    } catch (e) {}
    alert("Post successfully scheduled to connected social channels!");
  };

  return (
    <div className="min-h-screen bg-[#08090E] text-white">
      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-[#090A10]/90 backdrop-blur-xl border-b border-white/[0.08] px-4 sm:px-6 py-3">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="p-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-zinc-300 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-sm tracking-tight text-white">
                Social Media Auto-Scheduler
              </span>
              <span className="text-[10px] bg-pink-500/20 text-pink-300 px-2 py-0.5 rounded font-mono">
                1-Click Auto Post
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/dashboard"
              className="px-3.5 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-xs font-bold text-zinc-200 border border-white/[0.1]"
            >
              Back to Clips
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left: Schedule Form & Platform Toggles */}
          <div className="lg:col-span-7 space-y-6">
            {/* Connected Social Accounts */}
            <div className="glass-panel p-5 rounded-3xl border border-white/[0.08]">
              <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider block mb-3">
                Publishing Channels
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {[
                  { key: "youtube", name: "YouTube Shorts", icon: "▶" },
                  { key: "tiktok", name: "TikTok", icon: "♪" },
                  { key: "instagram", name: "Instagram Reels", icon: "📷" },
                  { key: "linkedin", name: "LinkedIn", icon: "in" },
                  { key: "x", name: "X / Twitter", icon: "𝕏" },
                ].map((item) => {
                  const isConn = (connected as any)[item.key];
                  return (
                    <button
                      key={item.key}
                      onClick={() =>
                        setConnected((prev) => ({
                          ...prev,
                          [item.key]: !isConn,
                        }))
                      }
                      className={`p-3 rounded-2xl border text-left transition-all flex items-center justify-between ${
                        isConn
                          ? "bg-purple-950/40 border-purple-500 text-white shadow-md ring-1 ring-purple-500"
                          : "bg-white/[0.02] border-white/[0.08] text-zinc-500 hover:bg-white/[0.05]"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-xs">{item.icon}</span>
                        <span className="text-xs font-bold">{item.name}</span>
                      </div>
                      {isConn && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Schedule Post Form */}
            <form onSubmit={handleSchedule} className="glass-panel p-6 rounded-3xl border border-white/[0.08] space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <CalendarIcon className="w-4 h-4 text-purple-400" />
                  <span>Schedule Post</span>
                </h3>
                <span className="text-[11px] font-bold text-purple-300 bg-purple-500/10 px-2 py-0.5 rounded border border-purple-500/20">
                  AI Viral Metadata
                </span>
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-400 block mb-1">
                  Post Title & Hook Headline
                </label>
                <input
                  type="text"
                  value={postTitle}
                  onChange={(e) => setPostTitle(e.target.value)}
                  className="w-full glass-input text-white text-xs sm:text-sm px-4 py-2.5 rounded-xl"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-zinc-400 block mb-1">
                  Description & Viral Hashtags
                </label>
                <textarea
                  rows={4}
                  value={postCaption}
                  onChange={(e) => setPostCaption(e.target.value)}
                  className="w-full glass-input text-white text-xs sm:text-sm px-4 py-2.5 rounded-xl leading-relaxed"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-zinc-400 block mb-1">
                    Posting Date
                  </label>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="w-full glass-input text-white text-xs px-3 py-2 rounded-xl"
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-zinc-400 block mb-1">
                    Posting Time (AI Peak: 18:30)
                  </label>
                  <input
                    type="time"
                    value={selectedTime}
                    onChange={(e) => setSelectedTime(e.target.value)}
                    className="w-full glass-input text-white text-xs px-3 py-2 rounded-xl"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full btn-primary-gradient py-3 rounded-xl font-bold text-white text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-purple-600/30"
              >
                <Send className="w-4 h-4" />
                <span>Confirm & Schedule Auto-Post</span>
              </button>
            </form>
          </div>

          {/* Right: Scheduled Queue & Calendar Stream */}
          <div className="lg:col-span-5 space-y-4">
            <div className="glass-panel p-5 rounded-3xl border border-white/[0.08]">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Scheduled Queue ({scheduledPosts.length})</span>
                </span>
                <span className="text-[11px] text-zinc-400">Auto Publishing Active</span>
              </div>

              <div className="space-y-3">
                {scheduledPosts.map((post) => (
                  <div
                    key={post.id}
                    className="p-3 rounded-2xl bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.05] transition-colors"
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 uppercase">
                        {post.platform}
                      </span>
                      <span className="text-[11px] text-zinc-400 font-mono">{post.time}</span>
                    </div>

                    <h5 className="text-xs font-bold text-white mb-2 truncate">{post.title}</h5>

                    <div className="flex items-center justify-between text-[11px] text-zinc-400">
                      <span className="flex items-center gap-1 text-emerald-400 font-bold">
                        <Flame className="w-3 h-3 fill-emerald-400" />
                        <span>{post.virality} Virality</span>
                      </span>
                      <span className="text-zinc-500 font-medium">Ready</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function SchedulePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#08090E] text-white p-8">Loading Scheduler...</div>}>
      <ScheduleContent />
    </Suspense>
  );
}
