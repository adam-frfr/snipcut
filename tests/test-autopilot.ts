/**
 * Autopilot: settings, Trend Hunter filters / parsing / ranking, the
 * hunt -> clip -> collect -> schedule -> upload -> watch loop (with fake
 * jobs and a fake YouTube), safety pauses, and the YouTube OAuth / upload
 * calls against a stubbed Google API.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "autopilot-"));
process.env.AUTOPILOT_DIR = tmp;
delete process.env.GROQ_API_KEY;
delete process.env.GROQ_API_KEY2;
delete process.env.OPENAI_API_KEY;
delete process.env.ANTHROPIC_API_KEY;
delete process.env.YOUTUBE_API_KEY;

import { normalizeSettings, DEFAULT_SETTINGS, loadState, updateState, normalizeChannelId, CLIP_DIR } from "../src/lib/autopilot/store";
import { parseIsoDuration, rejectReason, searchNiche, channelFeed, rankCandidates, hunt, Candidate } from "../src/lib/autopilot/trendHunter";
import { EngineDeps, stepHunt, stepClip, stepCollect, stepUpload, stepWatch, stepTidy, nextSlot, defaultWriteMeta } from "../src/lib/autopilot/engine";
import { authUrl, finishAuth, uploadVideo } from "../src/lib/autopilot/youtube";

let failures = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`${ok ? "-> PASS" : "-> FAIL"}: ${msg}`);
  if (!ok) failures++;
};
const realFetch = globalThis.fetch;
const H = 3600 * 1000;

(async () => {
  // ---- Settings ------------------------------------------------------------
  const s1 = normalizeSettings({
    enabled: true, mode: "auto", niches: "valorant clutch\nkai cenat stream", huntEveryHours: 999, minScore: -5,
    postTimes: ["25:00", "09:30", "18:00", "09:30"], channels: ["https://youtube.com/channel/UCabcdefghijklmnopqrstuv", "bad"],
    recipe: { reframeMode: "nope", prompt: "funny" },
  });
  check(s1.enabled && s1.mode === "auto", "settings: on + fully automatic");
  check(s1.niches.length === 2 && s1.huntEveryHours === 48 && s1.minScore === 0, "settings: lists split, numbers clamped");
  check(JSON.stringify(s1.postTimes) === '["09:30","18:00"]', "settings: bad and duplicate post times dropped");
  check(s1.channels.length === 1 && s1.channels[0] === "UCabcdefghijklmnopqrstuv", "settings: channel IDs pulled from links");
  check(s1.recipe.reframeMode === "auto-tracker" && s1.recipe.prompt === "funny", "settings: recipe validated");
  const s2 = normalizeSettings({ minScore: 70 }, s1);
  check(s2.minScore === 70 && s2.niches.length === 2 && s2.mode === "auto", "settings: a partial update keeps the rest");
  check(normalizeChannelId("UC_x") === null, "channel id: short ids refused");

  // ---- Trend Hunter --------------------------------------------------------
  check(parseIsoDuration("PT1H2M3S") === 3723 && parseIsoDuration("PT45S") === 45 && parseIsoDuration("P1DT1M") === 86460, "ISO durations parse");
  const now = Date.now();
  const cand = (o: Partial<Candidate>): Candidate => ({
    id: "v1", url: "https://www.youtube.com/watch?v=v1", title: "Big stream moment", channel: "Streamer", channelId: "UCaaaaaaaaaaaaaaaaaaaaaa",
    views: 100000, durationSec: 3600, publishedAt: new Date(now - 5 * H).toISOString(), live: false, viewsPerHour: 20000, source: "trend", ...o,
  });
  const st0 = { ...DEFAULT_SETTINGS, maxSourceMinutes: 90 };
  check(rejectReason(cand({}), st0, new Set()) === null, "a fresh 1h video is usable");
  check(rejectReason(cand({}), st0, new Set(["v1"])) === "already used", "already-used videos skipped");
  check(rejectReason(cand({ live: true }), st0, new Set()) === "still live", "live streams skipped until they end");
  check(rejectReason(cand({ durationSec: 4 * 3600 }), st0, new Set()) === "too long", "too-long streams skipped");
  check(rejectReason(cand({ publishedAt: new Date(now - 100 * H).toISOString() }), st0, new Set()) === "too old", "old videos skipped");
  check(rejectReason(cand({}), { ...st0, allowlist: ["other guy"] }, new Set()) === "channel not on your allowlist", "allowlist enforced");
  check(rejectReason(cand({}), { ...st0, allowlist: ["streamer"] }, new Set()) === null, "allowlist matches channel names (any case)");
  check(/blocked word/.test(rejectReason(cand({ title: "Music video reupload" }), { ...st0, blocklist: ["music video"] }, new Set()) || ""), "blocklist enforced");

  const calls: string[] = [];
  (globalThis as any).fetch = async (url: string) => {
    const u = String(url);
    calls.push(u);
    if (u.includes("/youtube/v3/search")) return new Response(JSON.stringify({ items: [{ id: { videoId: "aaa" } }, { id: { videoId: "bbb" } }] }), { status: 200 });
    if (u.includes("/youtube/v3/videos")) {
      return new Response(JSON.stringify({ items: [
        { id: "aaa", snippet: { title: "A", channelTitle: "Chan A", channelId: "UCa", publishedAt: new Date(now - 2 * H).toISOString(), liveBroadcastContent: "none" }, statistics: { viewCount: "50000" }, contentDetails: { duration: "PT1H" } },
        { id: "bbb", snippet: { title: "B", channelTitle: "Chan B", channelId: "UCb", publishedAt: new Date(now - 10 * H).toISOString(), liveBroadcastContent: "live" }, statistics: { viewCount: "9000" }, contentDetails: { duration: "PT0S" } },
      ] }), { status: 200 });
    }
    if (u.includes("feeds/videos.xml")) {
      return new Response(`<feed><entry><yt:videoId>ccc</yt:videoId><title>New &amp; hot</title><author><name>Chan C</name></author><published>${new Date(now - 3 * H).toISOString()}</published><media:statistics views="3000"/></entry></feed>`, { status: 200 });
    }
    return new Response("{}", { status: 404 });
  };
  const found = await searchNiche("valorant", 48, "k");
  check(found.length === 2 && found[0].durationSec === 3600 && found[0].viewsPerHour === 25000, "search: details, length and views/hour");
  check(found[1].live === true, "search: live streams flagged");
  check(/publishedAfter=/.test(calls[0]) && /order=viewCount/.test(calls[0]), "search asks for recent, most-viewed videos");
  const feed = await channelFeed("UCccccccccccccccccccccccc", "");
  check(feed.length === 1 && feed[0].id === "ccc" && feed[0].title === "New & hot" && feed[0].views === 3000, "channel feed parsed without an API key");
  const logs: string[] = [];
  const picks = await hunt({ ...DEFAULT_SETTINGS, niches: ["x"], channels: ["UCccccccccccccccccccccccc"], videosPerHunt: 1 }, new Set(), (_l, m) => logs.push(m));
  check(logs.some((m) => /YOUTUBE_API_KEY/.test(m)), "without a YouTube key: warns, still checks followed channels");
  check(picks.length === 1 && picks[0].id === "ccc", "hunt returns the followed channel's new upload");
  (globalThis as any).fetch = realFetch;
  const ranked = await rankCandidates([cand({ id: "a", viewsPerHour: 10 }), cand({ id: "b", viewsPerHour: 900 }), cand({ id: "c", viewsPerHour: 50 })], DEFAULT_SETTINGS, 2);
  check(ranked.map((c) => c.id).join() === "b,c", "no AI: ranked by views per hour");

  // ---- Engine loop with fake jobs + fake YouTube --------------------------
  let clock = new Date(2026, 10, 10, 8, 0, 0).getTime(); // 08:00
  const rc = path.join(process.cwd(), "public", "rendered_clips");
  fs.mkdirSync(rc, { recursive: true });
  const clipA = `aptest-${Date.now()}-a.mp4`;
  const clipB = `aptest-${Date.now()}-b.mp4`;
  fs.writeFileSync(path.join(rc, clipA), "A".repeat(2000));
  fs.writeFileSync(path.join(rc, clipB), "B".repeat(2000));
  const jobs: Record<string, any> = {};
  const uploads: { file: string; title: string; privacy: string }[] = [];
  let uploadMode: "ok" | "quota" | "error" = "ok";
  let ytStatus: Record<string, any> = {};
  const deps: EngineDeps = {
    now: () => clock,
    hunt: async () => [cand({ id: "vid1", url: "https://www.youtube.com/watch?v=vid1", title: "Huge moment" }), cand({ id: "vid2", url: "https://www.youtube.com/watch?v=vid2", title: "Second" })],
    createJob: async (item) => { const id = `job_${item.id}`; jobs[id] = { status: "transcribing" }; return id; },
    getJob: async (id) => jobs[id] || null,
    upload: async (file, meta) => {
      if (uploadMode === "quota") { const e: any = new Error("YouTube: quotaExceeded"); e.reason = "quotaExceeded"; throw e; }
      if (uploadMode === "error") throw new Error("YouTube upload: backendError");
      uploads.push({ file, title: meta.title, privacy: meta.privacy });
      return `yt${uploads.length}`;
    },
    statuses: async () => ytStatus,
    connected: () => true,
    writeMeta: async (clip, item, s) => defaultWriteMeta(clip, item, s),
  };
  updateState((s) => { s.settings = normalizeSettings({ enabled: true, mode: "approve", niches: ["x"], minScore: 85, clipsPerVideo: 3, dailyPostCap: 1, postTimes: ["09:00", "18:00"], videosPerHunt: 2 }, DEFAULT_SETTINGS); });

  check((await stepHunt(deps)) === 2, "hunt adds the picked videos");
  check((await stepHunt(deps)) === 0, "no second hunt while the last finds are still being clipped");
  check((await stepClip(deps)) === "job_vid1" && loadState().items[0].status === "clipping", "first video goes to the job pipeline");
  check((await stepClip(deps)) === null, "only one Autopilot job at a time");
  check((await stepCollect(deps)) === 0, "a running job isn't collected");
  jobs.job_vid1 = { status: "done", output: { renderedClips: [
    { filename: clipA, viralityScore: 92, duration: 31, hookHeadline: "He actually did it", description: "Crowd loses it" },
    { filename: clipB, viralityScore: 70, duration: 20, hookHeadline: "Meh" },
  ] } };
  check((await stepCollect(deps)) === 1, "only clips above the score become posts");
  let st = loadState();
  const post = st.posts[0];
  check(post.status === "pending" && fs.existsSync(path.join(CLIP_DIR(), post.file)), "approve mode: post waits in the inbox, clip copied");
  check(/#shorts/.test(post.title) && post.description.includes("https://www.youtube.com/watch?v=vid1") && post.description.includes("Original video"), "title has #shorts, description credits the original");
  check(st.items.find((i) => i.id === "vid1")!.status === "done", "video marked done");

  // Approve -> next slot is 09:00 today.
  updateState((s) => { const p = s.posts[0]; p.status = "approved"; p.scheduledFor = nextSlot(s, clock); });
  st = loadState();
  check(new Date(st.posts[0].scheduledFor!).getHours() === 9 && new Date(st.posts[0].scheduledFor!).getDate() === 10, "approved post gets the 09:00 slot");
  check((await stepUpload(deps)) === null && uploads.length === 0, "nothing uploads before its time");
  clock += 1.5 * H; // 09:30
  check((await stepUpload(deps)) === "yt1" && uploads[0].privacy === "public", "due post uploads at its time");
  st = loadState();
  check(st.posts[0].status === "posted" && st.posts[0].youtubeId === "yt1", "post marked posted with the video id");
  check(!fs.existsSync(path.join(CLIP_DIR(), post.file)), "uploaded clip file removed");

  // Daily cap 1: a second approved post goes to tomorrow.
  updateState((s) => {
    s.posts.push({ ...s.posts[0], id: "p_000000000002", file: "p_000000000002.mp4", status: "approved", youtubeId: undefined, scheduledFor: undefined, postedAt: undefined });
  });
  fs.writeFileSync(path.join(CLIP_DIR(), "p_000000000002.mp4"), "x");
  await stepUpload(deps);
  st = loadState();
  const p2 = st.posts.find((p) => p.id === "p_000000000002")!;
  check(new Date(p2.scheduledFor!).getDate() === 11 && new Date(p2.scheduledFor!).getHours() === 9, "daily cap: next post moves to tomorrow 09:00");

  // Quota error -> retried a day later; repeated errors -> pause.
  clock = p2.scheduledFor! + 60 * 1000;
  uploadMode = "quota";
  await stepUpload(deps);
  st = loadState();
  check(st.posts.find((p) => p.id === p2.id)!.scheduledFor! > clock + 23 * H && !st.paused, "quota limit: moved to the next day, not paused");
  uploadMode = "error";
  for (let i = 0; i < 3; i++) {
    clock = loadState().posts.find((p) => p.id === p2.id)!.scheduledFor! + 1000;
    await stepUpload(deps, true);
  }
  st = loadState();
  check(Boolean(st.paused) && /3 uploads in a row/.test(st.paused!.reason), "3 failed uploads in a row pause Autopilot");
  check(st.posts.find((p) => p.id === p2.id)!.status === "failed", "a post is given up after 3 tries");
  check((await stepClip(deps)) === null, "paused: nothing new is clipped");
  updateState((s) => { s.paused = undefined; s.uploadFailStreak = 0; });

  // Copyright rejection on a posted video pauses Autopilot.
  ytStatus = { yt1: { uploadStatus: "rejected", rejectionReason: "copyright" } };
  clock += 2 * H;
  await stepWatch(deps);
  st = loadState();
  check(Boolean(st.paused) && /copyright/.test(st.paused!.reason), "copyright rejection pauses Autopilot");
  check(st.posts[0].youtubeStatus === "rejected: copyright", "rejection shown on the post");
  updateState((s) => { s.paused = undefined; });

  // Download blocked -> clear hint.
  await stepClip(deps);
  jobs.job_vid2 = { status: "failed", error: "Sign in to confirm you're not a bot" };
  await stepCollect(deps);
  st = loadState();
  check(st.items.find((i) => i.id === "vid2")!.status === "failed" && st.log.some((l) => /cookies/.test(l.msg)), "blocked download: video failed, cookie hint logged");

  // Auto mode: posts go straight to the schedule.
  updateState((s) => {
    s.settings = normalizeSettings({ mode: "auto" }, s.settings);
    s.items.push({ ...s.items[0], id: "vid3", status: "found", jobId: undefined });
  });
  await stepClip(deps);
  jobs.job_vid3 = { status: "done", output: { renderedClips: [{ filename: clipA, viralityScore: 95, duration: 25, hookHeadline: "Wow" }] } };
  await stepCollect(deps);
  st = loadState();
  const auto = st.posts.find((p) => p.itemId === "vid3")!;
  check(auto.status === "approved" && Boolean(auto.scheduledFor), "auto mode: clip scheduled without asking");

  // Old unapproved posts expire.
  updateState((s) => { s.posts.push({ ...auto, id: "p_000000000009", file: "p_000000000009.mp4", status: "pending", createdAt: clock - 8 * 24 * H }); });
  stepTidy(deps);
  check(loadState().posts.find((p) => p.id === "p_000000000009")!.status === "rejected", "inbox clips expire after 7 days");

  // ---- YouTube OAuth + upload (stubbed Google) ---------------------------
  process.env.GOOGLE_CLIENT_ID = "cid";
  process.env.GOOGLE_CLIENT_SECRET = "csecret";
  const url = new URL(authUrl("https://snipcut.example/api/autopilot/youtube/callback"));
  check(url.searchParams.get("access_type") === "offline" && /youtube\.upload/.test(url.searchParams.get("scope") || ""), "consent URL asks for offline YouTube upload access");
  let threw = false;
  try { await finishAuth("code", "wrong-state"); } catch { threw = true; }
  check(threw, "sign-in with a wrong state is refused");
  const url2 = new URL(authUrl("https://snipcut.example/api/autopilot/youtube/callback"));
  const gcalls: { url: string; method: string; headers: any; body?: any }[] = [];
  (globalThis as any).fetch = async (u: string, init: any = {}) => {
    gcalls.push({ url: String(u), method: init.method || "GET", headers: init.headers || {}, body: init.body });
    if (String(u).startsWith("https://oauth2.googleapis.com/token")) return new Response(JSON.stringify({ access_token: "at", refresh_token: "rt", expires_in: 3600 }), { status: 200 });
    if (String(u).includes("/channels?")) return new Response(JSON.stringify({ items: [{ id: "UCme", snippet: { title: "My Channel" } }] }), { status: 200 });
    if (String(u).includes("uploadType=resumable")) return new Response("", { status: 200, headers: { location: "https://upload.example/session1" } });
    if (String(u) === "https://upload.example/session1") return new Response(JSON.stringify({ id: "newvid" }), { status: 200 });
    return new Response("{}", { status: 404 });
  };
  const done = await finishAuth("code", url2.searchParams.get("state")!);
  check(done.channelTitle === "My Channel", "sign-in stores the channel");
  const saved = JSON.parse(fs.readFileSync(path.join(tmp, "youtube.json"), "utf8"));
  check(saved.refreshToken === "rt", "refresh token saved on the server");
  const vf = path.join(tmp, "v.mp4");
  fs.writeFileSync(vf, "video-bytes");
  const vid = await uploadVideo(vf, { title: "T #shorts", description: "D", tags: ["a"], privacy: "unlisted" });
  const initCall = gcalls.find((c) => c.url.includes("uploadType=resumable"))!;
  const meta = JSON.parse(initCall.body);
  check(vid === "newvid" && meta.status.privacyStatus === "unlisted" && meta.snippet.title === "T #shorts", "resumable upload sends metadata, then the file");
  check(initCall.headers.Authorization === "Bearer at", "upload uses the access token");
  (globalThis as any).fetch = realFetch;

  for (const f of [clipA, clipB]) { try { fs.unlinkSync(path.join(rc, f)); } catch {} }
  fs.rmSync(tmp, { recursive: true, force: true });
  if (failures) {
    console.log(`\n${failures} AUTOPILOT CHECK(S) FAILED`);
    process.exit(1);
  }
  console.log("\nALL AUTOPILOT CHECKS PASSED");
})();
