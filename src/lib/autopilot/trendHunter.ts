import { chatJson } from "../brollService";
import type { AutopilotSettings } from "./store";

/**
 * Trend Hunter: finds source videos worth clipping.
 *  - Niche searches through the YouTube Data API (YOUTUBE_API_KEY, free:
 *    a search costs 100 of the 10,000 daily quota units).
 *  - Channels you follow, through their public RSS feed (no key).
 * Candidates are filtered (age, length, live, allow/block lists, already
 * seen), then ranked by the AI (same Groq/OpenAI/Claude helper the clip
 * picker uses), falling back to views per hour.
 */

export interface Candidate {
  id: string;
  url: string;
  title: string;
  channel: string;
  channelId: string;
  views: number;
  durationSec: number; // 0 = unknown (no API key)
  publishedAt: string;
  live: boolean;
  viewsPerHour: number;
  source: "trend" | "channel";
  reason?: string;
}

const YT = "https://www.googleapis.com/youtube/v3";
export const youtubeApiKey = () => (process.env.YOUTUBE_API_KEY || "").trim();

/** "PT1H2M3S" -> 3723 */
export function parseIsoDuration(iso: string): number {
  const m = /^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(String(iso || ""));
  if (!m) return 0;
  return (Number(m[1] || 0) * 86400) + (Number(m[2] || 0) * 3600) + (Number(m[3] || 0) * 60) + Number(m[4] || 0);
}

async function getJson(url: string): Promise<any> {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  const text = await res.text();
  let data: any = {};
  try { data = JSON.parse(text); } catch {}
  if (!res.ok) {
    const reason = data?.error?.errors?.[0]?.reason || data?.error?.message || `HTTP ${res.status}`;
    throw new Error(`YouTube API: ${reason}`);
  }
  return data;
}

function toCandidate(v: any, source: Candidate["source"]): Candidate {
  const publishedAt = v?.snippet?.publishedAt || v?.liveStreamingDetails?.actualStartTime || "";
  const hours = Math.max(1, (Date.now() - Date.parse(publishedAt || new Date().toISOString())) / 3600000);
  const views = Number(v?.statistics?.viewCount || 0);
  return {
    id: v.id,
    url: `https://www.youtube.com/watch?v=${v.id}`,
    title: String(v?.snippet?.title || ""),
    channel: String(v?.snippet?.channelTitle || ""),
    channelId: String(v?.snippet?.channelId || ""),
    views,
    durationSec: parseIsoDuration(v?.contentDetails?.duration),
    publishedAt,
    live: ["live", "upcoming"].includes(v?.snippet?.liveBroadcastContent),
    viewsPerHour: Math.round(views / hours),
    source,
  };
}

/** Full details for up to 50 ids per call. */
async function videoDetails(ids: string[], key: string, source: Candidate["source"]): Promise<Candidate[]> {
  const out: Candidate[] = [];
  for (let i = 0; i < ids.length; i += 50) {
    const chunk = ids.slice(i, i + 50);
    const data = await getJson(`${YT}/videos?part=snippet,statistics,contentDetails&id=${chunk.join(",")}&key=${encodeURIComponent(key)}`);
    for (const v of data.items || []) out.push(toCandidate(v, source));
  }
  return out;
}

export async function searchNiche(q: string, maxAgeHours: number, key: string): Promise<Candidate[]> {
  const after = new Date(Date.now() - maxAgeHours * 3600000).toISOString();
  const data = await getJson(
    `${YT}/search?part=id&type=video&order=viewCount&maxResults=15&safeSearch=moderate` +
      `&q=${encodeURIComponent(q)}&publishedAfter=${encodeURIComponent(after)}&key=${encodeURIComponent(key)}`
  );
  const ids = (data.items || []).map((it: any) => it?.id?.videoId).filter(Boolean);
  return ids.length ? videoDetails(ids, key, "trend") : [];
}

/** Latest uploads of a channel from its public feed. */
export async function channelFeed(channelId: string, key: string): Promise<Candidate[]> {
  const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`, {
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`channel feed ${channelId}: HTTP ${res.status}`);
  const xml = await res.text();
  const entries = xml.split("<entry>").slice(1, 11);
  const pick = (s: string, re: RegExp) => (re.exec(s)?.[1] || "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  const basic = entries
    .map((e) => ({
      id: pick(e, /<yt:videoId>([^<]+)<\/yt:videoId>/),
      title: pick(e, /<title>([^<]*)<\/title>/),
      channel: pick(e, /<name>([^<]*)<\/name>/),
      publishedAt: pick(e, /<published>([^<]+)<\/published>/),
      views: Number(pick(e, /<media:statistics views="(\d+)"/) || 0),
    }))
    .filter((b) => b.id);
  if (key && basic.length) return videoDetails(basic.map((b) => b.id), key, "channel");
  return basic.map((b) => {
    const hours = Math.max(1, (Date.now() - Date.parse(b.publishedAt || new Date().toISOString())) / 3600000);
    return {
      id: b.id,
      url: `https://www.youtube.com/watch?v=${b.id}`,
      title: b.title,
      channel: b.channel,
      channelId,
      views: b.views,
      durationSec: 0,
      publishedAt: b.publishedAt,
      live: false,
      viewsPerHour: Math.round(b.views / hours),
      source: "channel" as const,
    };
  });
}

