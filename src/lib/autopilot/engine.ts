import fs from "fs";
import path from "path";
import crypto from "crypto";
import { chatJson } from "../brollService";
import {
  AutopilotItem,
  AutopilotPost,
  AutopilotState,
  AutopilotSettings,
  CLIP_DIR,
  addLog,
  loadState,
  updateState,
} from "./store";
import { hunt as realHunt, Candidate } from "./trendHunter";
import { uploadVideo as realUpload, videoStatuses as realStatuses, youtubeConnection, UploadMeta } from "./youtube";

/**
 * The Autopilot loop (every 5 minutes, see startAutopilotTimer):
 *   1. hunt   — find new source videos (Trend Hunter) when it's time
 *   2. clip   — send the next found video through the normal job pipeline
 *   3. collect — finished job -> best clips above the score -> posts
 *               (inbox in "approve" mode, straight to the schedule in "auto")
 *   4. schedule + upload — approved posts get the next free time slot and
 *               are uploaded to the connected YouTube channel when due
 *   5. watch  — posted videos are re-checked; a copyright rejection pauses
 *               Autopilot
 * Every step is small and resumable: state lives in data/autopilot/state.json
 * and the job pipeline keeps its own records.
 */

export interface EngineDeps {
  now: () => number;
  hunt: (s: AutopilotSettings, seen: Set<string>, log: (l: "info" | "warn" | "error", m: string) => void) => Promise<Candidate[]>;
  createJob: (item: AutopilotItem, s: AutopilotSettings) => Promise<string>;
  getJob: (jobId: string) => Promise<any | null>;
  upload: (file: string, meta: UploadMeta) => Promise<string>;
  statuses: (ids: string[]) => Promise<Record<string, { uploadStatus?: string; rejectionReason?: string; privacyStatus?: string }>>;
  connected: () => boolean;
  writeMeta: (clip: any, item: AutopilotItem, s: AutopilotSettings) => Promise<{ title: string; description: string; tags: string[] }>;
}

const HOUR = 3600 * 1000;
const JOB_TIMEOUT = 4 * HOUR;

async function defaultCreateJob(item: AutopilotItem, s: AutopilotSettings): Promise<string> {
  // Lazy import: the job queue pulls in the whole render engine.
  const { saveJobRecord, jobQueue } = await import("../jobQueue");
  const r = s.recipe;
  const jobId = `job_${crypto.randomUUID()}`;
  saveJobRecord({
    id: jobId,
    status: "uploaded",
    progress: 5,
    stageMessage: "Autopilot: queued",
    error: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    options: {
      sourceType: "youtube",
      youtubeUrl: item.url,
      customPrompt: r.prompt || undefined,
      aspectRatio: "9:16",
      reframeMode: r.reframeMode,
      captionStyle: r.captionStyle as any,
      removeSilences: r.removeSilences,
      maxClipsToRender: Math.min(6, s.clipsPerVideo + 2),
      broll: r.broll,
      musicBed: r.musicBed,
      hookTitle: r.hookTitle,
      keywordHighlights: true,
      clipStyle: r.clipStyle,
      captionFont: r.captionFont || undefined,
      autopilot: true,
    },
    output: {},
    stageTimestamps: { uploaded: { start: Date.now(), end: Date.now() } },
  });
  jobQueue.enqueue(jobId);
  return jobId;
}

async function defaultGetJob(jobId: string): Promise<any | null> {
  const { getJobRecord } = await import("../jobQueue");
  return getJobRecord(jobId);
}

const hashtagify = (t: string) => "#" + t.replace(/[^A-Za-z0-9]/g, "").slice(0, 30);

