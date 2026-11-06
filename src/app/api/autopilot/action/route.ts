import { NextRequest, NextResponse } from "next/server";
import { verifyAuthAndRateLimit } from "@/lib/authRateLimit";
import { addLog, loadState, updateState } from "@/lib/autopilot/store";
import { defaultDeps, nextSlot, stepClip, stepUpload, tick } from "@/lib/autopilot/engine";
import { disconnectYoutube, youtubeConnection } from "@/lib/autopilot/youtube";
import { normalizeYoutubeUrl } from "@/lib/mediaPrep";

/**
 * POST { action, id?, url?, title?, description? }
 *   run          — hunt + clip now (even when switched off)
 *   pause/resume
 *   add          — clip this YouTube link next
 *   approve / reject / edit / postNow / reschedule — one post
 *   retry        — a failed video
 *   disconnect   — forget the YouTube channel
 */
export async function POST(req: NextRequest) {
  const authError = verifyAuthAndRateLimit(req);
  if (authError) return authError;
  let b: any;
  try {
    b = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const action = String(b?.action || "");
  const id = String(b?.id || "");
  const now = Date.now();
  let error = "";

  switch (action) {
    case "run":
      // Don't block the request: hunting + AI ranking takes a few seconds.
      void tick(defaultDeps(), true);
      updateState((s) => addLog(s, "info", "Run started by you."));
      break;
    case "pause":
      updateState((s) => {
        s.paused = { at: now, reason: "Paused by you." };
        addLog(s, "info", "Paused.");
      });
      break;
    case "resume":
      updateState((s) => {
        s.paused = undefined;
        s.uploadFailStreak = 0;
        addLog(s, "info", "Resumed.");
      });
      break;
    case "add": {
      const url = normalizeYoutubeUrl(String(b?.url || ""));
      const vid = url && /[?&]v=([A-Za-z0-9_-]{6,})|youtu\.be\/([A-Za-z0-9_-]{6,})|shorts\/([A-Za-z0-9_-]{6,})/.exec(url);
      const videoId = vid ? vid[1] || vid[2] || vid[3] : "";
      if (!url || !videoId) {
        error = "Paste a YouTube video link.";
        break;
      }
      updateState((s) => {
        if (s.items.some((i) => i.id === videoId && ["found", "clipping"].includes(i.status))) return;
        if (!s.seen.includes(videoId)) s.seen.push(videoId);
        s.items.push({
          id: videoId, url, title: String(b?.title || url).slice(0, 200), channel: "", channelId: "",
          views: 0, durationSec: 0, publishedAt: "", reason: "added by you", source: "manual",
          status: "found", foundAt: now, updatedAt: now,
        });
        addLog(s, "info", `Added ${url} to the clipping queue.`);
      });
      void stepClip(defaultDeps(), true);
      break;
    }
    case "retry":
      updateState((s) => {
        const it = s.items.find((i) => i.id === id);
        if (it && it.status === "failed") {
          it.status = "found";
          it.error = undefined;
          it.jobId = undefined;
          it.updatedAt = now;
        }
      });
      break;
    case "approve":
    case "reject":
    case "edit":
    case "postNow":
    case "reschedule": {
      const st = loadState();
      const p = st.posts.find((x) => x.id === id);
      if (!p) {
        error = "That clip is gone.";
        break;
      }
      if (action === "approve" && p.status !== "pending") { error = "Already handled."; break; }
      if (action === "postNow" && !["pending", "approved", "failed"].includes(p.status)) { error = "Can't post this one now."; break; }
      if (action === "postNow" && !youtubeConnection().connected) { error = "Connect your YouTube channel first (YouTube channel card)."; break; }
      updateState((s) => {
        const q = s.posts.find((x) => x.id === id)!;
        if (action === "edit" || action === "approve" || action === "postNow") {
          if (typeof b?.title === "string" && b.title.trim()) q.title = b.title.trim().slice(0, 100);
          if (typeof b?.description === "string") q.description = b.description.slice(0, 4900);
        }
        if (action === "approve") {
          q.status = "approved";
          q.scheduledFor = nextSlot(s, now);
          addLog(s, "info", `Approved "${q.title}" for ${new Date(q.scheduledFor).toLocaleString()}.`);
        } else if (action === "reject") {
          q.status = "rejected";
          addLog(s, "info", `Rejected "${q.title}".`);
        } else if (action === "postNow") {
          q.status = "approved";
          q.attempts = 0;
          q.scheduledFor = now;
        } else if (action === "reschedule" && q.status === "approved") {
          q.scheduledFor = undefined; // free its slot before picking the next one
          q.scheduledFor = nextSlot(s, now);
        }
      });
      if (action === "postNow") {
        const ytId = await stepUpload(defaultDeps(), true);
        if (!ytId) {
          const after = loadState().posts.find((x) => x.id === id);
          error = after?.status === "posted" ? "" : after?.error || "Not posted: check that YouTube is connected and today's post cap isn't reached.";
        }
      }
      break;
    }
    case "disconnect":
      disconnectYoutube();
      updateState((s) => addLog(s, "info", "YouTube disconnected."));
      break;
    default:
      error = "Unknown action";
  }
  return NextResponse.json(error ? { ok: false, error } : { ok: true }, { status: error ? 400 : 200 });
}
