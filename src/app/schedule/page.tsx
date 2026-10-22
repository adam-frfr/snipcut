"use client";

import React, { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Calendar as CalendarIcon,
  Clock,
  CheckCircle2,
  ArrowLeft,
  Send,
  Scissors,
} from "lucide-react";
import confetti from "canvas-confetti";

/**
 * Social Scheduler — works on the user's REAL generated clips
 * (localStorage "opus_user_clips", written by the dashboard).
 * Scheduled entries are kept locally ("opus_scheduled_posts") and shown
 * in the queue; there is no posting integration behind this page, so the
 * copy says "saved to your queue" rather than claiming a publish.
 */

interface SchedPost {
  id: string;
  platform: string;
  time: string;
  title: string;
  status: string;
  virality: number;
}

function todayStr(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function ScheduleContent() {
  const searchParams = useSearchParams();
  const wantedClipId = searchParams.get("clip") || searchParams.get("clipId") || "";

  const [allClips, setAllClips] = useState<any[]>([]);
  const [clip, setClip] = useState<any>(null);
  const [loaded, setLoaded] = useState(false);

  // Connected accounts state (local preferences only)
  const [connected, setConnected] = useState({
    youtube: true,
    tiktok: true,
    instagram: true,
    linkedin: false,
    x: false,
  });

  const [scheduledPosts, setScheduledPosts] = useState<SchedPost[]>([]);

  const [postTitle, setPostTitle] = useState("");
  const [postCaption, setPostCaption] = useState("");
  const [savedMsg, setSavedMsg] = useState(false);
  const [selectedTime, setSelectedTime] = useState("18:30");
  const [selectedDate, setSelectedDate] = useState(todayStr());

  // Load the user's real clips + their saved queue
  useEffect(() => {
    let clips: any[] = [];
    try {
      const saved = localStorage.getItem("opus_user_clips");
      if (saved) {
        const arr = JSON.parse(saved);
        if (Array.isArray(arr)) clips = arr;
      }
    } catch {}
    setAllClips(clips);
    const found = clips.find((c: any) => c.id === wantedClipId) || clips[0] || null;
    if (found) {
      setClip(found);
      setPostTitle(found.title || "");
      setPostCaption(
        found.description ||
          `${found.hookHeadline || found.title || ""}\n\n#shorts #viral #fyp`
      );
    }
    try {
      const savedPosts = localStorage.getItem("opus_scheduled_posts");
      if (savedPosts) {
        const arr = JSON.parse(savedPosts);
        if (Array.isArray(arr)) setScheduledPosts(arr);
      }
    } catch {}
    setLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantedClipId]);

  const pickClip = (c: any) => {
    setClip(c);
    setPostTitle(c.title || "");
    setPostCaption(
      c.description || `${c.hookHeadline || c.title || ""}\n\n#shorts #viral #fyp`
    );
  };

  const handleSchedule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!clip) return;
    const platforms = [
      connected.youtube && "YouTube Shorts",
      connected.tiktok && "TikTok",
      connected.instagram && "Instagram Reels",
      connected.linkedin && "LinkedIn",
      connected.x && "X Twitter",
    ].filter(Boolean) as string[];
    const newPost: SchedPost = {
      id: `p-${Date.now()}`,
      platform: platforms.length ? platforms.join(" + ") : "YouTube Shorts",
      time: `${selectedDate} at ${selectedTime}`,
      title: postTitle,
      status: "Scheduled",
      virality: clip.viralityScore || 0,
    };
    const next = [newPost, ...scheduledPosts];
    setScheduledPosts(next);
    try {
      localStorage.setItem("opus_scheduled_posts", JSON.stringify(next));
    } catch {}
    try {
      confetti({
        particleCount: 70,
        spread: 60,
        origin: { y: 0.6 },
      });
    } catch (e) {}
    setSavedMsg(true);
    window.setTimeout(() => setSavedMsg(false), 3500);
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
                Queue
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
        {loaded && !clip ? (
          <div className="bg-white border-2 border-black shadow-[6px_6px_0px_#000000] p-8 max-w-md mx-auto text-center">
            <Scissors className="w-8 h-8 mx-auto mb-3" />
            <h1 className="font-black uppercase text-lg mb-2">No clips to schedule yet</h1>
            <p className="text-sm font-medium text-neutral-600 mb-5">
              The scheduler works on clips you've generated. Run a video through the pipeline on the dashboard first — then pick it here and queue it up.
            </p>
            <Link href="/dashboard" className="inline-block px-4 py-2.5 bg-[#FFC700] border-2 border-black font-black text-xs uppercase shadow-[3px_3px_0px_#000000]">
              Go to Dashboard
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left: Schedule Form & Platform Toggles */}
            <div className="lg:col-span-7 space-y-6">
              {/* Clip picker */}
              <div className="bg-white border-2 border-black rounded-2xl p-6 shadow-[4px_4px_0px_#000000]">
                <label className="text-xs font-black uppercase tracking-wider block mb-2 text-black">
                  Clip to schedule
                </label>
                <select
                  value={clip?.id || ""}
                  onChange={(e) => {
                    const next = allClips.find((c: any) => c.id === e.target.value);
                    if (next) pickClip(next);
                  }}
                  className="w-full neo-input py-2.5 px-3 text-base sm:text-sm font-bold"
                >
                  {allClips.map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
                {clip && typeof clip.viralityScore === "number" && (
                  <p className="text-[11px] font-bold text-neutral-500 mt-2">
                    Virality score {clip.viralityScore} · {clip.duration ? `${Math.round(clip.duration)}s` : ""}
                  </p>
                )}
              </div>

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
                        type="button"
                        onClick={() =>
                          setConnected((prev) => ({
                            ...prev,
                            [item.key]: !isConn,
                          }))
                        }
                        className={`p-3 border-2 border-black rounded-xl text-left transition-all flex items-center justify-between gap-1 cursor-pointer ${
                          isConn
                            ? "bg-black text-white shadow-[2px_2px_0px_#FFC700]"
                            : "bg-[#F8F7F4] text-black hover:bg-white"
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className={`text-[10px] font-black uppercase px-1 py-0.5 border shrink-0 ${isConn ? "bg-[#FFC700] text-black border-black" : "bg-white text-black border-black"}`}>
                            {item.code}
                          </span>
                          <span className="text-xs font-black uppercase leading-tight">{item.name}</span>
                        </div>
                        {isConn && <CheckCircle2 className="w-3.5 h-3.5 text-[#FFC700] shrink-0" />}
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
                    className="w-full neo-input text-base sm:text-sm px-3.5 py-2.5 font-bold"
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
                    className="w-full neo-input text-base sm:text-sm px-3.5 py-2.5 font-bold leading-relaxed"
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
                      className="w-full neo-input text-base sm:text-xs px-3 py-2 font-bold"
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
                      className="w-full neo-input text-base sm:text-xs px-3 py-2 font-bold"
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
                {savedMsg && (
                  <p className="text-xs font-black uppercase text-green-700 flex items-center gap-1.5 pt-1">
                    <CheckCircle2 className="w-4 h-4" /> Saved to your schedule queue
                  </p>
                )}
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
                    Local
                  </span>
                </div>

                <div className="space-y-3">
                  {scheduledPosts.length === 0 && (
                    <p className="text-xs font-bold text-neutral-500 leading-relaxed">
                      Nothing queued yet. Pick a clip, set a date and time, and confirm — your queue is saved on this device.
                    </p>
                  )}
                  {scheduledPosts.map((post) => (
                    <div
                      key={post.id}
                      className="p-3.5 rounded-xl bg-[#F8F7F4] border-2 border-black hover:bg-white transition-colors"
                    >
                      <div className="flex items-center justify-between gap-2 mb-1.5">
                        <span className="text-[10px] font-black px-2 py-0.5 bg-black text-white uppercase truncate">
                          {post.platform}
                        </span>
                        <span className="text-[11px] text-black font-mono font-bold whitespace-nowrap">{post.time}</span>
                      </div>

                      <h5 className="text-xs font-black text-black mb-2 truncate">{post.title}</h5>

                      <div className="flex items-center justify-between text-[11px] font-black">
                        <span className="text-black uppercase">
                          {post.virality > 0 ? `Score: ${post.virality}` : ""}
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
        )}
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
