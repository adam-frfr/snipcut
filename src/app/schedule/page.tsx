"use client";

import React, { useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Calendar as CalendarIcon,
  Clock,
  CheckCircle2,
  ArrowLeft,
  Flame,
  Send,
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
    <div className="min-h-screen bg-[#F5EFEB] text-[#2B1D16]">
      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-[#FAF6F1]/90 backdrop-blur-xl border-b border-[#E8DDD2] px-4 sm:px-6 py-3.5">
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard"
              className="p-2 rounded-xl bg-white border border-[#E8DDD2] text-[#2B1D16] hover:bg-[#EAE1D7] transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>
            <div className="flex items-center gap-2.5">
              <span className="font-black text-sm sm:text-base tracking-tight text-[#2B1D16]">
                Social Media Auto-Scheduler
              </span>
              <span className="text-[11px] bg-[#EAE1D7] text-[#2B1D16] px-2.5 py-0.5 rounded-full font-bold">
                1-Click Auto Post
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/dashboard"
              className="px-4 py-2 rounded-xl bg-white hover:bg-[#EAE1D7] text-xs font-bold text-[#2B1D16] border border-[#E8DDD2] transition-colors"
            >
              Back to Clips
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left: Schedule Form & Platform Toggles */}
          <div className="lg:col-span-7 space-y-6">
            {/* Connected Social Accounts */}
            <div className="warm-card p-6 rounded-[28px] border border-[#E8DDD2]">
              <label className="text-xs font-black text-[#7A6B63] uppercase tracking-wider block mb-3.5">
                Publishing Channels
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
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
                      className={`p-3.5 rounded-2xl border text-left transition-all flex items-center justify-between cursor-pointer ${
                        isConn
                          ? "bg-[#2B1D16] border-[#2B1D16] text-white shadow-sm"
                          : "bg-[#FAF6F1] border-[#E8DDD2] text-[#7A6B63] hover:bg-[#EAE1D7]"
                      }`}
                    >
                      <div className="flex items-center gap-2.5">
                        <span className="font-black text-xs">{item.icon}</span>
                        <span className="text-xs font-bold">{item.name}</span>
                      </div>
                      {isConn && <CheckCircle2 className="w-4 h-4 text-[#C87A47]" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Schedule Post Form */}
            <form onSubmit={handleSchedule} className="warm-card p-6 rounded-[28px] border border-[#E8DDD2] space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-black text-[#2B1D16] flex items-center gap-2">
                  <CalendarIcon className="w-4 h-4 text-[#C87A47]" />
                  <span>Schedule Post</span>
                </h3>
                <span className="text-[11px] font-bold text-[#C87A47] bg-[#C87A47]/10 px-2.5 py-0.5 rounded-full border border-[#C87A47]/20">
                  AI Viral Metadata
                </span>
              </div>

              <div>
                <label className="text-xs font-bold text-[#7A6B63] block mb-1.5">
                  Post Title & Hook Headline
                </label>
                <input
                  type="text"
                  value={postTitle}
                  onChange={(e) => setPostTitle(e.target.value)}
                  className="w-full warm-input text-[#2B1D16] font-bold text-xs sm:text-sm px-4 py-3 rounded-2xl"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-[#7A6B63] block mb-1.5">
                  Description & Viral Hashtags
                </label>
                <textarea
                  rows={4}
                  value={postCaption}
                  onChange={(e) => setPostCaption(e.target.value)}
                  className="w-full warm-input text-[#2B1D16] text-xs sm:text-sm px-4 py-3 rounded-2xl leading-relaxed"
                />
              </div>

              <div className="grid grid-cols-2 gap-3.5">
                <div>
                  <label className="text-xs font-bold text-[#7A6B63] block mb-1.5">
                    Posting Date
                  </label>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="w-full warm-input text-[#2B1D16] font-semibold text-xs px-3.5 py-2.5 rounded-2xl"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-[#7A6B63] block mb-1.5">
                    Posting Time (AI Peak: 18:30)
                  </label>
                  <input
                    type="time"
                    value={selectedTime}
                    onChange={(e) => setSelectedTime(e.target.value)}
                    className="w-full warm-input text-[#2B1D16] font-semibold text-xs px-3.5 py-2.5 rounded-2xl"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full warm-btn-terracotta py-3.5 rounded-2xl font-bold text-white text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer shadow-sm transition-all"
              >
                <Send className="w-4 h-4" />
                <span>Confirm & Schedule Auto-Post</span>
              </button>
            </form>
          </div>

          {/* Right: Scheduled Queue & Calendar Stream */}
          <div className="lg:col-span-5 space-y-4">
            <div className="warm-card p-6 rounded-[28px] border border-[#E8DDD2]">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-black text-[#2B1D16] uppercase tracking-wider flex items-center gap-2">
                  <Clock className="w-4 h-4 text-[#C87A47]" />
                  <span>Scheduled Queue ({scheduledPosts.length})</span>
                </span>
                <span className="text-[11px] text-[#7A6B63] font-bold">Auto Publishing Active</span>
              </div>

              <div className="space-y-3">
                {scheduledPosts.map((post) => (
                  <div
                    key={post.id}
                    className="p-4 rounded-2xl bg-[#FAF6F1] border border-[#E8DDD2] hover:bg-[#EAE1D7] transition-colors"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-[#EAE1D7] text-[#2B1D16] uppercase">
                        {post.platform}
                      </span>
                      <span className="text-[11px] text-[#7A6B63] font-mono font-medium">{post.time}</span>
                    </div>

                    <h5 className="text-xs font-bold text-[#2B1D16] mb-2.5 truncate">{post.title}</h5>

                    <div className="flex items-center justify-between text-[11px] text-[#7A6B63]">
                      <span className="flex items-center gap-1.5 text-[#C87A47] font-bold">
                        <Flame className="w-3.5 h-3.5 fill-[#C87A47]" />
                        <span>{post.virality} Virality Score</span>
                      </span>
                      <span className="text-[#3A7D44] font-bold bg-[#3A7D44]/10 px-2 py-0.5 rounded-full">
                        Ready
                      </span>
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
    <Suspense fallback={<div className="min-h-screen bg-[#F5EFEB] text-[#2B1D16] p-8">Loading Scheduler...</div>}>
      <ScheduleContent />
    </Suspense>
  );
}
