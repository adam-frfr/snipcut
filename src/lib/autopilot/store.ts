import fs from "fs";
import path from "path";
import { normalizeClipStyle, ClipStyle } from "../clipStyle";
import { CAPTION_FONTS } from "../videoService";

/**
 * Autopilot state: settings, the videos it found, the clips waiting to be
 * posted and a short activity log. One JSON file under data/autopilot
 * (never served, never swept by the 24h cleanup).
 */

export type AutopilotMode = "approve" | "auto";
export type Privacy = "public" | "unlisted" | "private";

export interface AutopilotRecipe {
  prompt: string;
  captionStyle: string;
  reframeMode: "auto-tracker" | "split-screen" | "blurred-fit" | "center";
  removeSilences: boolean;
  broll: boolean;
  musicBed: boolean;
  hookTitle: boolean;
  captionFont: string;
  clipStyle: Partial<ClipStyle>;
}

export interface AutopilotSettings {
  enabled: boolean;
  mode: AutopilotMode;
  /** Search phrases for the Trend Hunter ("valorant stream highlights"). */
  niches: string[];
  /** Channels to watch for new uploads (channel IDs "UC..."). */
  channels: string[];
  /** If not empty, only videos from these channels (IDs or names) are clipped. */
  allowlist: string[];
  /** Words that rule a video out (title / channel). */
  blocklist: string[];
  /** How often to look for new videos (hours). */
  huntEveryHours: number;
  /** Source videos clipped per hunt. */
  videosPerHunt: number;
  /** Only videos published in the last N hours. */
  maxAgeHours: number;
  /** Skip sources longer than this (minutes): long streams cost a lot to transcribe. */
  maxSourceMinutes: number;
  minSourceMinutes: number;
  /** Clips kept per source video (best first). */
  clipsPerVideo: number;
  /** Only clips with at least this virality score (0-100). */
  minScore: number;
  /** Most YouTube uploads per day. */
  dailyPostCap: number;
  /** Upload times, "HH:MM" in the server's timezone (TZ). */
  postTimes: string[];
  privacy: Privacy;
  /** Appended to every description. */
  descriptionFooter: string;
  recipe: AutopilotRecipe;
}

export type ItemStatus = "found" | "clipping" | "done" | "failed" | "skipped";

export interface AutopilotItem {
  id: string; // YouTube video id
  url: string;
  title: string;
  channel: string;
  channelId: string;
  views: number;
  durationSec: number;
  publishedAt: string;
  reason: string;
  source: "trend" | "channel" | "manual";
  status: ItemStatus;
  jobId?: string;
  error?: string;
  foundAt: number;
  updatedAt: number;
}

export type PostStatus = "pending" | "approved" | "uploading" | "posted" | "rejected" | "failed";

export interface AutopilotPost {
  id: string;
  itemId: string;
  jobId: string;
  clipIndex: number;
  /** Copy of the rendered clip, kept until posted (data/autopilot/clips, served by /api/autopilot/clip). */
  file: string;
  poster?: string;
  duration: number;
  viralityScore: number;
  title: string;
  description: string;
  tags: string[];
  sourceTitle: string;
  sourceChannel: string;
  status: PostStatus;
  scheduledFor?: number;
  youtubeId?: string;
  youtubeStatus?: string;
  lastCheckedAt?: number;
  attempts: number;
  error?: string;
  createdAt: number;
  postedAt?: number;
}

export interface LogEntry {
  at: number;
  level: "info" | "warn" | "error";
  msg: string;
}

export interface AutopilotState {
  settings: AutopilotSettings;
  items: AutopilotItem[];
  posts: AutopilotPost[];
  seen: string[];
  log: LogEntry[];
  lastHuntAt?: number;
  paused?: { at: number; reason: string };
  uploadFailStreak: number;
}