const lc = (s: string) => s.toLowerCase();

/** Why a candidate is ruled out, or null when it may be clipped. */
export function rejectReason(c: Candidate, s: AutopilotSettings, seen: Set<string>): string | null {
  if (seen.has(c.id)) return "already used";
  if (c.live) return "still live";
  const ageH = (Date.now() - Date.parse(c.publishedAt || "")) / 3600000;
  if (Number.isFinite(ageH) && ageH > s.maxAgeHours) return "too old";
  if (c.durationSec) {
    if (c.durationSec > s.maxSourceMinutes * 60) return "too long";
    if (c.durationSec < s.minSourceMinutes * 60) return "too short";
  }
  if (s.allowlist.length) {
    const ok = s.allowlist.some((a) => a === c.channelId || lc(c.channel) === lc(a) || lc(c.channel).includes(lc(a)));
    if (!ok) return "channel not on your allowlist";
  }
  const hay = lc(`${c.title} ${c.channel}`);
  const bad = s.blocklist.find((b) => hay.includes(lc(b)));
  if (bad) return `blocked word "${bad}"`;
  return null;
}

/** AI picks the best `n`; without an AI, highest views per hour. */
export async function rankCandidates(cands: Candidate[], s: AutopilotSettings, n: number): Promise<Candidate[]> {
  const pool = [...cands].sort((a, b) => b.viewsPerHour - a.viewsPerHour).slice(0, 20);
  if (pool.length <= n) return pool.map((c) => ({ ...c, reason: c.reason || `${c.viewsPerHour.toLocaleString()} views/hour` }));
  const list = pool
    .map((c, i) => `${i}. "${c.title}" by ${c.channel} — ${c.views.toLocaleString()} views, ${c.viewsPerHour.toLocaleString()}/h, ${c.durationSec ? Math.round(c.durationSec / 60) + " min" : "length unknown"}`)
    .join("\n");
  const prompt = `You run a YouTube Shorts clip channel. Niches: ${s.niches.join(", ") || "general"}.
${s.recipe.prompt ? `The channel's clipping brief: ${s.recipe.prompt}\n` : ""}Pick the ${n} videos below that will give the most viral, self-contained short clips (funny, shocking, emotional or high-energy moments; trending right now; spoken content — skip music videos, silent gameplay and compilations of other clips).
Return ONLY JSON: [{"i":0,"why":"short reason"}, ...] with exactly ${n} items, best first.

${list}`;
  try {
    const raw = await chatJson(prompt, { groqKey: process.env.GROQ_API_KEY });
    const m = raw && raw.match(/\[[\s\S]*\]/);
    if (m) {
      const picks = (JSON.parse(m[0]) as { i: number; why?: string }[])
        .filter((p) => Number.isInteger(p?.i) && pool[p.i])
        .slice(0, n);
      const out: Candidate[] = [];
      for (const p of picks) {
        if (!out.some((c) => c.id === pool[p.i].id)) out.push({ ...pool[p.i], reason: String(p.why || "AI pick").slice(0, 160) });
      }
      if (out.length) return out;
    }
  } catch {}
  return pool.slice(0, n).map((c) => ({ ...c, reason: `${c.viewsPerHour.toLocaleString()} views/hour` }));
}

/** One full hunt: search + feeds -> filtered -> ranked picks. */
export async function hunt(
  s: AutopilotSettings,
  seen: Set<string>,
  log: (level: "info" | "warn" | "error", msg: string) => void
): Promise<Candidate[]> {
  const key = youtubeApiKey();
  const found: Candidate[] = [];
  if (s.niches.length && !key) log("warn", "Trend search needs YOUTUBE_API_KEY on the server; only followed channels are checked.");
  if (key) {
    for (const q of s.niches) {
      try {
        found.push(...(await searchNiche(q, s.maxAgeHours, key)));
      } catch (e: any) {
        log("warn", `Search "${q}" failed: ${e?.message || e}`);
        if (/quota/i.test(String(e?.message))) break;
      }
    }
  }
  for (const ch of s.channels) {
    try {
      found.push(...(await channelFeed(ch, key)));
    } catch (e: any) {
      log("warn", `Channel ${ch}: ${e?.message || e}`);
    }
  }
  const unique = new Map<string, Candidate>();
  for (const c of found) if (!unique.has(c.id)) unique.set(c.id, c);
  const ok: Candidate[] = [];
  const reasons: Record<string, number> = {};
  for (const c of unique.values()) {
    const r = rejectReason(c, s, seen);
    if (r) reasons[r] = (reasons[r] || 0) + 1;
    else ok.push(c);
  }
  const why = Object.entries(reasons).map(([r, k]) => `${k} ${r}`).join(", ");
  log("info", `Hunt: ${unique.size} videos found, ${ok.length} usable${why ? ` (skipped: ${why})` : ""}.`);
  return ok.length ? rankCandidates(ok, s, s.videosPerHunt) : [];
}
