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
  Video,
  Share2,
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
      title: "AGI is not coming in 20 years, it is happening right now",
      status: "Scheduled",
      virality: 98,
    },
    {
      id: "p-2",
      platform: "YouTube Shorts",
      time: "Tomorrow at 11:00 AM",
      title: "The Number 1 Reason Why Small Businesses Go Broke",
      status: "Scheduled",
      virality: 94,
    },
    {
      id: "p-3",
      platform: "Instagram Reels",
      time: "Friday at 6:00 PM",
      title: "Do this for 10 minutes every morning to fix your focus",
      status: "Scheduled",
      virality: 91,
    },
  ]);

  const [postTitle, setPostTitle] = useState(clip.title);
  const [postCaption, setPostCaption] = useState(
    "Sam Altman on the exponential compute curve and why waiting until 2030 will make your business obsolete. Thoughts on AGI timelines?\n\n#ai #samaltman #tech #openai #artificialintelligence #shorts"
  );
  const [selectedTime, setSelectedTime] = useState("18:30");
  const [selectedDate, setSelectedDate] = useState("2026-10-16");

  const handleSchedule = (e: React.FormEvent) => {
    e.preventDefault();
    const newPost = {
      id: `p-${Date.now()}`,
      platform: connected.tiktok ? "TikTok and Shorts" : "YouTube Shorts",
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
    alert("Post successfully scheduled to connected channels.");
  };

  return (
    <div className="min-h-screen bg-[#F8F7F4] text-black">
      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-[#F8F7F4] border-b-2 border-black px-4 sm:px-6 py-3.5">
        <div className="flex items-center justify-between max-w-6xl mx-auto">
          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="p-1.5 border-2 border-black bg-white hover:bg-[#FFC700] rounded-lg transition-colors"
            >
              <ArrowLeft className="w-4 h-4 stroke-[3]" />
            </Link>
            <div className="flex items-center gap-2">
              <span className="font-black text-sm uppercase tracking-tight text-black">
                Social Scheduler
              </span>
              <span className="neo-tag-yellow text-[10px]">
                Auto-Publish
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/dashboard"
              className="neo-btn-white px-3.5 py-1.5 rounded-lg text-xs font-black uppercase"
            >
              Back to Clips
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left: Schedule Form & Platform Toggles */}
          <div className="lg:col-span-7 space-y-6">
            {/* Connected Social Accounts */}
            <div className="bg-white border-2 border-black rounded-2xl p-6 shadow-[4px_4px_0px_#000000]">
              <label className="text-xs font-black uppercase tracking-wider block mb-3 text-black">
                Publishing Channels
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {[
                  { key: "youtube", name: "YouTube Shorts", code: "YT" },
                  { key: "tiktok", name: "TikTok", code: "TT" },
                  { key: "instagram", name: "Instagram Reels", code: "IG" },
                  { key: "linkedin", name: "LinkedIn", code: "IN" },
                  { key: "x", name: "X Twitter", code: "X" },
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
                      className={`p-3 border-2 border-black rounded-xl text-left transition-all flex items-center justify-between cursor-pointer ${
                        isConn
                          ? "bg-black text-white shadow-[2px_2px_0px_#FFC700]"
                          : "bg-[#F8F7F4] text-black hover:bg-white"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-black uppercase px-1 py-0.5 border ${isConn ? "bg-[#FFC700] text-black border-black" : "bg-white text-black border-black"}`}>
                          {item.code}
                        </span>
                        <span className="text-xs font-black uppercase">{item.name}</span>
                      </div>
                      {isConn && <CheckCircle2 className="w-3.5 h-3.5 text-[#FFC700]" />}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Schedule Post Form */}
            <form onSubmit={handleSchedule} className="bg-white border-2 border-black rounded-2xl p-6 shadow-[4px_4px_0px_#000000] space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black uppercase text-black flex items-center gap-2">
                  <CalendarIcon className="w-4 h-4 stroke-[3]" />
                  <span>Configure Schedule</span>
                </h3>
                <span className="neo-tag-yellow text-[10px]">
                  Metadata Sync
                </span>
              </div>

              <div>
                <label className="text-xs font-black uppercase text-black block mb-1">
                  Post Title & Headline
                </label>
                <input
                  type="text"
                  value={postTitle}
                  onChange={(e) => setPostTitle(e.target.value)}
                  className="w-full neo-input text-xs sm:text-sm px-3.5 py-2.5 font-bold"
                />
              </div>

              <div>
                <label className="text-xs font-black uppercase text-black block mb-1">
                  Caption & Hashtags
                </label>
                <textarea
                  rows={4}
                  value={postCaption}
                  onChange={(e) => setPostCaption(e.target.value)}
                  className="w-full neo-input text-xs sm:text-sm px-3.5 py-2.5 font-bold leading-relaxed"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-black uppercase text-black block mb-1">
                    Posting Date
                  </label>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => setSelectedDate(e.target.value)}
                    className="w-full neo-input text-xs px-3 py-2 font-bold"
                  />
                </div>
                <div>
                  <label className="text-xs font-black uppercase text-black block mb-1">
                    Posting Time
                  </label>
                  <input
                    type="time"
                    value={selectedTime}
                    onChange={(e) => setSelectedTime(e.target.value)}
                    className="w-full neo-input text-xs px-3 py-2 font-bold"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full neo-btn-yellow py-3 rounded-xl font-black uppercase text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer mt-2"
              >
                <Send className="w-4 h-4 stroke-[3]" />
                <span>Confirm and Schedule Post</span>
              </button>
            </form>
          </div>

          {/* Right: Scheduled Queue */}
          <div className="lg:col-span-5 space-y-4">
            <div className="bg-white border-2 border-black rounded-2xl p-6 shadow-[4px_4px_0px_#000000]">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-black uppercase tracking-wider text-black flex items-center gap-2">
                  <Clock className="w-4 h-4 stroke-[3]" />
                  <span>Scheduled Queue ({scheduledPosts.length})</span>
                </span>
                <span className="text-[10px] font-black uppercase bg-[#F8F7F4] border border-black px-2 py-0.5">
                  Active
                </span>
              </div>

              <div className="space-y-3">
                {scheduledPosts.map((post) => (
                  <div
                    key={post.id}
                    className="p-3.5 rounded-xl bg-[#F8F7F4] border-2 border-black hover:bg-white transition-colors"
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] font-black px-2 py-0.5 bg-black text-white uppercase">
                        {post.platform}
                      </span>
                      <span className="text-[11px] text-black font-mono font-bold">{post.time}</span>
                    </div>

                    <h5 className="text-xs font-black text-black mb-2 truncate">{post.title}</h5>

                    <div className="flex items-center justify-between text-[11px] font-black">
                      <span className="text-black uppercase">
                        Score: {post.virality}
                      </span>
                      <span className="text-black bg-[#FFC700] border border-black px-2 py-0.5 text-[9px] uppercase">
                        Queued
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
    <Suspense fallback={<div className="min-h-screen bg-[#F8F7F4] text-black p-8 font-black">Loading Scheduler...</div>}>
      <ScheduleContent />
    </Suspense>
  );
}