export const DEFAULT_SETTINGS: AutopilotSettings = {
  enabled: false,
  mode: "approve",
  niches: [],
  channels: [],
  allowlist: [],
  blocklist: [],
  huntEveryHours: 6,
  videosPerHunt: 2,
  maxAgeHours: 48,
  maxSourceMinutes: 90,
  minSourceMinutes: 3,
  clipsPerVideo: 3,
  minScore: 85,
  dailyPostCap: 3,
  postTimes: ["09:00", "15:00", "21:00"],
  privacy: "public",
  descriptionFooter: "",
  recipe: {
    prompt: "",
    captionStyle: "hormozi",
    reframeMode: "auto-tracker",
    removeSilences: true,
    broll: false,
    musicBed: true,
    hookTitle: true,
    captionFont: "",
    clipStyle: {},
  },
};

/** data/autopilot (AUTOPILOT_DIR overrides it, for tests). */
export const autopilotDir = () => process.env.AUTOPILOT_DIR || path.join(process.cwd(), "data", "autopilot");
const DIR = autopilotDir;
const STATE_FILE = () => path.join(DIR(), "state.json");
export const CLIP_DIR = () => path.join(DIR(), "clips");

const clampInt = (v: unknown, lo: number, hi: number, d: number) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
};
const strList = (v: unknown, max = 30, len = 120) =>
  (Array.isArray(v) ? v : typeof v === "string" ? v.split(/\n|,/) : [])
    .map((s) => String(s).trim().slice(0, len))
    .filter(Boolean)
    .slice(0, max);

/** Accepts "UC..." ids, or channel links that contain one. */
export function normalizeChannelId(raw: string): string | null {
  const m = /(UC[A-Za-z0-9_-]{22})/.exec(String(raw || ""));
  return m ? m[1] : null;
}

export function normalizeSettings(raw: any, prev: AutopilotSettings = DEFAULT_SETTINGS): AutopilotSettings {
  const r = raw && typeof raw === "object" ? raw : {};
  const rr = r.recipe && typeof r.recipe === "object" ? r.recipe : {};
  const pr = prev.recipe;
  const has = (k: string) => Object.prototype.hasOwnProperty.call(r, k);
  const hasR = (k: string) => Object.prototype.hasOwnProperty.call(rr, k);
  const times = has("postTimes")
    ? strList(r.postTimes, 12, 5).filter((t) => /^([01]\d|2[0-3]):[0-5]\d$/.test(t))
    : prev.postTimes;
  return {
    enabled: has("enabled") ? r.enabled === true : prev.enabled,
    mode: has("mode") ? (r.mode === "auto" ? "auto" : "approve") : prev.mode,
    niches: has("niches") ? strList(r.niches, 10, 80) : prev.niches,
    channels: has("channels")
      ? strList(r.channels, 30, 200).map(normalizeChannelId).filter((x): x is string => Boolean(x))
      : prev.channels,
    allowlist: has("allowlist") ? strList(r.allowlist, 100, 100) : prev.allowlist,
    blocklist: has("blocklist") ? strList(r.blocklist, 100, 60) : prev.blocklist,
    huntEveryHours: has("huntEveryHours") ? clampInt(r.huntEveryHours, 1, 48, prev.huntEveryHours) : prev.huntEveryHours,
    videosPerHunt: has("videosPerHunt") ? clampInt(r.videosPerHunt, 1, 5, prev.videosPerHunt) : prev.videosPerHunt,
    maxAgeHours: has("maxAgeHours") ? clampInt(r.maxAgeHours, 6, 720, prev.maxAgeHours) : prev.maxAgeHours,
    maxSourceMinutes: has("maxSourceMinutes") ? clampInt(r.maxSourceMinutes, 5, 240, prev.maxSourceMinutes) : prev.maxSourceMinutes,
    minSourceMinutes: has("minSourceMinutes") ? clampInt(r.minSourceMinutes, 1, 60, prev.minSourceMinutes) : prev.minSourceMinutes,
    clipsPerVideo: has("clipsPerVideo") ? clampInt(r.clipsPerVideo, 1, 6, prev.clipsPerVideo) : prev.clipsPerVideo,
    minScore: has("minScore") ? clampInt(r.minScore, 0, 100, prev.minScore) : prev.minScore,
    dailyPostCap: has("dailyPostCap") ? clampInt(r.dailyPostCap, 1, 20, prev.dailyPostCap) : prev.dailyPostCap,
    postTimes: times.length ? Array.from(new Set(times)).sort() : prev.postTimes,
    privacy: has("privacy") ? (["public", "unlisted", "private"].includes(r.privacy) ? r.privacy : "public") : prev.privacy,
    descriptionFooter: has("descriptionFooter") ? String(r.descriptionFooter || "").slice(0, 1000) : prev.descriptionFooter,
    recipe: {
      prompt: hasR("prompt") ? String(rr.prompt || "").slice(0, 600) : pr.prompt,
      captionStyle: hasR("captionStyle") && typeof rr.captionStyle === "string" ? rr.captionStyle.slice(0, 40) : pr.captionStyle,
      reframeMode: hasR("reframeMode") && ["auto-tracker", "split-screen", "blurred-fit", "center"].includes(rr.reframeMode) ? rr.reframeMode : pr.reframeMode,
      removeSilences: hasR("removeSilences") ? rr.removeSilences === true : pr.removeSilences,
      broll: hasR("broll") ? rr.broll === true : pr.broll,
      musicBed: hasR("musicBed") ? rr.musicBed === true : pr.musicBed,
      hookTitle: hasR("hookTitle") ? rr.hookTitle !== false : pr.hookTitle,
      captionFont: hasR("captionFont") && typeof rr.captionFont === "string" && (rr.captionFont === "" || CAPTION_FONTS[rr.captionFont]) ? rr.captionFont : pr.captionFont,
      clipStyle: hasR("clipStyle")
        ? { ...normalizeClipStyle(rr.clipStyle), lowerThirdName: "", lowerThirdTitle: "", drawings: [], highlightReel: false }
        : pr.clipStyle,
    },
  };
}