/** Title / description / tags for a Short (AI, with a plain fallback). */
export async function defaultWriteMeta(clip: any, item: AutopilotItem, s: AutopilotSettings) {
  const hook = String(clip.hookHeadline || clip.title || item.title).replace(/\s+/g, " ").trim();
  const credit = `Original video: ${item.title} — ${item.channel}\n${item.url}`;
  const footer = s.descriptionFooter ? `\n\n${s.descriptionFooter}` : "";
  let title = hook;
  let blurb = String(clip.description || "").slice(0, 300);
  let tags: string[] = [];
  try {
    const raw = await chatJson(
      `Write YouTube Shorts metadata for this clip.
Clip hook: "${hook}"
What happens: "${String(clip.description || "").slice(0, 400)}"
From: "${item.title}" by ${item.channel}
Return ONLY JSON: {"title":"catchy title under 70 characters, no hashtags","blurb":"1-2 sentence description","tags":["5-8 short tags without #"]}`,
      { groqKey: process.env.GROQ_API_KEY }
    );
    const m = raw && raw.match(/\{[\s\S]*\}/);
    if (m) {
      const j = JSON.parse(m[0]);
      if (typeof j.title === "string" && j.title.trim()) title = j.title.trim();
      if (typeof j.blurb === "string" && j.blurb.trim()) blurb = j.blurb.trim();
      if (Array.isArray(j.tags)) tags = j.tags.map((t: any) => String(t).replace(/^#/, "").trim()).filter(Boolean).slice(0, 8);
    }
  } catch {}
  title = title.replace(/#\S+/g, "").replace(/\s+/g, " ").trim().slice(0, 88);
  if (!/#shorts/i.test(title)) title = `${title} #shorts`;
  if (!tags.length) tags = [item.channel, ...s.niches].filter(Boolean).slice(0, 6);
  const hashLine = ["shorts", ...tags].map(hashtagify).filter((h) => h.length > 1).slice(0, 6).join(" ");
  return { title, description: `${blurb}\n\n${credit}${footer}\n\n${hashLine}`.trim(), tags: ["shorts", ...tags] };
}

export function defaultDeps(): EngineDeps {
  return {
    now: () => Date.now(),
    hunt: realHunt,
    createJob: defaultCreateJob,
    getJob: defaultGetJob,
    upload: realUpload,
    statuses: realStatuses,
    connected: () => youtubeConnection().connected,
    writeMeta: defaultWriteMeta,
  };
}

// ---------------------------------------------------------------------------
// Scheduling
// ---------------------------------------------------------------------------

const dayKey = (t: number) => {
  const d = new Date(t);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
};

/** Next free upload slot: one of postTimes, at most dailyPostCap a day, never in the past. */
export function nextSlot(st: AutopilotState, now: number): number {
  const s = st.settings;
  const taken = st.posts.filter((p) => p.scheduledFor && ["approved", "uploading", "posted"].includes(p.status));
  for (let d = 0; d < 60; d++) {
    const base = new Date(now);
    base.setDate(base.getDate() + d);
    const perDay = taken.filter((p) => dayKey(p.status === "posted" ? p.postedAt || p.scheduledFor! : p.scheduledFor!) === dayKey(base.getTime())).length;
    if (perDay >= s.dailyPostCap) continue;
    for (const t of s.postTimes) {
      const [h, m] = t.split(":").map(Number);
      const slot = new Date(base);
      slot.setHours(h, m, 0, 0);
      const ts = slot.getTime();
      if (ts < now + 60 * 1000) continue;
      if (taken.some((p) => Math.abs((p.scheduledFor || 0) - ts) < 60 * 1000)) continue;
      return ts;
    }
  }
  return now + 24 * HOUR;
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

export async function stepHunt(deps: EngineDeps, force = false): Promise<number> {
  const st = loadState();
  const now = deps.now();
  const due = !st.lastHuntAt || now - st.lastHuntAt >= st.settings.huntEveryHours * HOUR;
  if (!force && (!st.settings.enabled || st.paused || !due)) return 0;
  if (!st.settings.niches.length && !st.settings.channels.length) {
    if (force) updateState((s) => addLog(s, "warn", "Add a niche or a channel to follow first."));
    return 0;
  }
  // Don't pile up work: wait until the found queue has drained.
  if (st.items.filter((i) => i.status === "found" || i.status === "clipping").length >= st.settings.videosPerHunt) {
    if (force) updateState((s) => addLog(s, "info", "Still clipping the last finds — new hunt after those."));
    return 0;
  }
  updateState((s) => { s.lastHuntAt = now; });
  const logs: [("info" | "warn" | "error"), string][] = [];
  let picks: Candidate[] = [];
  try {
    picks = await deps.hunt(st.settings, new Set(st.seen), (l, m) => logs.push([l, m]));
  } catch (e: any) {
    logs.push(["error", `Hunt failed: ${e?.message || e}`]);
  }
  updateState((s) => {
    for (const [l, m] of logs) addLog(s, l, m);
    for (const c of picks) {
      if (s.seen.includes(c.id)) continue;
      s.seen.push(c.id);
      s.items.push({
        id: c.id, url: c.url, title: c.title, channel: c.channel, channelId: c.channelId,
        views: c.views, durationSec: c.durationSec, publishedAt: c.publishedAt,
        reason: c.reason || "", source: c.source, status: "found", foundAt: now, updatedAt: now,
      });
      addLog(s, "info", `Picked "${c.title}" (${c.channel}) — ${c.reason || "trending"}`);
    }
  });
  return picks.length;
}

/** Start the next found video (one Autopilot job at a time). */
let clipLock = false;

export async function stepClip(deps: EngineDeps, force = false): Promise<string | null> {
  if (clipLock) return null; // a manual "add" and the timer must not start the same video twice
  clipLock = true;
  try {
    return await startNextClip(deps, force);
  } finally {
    clipLock = false;
  }
}

async function startNextClip(deps: EngineDeps, force: boolean): Promise<string | null> {
  const st = loadState();
  if (!force && (!st.settings.enabled || st.paused)) return null;
  if (st.items.some((i) => i.status === "clipping")) return null;
  const next = st.items.find((i) => i.status === "found");
  if (!next) return null;
  let jobId: string;
  try {
    jobId = await deps.createJob(next, st.settings);
  } catch (e: any) {
    updateState((s) => {
      const it = s.items.find((i) => i.id === next.id);
      if (it) { it.status = "failed"; it.error = String(e?.message || e); it.updatedAt = deps.now(); }
      addLog(s, "error", `Couldn't start clipping "${next.title}": ${e?.message || e}`);
    });
    return null;
  }
  updateState((s) => {
    const it = s.items.find((i) => i.id === next.id);
    if (it) { it.status = "clipping"; it.jobId = jobId; it.updatedAt = deps.now(); }
    addLog(s, "info", `Clipping "${next.title}"`);
  });
  return jobId;
}

/** Turn a finished job into posts. */
export async function stepCollect(deps: EngineDeps): Promise<number> {
  const st = loadState();
  const item = st.items.find((i) => i.status === "clipping" && i.jobId);
  if (!item) return 0;
  const job = await deps.getJob(item.jobId!);
  const now = deps.now();
  if (!job || job.status === "failed" || (job.status !== "done" && now - item.updatedAt > JOB_TIMEOUT)) {
    const err = job?.error || (job ? "took too long" : "job record missing");
    updateState((s) => {
      const it = s.items.find((i) => i.id === item.id);
      if (it) { it.status = "failed"; it.error = String(err).slice(0, 300); it.updatedAt = now; }
      addLog(s, "error", `Clipping "${item.title}" failed: ${String(err).slice(0, 200)}`);
      if (/sign in|bot|cookies|confirm you/i.test(String(err))) {
        addLog(s, "warn", "YouTube is blocking downloads from the server: save fresh YouTube cookies in API Keys.");
      }
    });
    return 0;
  }
  if (job.status !== "done") return 0;

  const s = st.settings;
  const rendered: any[] = (job.output?.renderedClips || []).slice();
  rendered.sort((a, b) => (b.viralityScore || 0) - (a.viralityScore || 0));
  const good = rendered.filter((c) => (c.viralityScore || 0) >= s.minScore).slice(0, s.clipsPerVideo);
  const best = rendered[0]?.viralityScore || 0;

  fs.mkdirSync(CLIP_DIR(), { recursive: true });
  const newPosts: AutopilotPost[] = [];
  for (const clip of good) {
    const src = path.join(process.cwd(), "public", "rendered_clips", String(clip.filename || ""));
    if (!clip.filename || !fs.existsSync(src)) continue;
    const id = `p_${crypto.randomBytes(6).toString("hex")}`;
    const file = `${id}.mp4`;
    fs.copyFileSync(src, path.join(CLIP_DIR(), file));
    let poster: string | undefined;
    const posterName = /rendered_clips\/([A-Za-z0-9._-]+\.(?:jpg|png))/.exec(String(clip.posterUrl || ""))?.[1];
    if (posterName && fs.existsSync(path.join(process.cwd(), "public", "rendered_clips", posterName))) {
      poster = `${id}.jpg`;
      fs.copyFileSync(path.join(process.cwd(), "public", "rendered_clips", posterName), path.join(CLIP_DIR(), poster));
    }
    const meta = await deps.writeMeta(clip, item, s);
    newPosts.push({
      id, itemId: item.id, jobId: item.jobId!, clipIndex: rendered.indexOf(clip), file, poster,
      duration: Number(clip.duration || 0), viralityScore: Number(clip.viralityScore || 0),
      title: meta.title, description: meta.description, tags: meta.tags,
      sourceTitle: item.title, sourceChannel: item.channel,
      status: s.mode === "auto" ? "approved" : "pending", attempts: 0, createdAt: now,
    });
  }
  updateState((st2) => {
    const it = st2.items.find((i) => i.id === item.id);
    if (it) { it.status = "done"; it.updatedAt = now; }
    for (const p of newPosts) {
      if (p.status === "approved") p.scheduledFor = nextSlot(st2, now);
      st2.posts.push(p);
    }
    if (newPosts.length) {
      addLog(st2, "info", `"${item.title}": ${newPosts.length} clip(s) ${s.mode === "auto" ? "scheduled" : "waiting for your approval"}.`);
    } else {
      addLog(st2, "info", `"${item.title}": no clip reached score ${s.minScore} (best ${best}), nothing posted.`);
    }
  });
  return newPosts.length;
}

/** Give approved posts a slot; upload the one that's due. */
export async function stepUpload(deps: EngineDeps, force = false): Promise<string | null> {
  const now = deps.now();
  updateState((s) => {
    for (const p of s.posts) if (p.status === "approved" && !p.scheduledFor) p.scheduledFor = nextSlot(s, now);
  });
  const st = loadState();
  if (!force && (!st.settings.enabled || st.paused)) return null;
  const due = st.posts
    .filter((p) => p.status === "approved" && (p.scheduledFor || 0) <= now)
    .sort((a, b) => (a.scheduledFor || 0) - (b.scheduledFor || 0))[0];
  if (!due) return null;
  if (!deps.connected()) {
    updateState((s) => {
      const recent = s.log.slice(-20).some((l) => l.msg.startsWith("A clip is due but YouTube"));
      if (!recent) addLog(s, "warn", "A clip is due but YouTube isn't connected: connect your channel on the Autopilot page.");
    });
    return null;
  }
  // Daily cap also guards uploads (manual "post now" included).
  const today = st.posts.filter((p) => p.status === "posted" && dayKey(p.postedAt || 0) === dayKey(now)).length;
  if (today >= st.settings.dailyPostCap) {
    updateState((s) => {
      const p = s.posts.find((x) => x.id === due.id);
      if (p) p.scheduledFor = nextSlot(s, now);
    });
    return null;
  }
  updateState((s) => {
    const p = s.posts.find((x) => x.id === due.id);
    if (p) p.status = "uploading";
  });
  const filePath = path.join(CLIP_DIR(), due.file);
  try {
    if (!fs.existsSync(filePath)) throw new Error("clip file is missing");
    const ytId = await deps.upload(filePath, { title: due.title, description: due.description, tags: due.tags, privacy: st.settings.privacy });
    updateState((s) => {
      const p = s.posts.find((x) => x.id === due.id);
      if (p) { p.status = "posted"; p.youtubeId = ytId; p.postedAt = deps.now(); p.error = undefined; }
      s.uploadFailStreak = 0;
      addLog(s, "info", `Posted "${due.title}" → https://youtube.com/shorts/${ytId}`);
    });
    try { fs.unlinkSync(filePath); } catch {}
    return ytId;
  } catch (e: any) {
    const reason = String(e?.reason || e?.message || e);
    updateState((s) => {
      const p = s.posts.find((x) => x.id === due.id);
      if (!p) return;
      p.error = reason.slice(0, 300);
      // YouTube's daily limit isn't the clip's fault: not counted as a try.
      if (/quotaExceeded|uploadLimitExceeded|rateLimitExceeded/i.test(reason)) {
        p.status = "approved";
        p.scheduledFor = now + 24 * HOUR;
        addLog(s, "warn", `YouTube upload limit reached; "${p.title}" moved to tomorrow.`);
        return;
      }
      if (/revoked|not connected|sign-in failed/i.test(reason)) {
        p.status = "approved";
        p.scheduledFor = now + HOUR;
        s.paused = { at: now, reason: "YouTube connection stopped working: connect the channel again, then resume." };
        addLog(s, "error", `Upload failed: ${reason}. Autopilot paused.`);
        return;
      }
      p.attempts++;
      p.status = p.attempts >= 3 ? "failed" : "approved";
      p.scheduledFor = now + 30 * 60 * 1000;
      s.uploadFailStreak = (s.uploadFailStreak || 0) + 1;
      addLog(s, "error", `Upload of "${p.title}" failed (try ${p.attempts}/3): ${reason}`);
      if (s.uploadFailStreak >= 3) {
        s.paused = { at: now, reason: `3 uploads in a row failed (last: ${reason.slice(0, 120)}).` };
        addLog(s, "error", "Autopilot paused after 3 failed uploads in a row.");
      }
    });
    return null;
  }
}

/** Re-check recent uploads; a copyright rejection / removal pauses Autopilot. */
export async function stepWatch(deps: EngineDeps): Promise<void> {
  const st = loadState();
  const now = deps.now();
  if (!deps.connected()) return;
  const recent = st.posts.filter(
    (p) => p.status === "posted" && p.youtubeId && now - (p.postedAt || 0) < 7 * 24 * HOUR && now - (p.lastCheckedAt || 0) >= HOUR
  );
  if (!recent.length) return;
  let res: Record<string, { uploadStatus?: string; rejectionReason?: string; privacyStatus?: string }>;
  try {
    res = await deps.statuses(recent.map((p) => p.youtubeId!));
  } catch {
    return;
  }
  updateState((s) => {
    for (const r of recent) {
      const p = s.posts.find((x) => x.id === r.id);
      if (!p) continue;
      p.lastCheckedAt = now;
      const v = res[p.youtubeId!];
      if (!v) {
        if (p.youtubeStatus !== "removed") {
          p.youtubeStatus = "removed";
          addLog(s, "warn", `"${p.title}" is no longer on YouTube (removed or deleted).`);
        }
        continue;
      }
      const bad = v.uploadStatus === "rejected" || v.uploadStatus === "deleted";
      const status = bad ? `${v.uploadStatus}${v.rejectionReason ? `: ${v.rejectionReason}` : ""}` : v.privacyStatus || v.uploadStatus || "";
      if (status && status !== p.youtubeStatus) {
        p.youtubeStatus = status;
        if (!bad && v.privacyStatus === "private" && s.settings.privacy !== "private") {
          addLog(s, "warn", `YouTube kept "${p.title}" private (normal until Google audits your API project): make it public in YouTube Studio.`);
        }
      }
      if (bad && /copyright|claim|trademark|termination/i.test(String(v.rejectionReason || "")) && !s.paused) {
        s.paused = { at: now, reason: `YouTube rejected "${p.title}" for ${v.rejectionReason}. Check your sources before resuming.` };
        addLog(s, "error", `Copyright problem on "${p.title}" (${v.rejectionReason}). Autopilot paused to protect the channel.`);
      }
    }
  });
}

/** Unapproved posts expire after 7 days; finished post files are removed. */
export function stepTidy(deps: EngineDeps): void {
  const now = deps.now();
  const remove: string[] = [];
  updateState((s) => {
    for (const p of s.posts) {
      if (p.status === "pending" && now - p.createdAt > 7 * 24 * HOUR) {
        p.status = "rejected";
        p.error = "not approved within 7 days";
      }
      if (["rejected", "failed", "posted"].includes(p.status)) {
        remove.push(p.file);
        if (p.poster) remove.push(p.poster);
      }
    }
  });
  for (const f of remove) {
    try { fs.unlinkSync(path.join(CLIP_DIR(), f)); } catch {}
  }
}

let running = false;

/** One pass of everything. Never throws. */
export async function tick(deps: EngineDeps = defaultDeps(), force = false): Promise<void> {
  if (running) return;
  running = true;
  try {
    await stepCollect(deps);
    await stepHunt(deps, force);
    await stepClip(deps, force);
    await stepUpload(deps);
    await stepWatch(deps);
    stepTidy(deps);
  } catch (e: any) {
    try { updateState((s) => addLog(s, "error", `Autopilot error: ${e?.message || e}`)); } catch {}
  } finally {
    running = false;
  }
}

export function startAutopilotTimer(): void {
  const g = globalThis as unknown as { __snipcutAutopilot?: boolean };
  if (g.__snipcutAutopilot) return;
  g.__snipcutAutopilot = true;
  setTimeout(() => void tick(), 90 * 1000).unref?.();
  setInterval(() => void tick(), 5 * 60 * 1000).unref?.();
}