export function emptyState(): AutopilotState {
  return { settings: { ...DEFAULT_SETTINGS, recipe: { ...DEFAULT_SETTINGS.recipe } }, items: [], posts: [], seen: [], log: [], uploadFailStreak: 0 };
}

export function loadState(): AutopilotState {
  try {
    const raw = JSON.parse(fs.readFileSync(STATE_FILE(), "utf8"));
    const st = { ...emptyState(), ...raw } as AutopilotState;
    st.settings = normalizeSettings(raw.settings || {}, DEFAULT_SETTINGS);
    return st;
  } catch {
    return emptyState();
  }
}

export function saveState(st: AutopilotState): void {
  // Keep the file small: recent log, recent finished items/posts, seen ids.
  st.log = st.log.slice(-200);
  const DAY = 24 * 3600 * 1000;
  const week = Date.now() - 7 * DAY;
  const month = Date.now() - 30 * DAY;
  st.items = st.items.filter((i) => !["done", "failed", "skipped"].includes(i.status) || i.updatedAt > week).slice(-300);
  // Posted videos stay 30 days (their YouTube status is re-checked for claims).
  st.posts = st.posts.filter((p) => !["posted", "rejected", "failed"].includes(p.status) || (p.postedAt || p.createdAt) > month).slice(-500);
  st.seen = st.seen.slice(-3000);
  fs.mkdirSync(DIR(), { recursive: true });
  const tmp = STATE_FILE() + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(st, null, 1));
  fs.renameSync(tmp, STATE_FILE());
}

export function addLog(st: AutopilotState, level: LogEntry["level"], msg: string): void {
  st.log.push({ at: Date.now(), level, msg: msg.slice(0, 400) });
  const line = `[Autopilot] ${msg}`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

/** Read-modify-write in one synchronous step (no await inside fn). */
export function updateState(fn: (st: AutopilotState) => void): AutopilotState {
  const st = loadState();
  fn(st);
  saveState(st);
  return st;
}
