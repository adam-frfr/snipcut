/**
 * Adaptive effects: the music bed is skipped when the clip already has
 * music / a sound bed under the speech, and B-roll / punch zooms only go on
 * talking-head stretches (not screen recordings, slides or split-screens).
 *
 * Audio fixtures: 12s of "speech" (0.6s tone bursts with 0.6s pauses),
 * once on silence (clean voice track) and once over a continuous quieter
 * bed (music-like background).
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { getFfmpegBinary } from "../src/lib/videoService";
import { measureBackgroundAudio, judgeBackground, shotMap, coverage, inside, overlaps } from "../src/lib/adaptiveFx";
import { fetchBrollAssets, hasBrollSource } from "../src/lib/brollService";

let failures = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`${ok ? "-> PASS" : "-> FAIL"}: ${msg}`);
  if (!ok) failures++;
};

const dataDir = path.join(process.cwd(), "data");
fs.mkdirSync(dataDir, { recursive: true });
const ff = getFfmpegBinary();
const burst = "if(lt(mod(t\\,1.2)\\,0.6)\\,0.5*sin(2*PI*220*t)*(0.6+0.4*sin(2*PI*3*t))\\,0)";
const clean = path.join(dataDir, "test_bg_clean.wav");
const music = path.join(dataDir, "test_bg_music.wav");
execFileSync(ff, ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", `aevalsrc='${burst}':s=16000:d=12`, clean]);
execFileSync(ff, [
  "-hide_banner", "-loglevel", "error", "-y",
  "-f", "lavfi", "-i", `aevalsrc='${burst}+0.12*sin(2*PI*330*t)+0.08*sin(2*PI*494*t)':s=16000:d=12`,
  music,
]);
// "Words" = the bursts.
const words = Array.from({ length: 10 }, (_, i) => ({ start: i * 1.2, end: i * 1.2 + 0.6 }));

(async () => {
  const a = await measureBackgroundAudio(clean, 0, 12, words);
  check(!a.hasBackground, `clean voice track keeps the music bed (${a.reason})`);
  const b = await measureBackgroundAudio(music, 0, 12, words);
  check(b.hasBackground, `speech over music skips the music bed (${b.reason})`);
  check(!judgeBackground(-30, -15, 0.3).hasBackground, "too few pauses to judge -> keep the bed (no false skip)");

  // Shot map from tracker layout segments.
  const tracking: any = {
    layoutSegments: [
      { start: 0, end: 4, layout: "crop" },
      { start: 4, end: 10, layout: "fit" },
      { start: 10, end: 14, layout: "split" },
      { start: 14, end: 20, layout: "crop" },
    ],
  };
  const m = shotMap(tracking, "auto-tracker", 20);
  check(m.crop.length === 2 && m.fit.length === 1 && m.split.length === 1, "tracker segments map to crop / fit / split");
  check(Math.abs(coverage(m.crop, 20) - 0.5) < 1e-9, "talking-head coverage is 50%");
  check(inside(m.crop, 1, 2) && !inside(m.crop, 3.5, 4.5), "a zoom must fit inside one talking-head shot");
  check(overlaps(m.fit, 5, 7, 0.4) && !overlaps(m.fit, 1, 3, 0.4), "B-roll over the screen-recording part is detected");
  const manualSplit = shotMap(tracking, "split-screen", 20);
  check(manualSplit.crop.length === 0 && coverage(manualSplit.split, 20) === 1, "manual split-screen: whole clip is split (no B-roll, no zooms)");
  const fit = shotMap(null, "blurred-fit", 20);
  check(coverage(fit.fit, 20) === 1, "blur-fit mode: whole clip shows the full frame");
  const center = shotMap(null, "center", 20);
  check(coverage(center.crop, 20) === 1, "center crop counts as a talking head");

  // AI B-roll: with no stock key, cutaways are generated from the OpenAI
  // key (Pexels / Pixabay paused new keys). Stand-in OpenAI response.
  for (const k of ["PEXELS_API_KEY", "PIXABAY_API_KEY", "UNSPLASH_ACCESS_KEY", "OPENAI_API_KEY", "BROLL_ALLOW_WIKIMEDIA"]) delete process.env[k];
  check(!hasBrollSource({}), "no keys -> no B-roll source (no random Wikimedia pictures)");
  check(hasBrollSource({ openaiKey: "sk-test" }), "an OpenAI key enables AI B-roll");
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64"
  );
  const calls: { url: string; body: any }[] = [];
  const realFetch = globalThis.fetch;
  (globalThis as any).fetch = async (url: string, init: any) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : null });
    return new Response(JSON.stringify({ data: [{ b64_json: png.toString("base64") }] }), { status: 200 });
  };
  const brollDir = path.join(dataDir, "test_broll_ai");
  const assets = await fetchBrollAssets(
    [{ start: 4, end: 6.5, text: "I work best at 3 a.m. when the city is asleep", query: "city at night from a window", kind: "video" }],
    { openaiKey: "sk-test", destDir: brollDir, tag: "t" }
  );
  (globalThis as any).fetch = realFetch;
  const req = calls.find((c) => c.url.includes("/v1/images/generations"));
  check(Boolean(req) && req!.body.model === "gpt-image-1" && req!.body.size === "1024x1536", "asks OpenAI for a vertical gpt-image-1 image");
  check(Boolean(req) && /city at night/.test(req!.body.prompt) && /No text/.test(req!.body.prompt), "prompt carries the cue and forbids text/logos");
  check(assets.length === 1 && assets[0].kind === "image" && fs.existsSync(assets[0].assetPath), "the generated image is saved and used as the cutaway");
  fs.rmSync(brollDir, { recursive: true, force: true });

  // Unsplash (photos only): Client-ID auth, relevance gate on its own
  // description/alt/tags, download ping, and no credit added anywhere.
  check(hasBrollSource({ unsplashKey: "u-test" }), "an Unsplash key enables stock-photo B-roll");
  const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(9000, 7)]);
  const ucalls: { url: string; auth: string }[] = [];
  (globalThis as any).fetch = async (url: string, init: any) => {
    const u = String(url);
    ucalls.push({ url: u, auth: init?.headers?.Authorization || "" });
    if (u.startsWith("https://api.unsplash.com/search/photos")) {
      return new Response(JSON.stringify({ results: [
        { alt_description: "a bowl of fruit on a table", urls: { regular: "https://images.unsplash.com/off" }, links: { download_location: "https://api.unsplash.com/photos/off/download" } },
        { description: "City skyline at night", alt_description: "lit windows", tags: [{ title: "night" }], urls: { regular: "https://images.unsplash.com/on" }, links: { download_location: "https://api.unsplash.com/photos/on/download" } },
      ] }), { status: 200 });
    }
    if (u.startsWith("https://images.unsplash.com/")) return new Response(jpg, { status: 200 });
    if (u.includes("/download")) return new Response("{}", { status: 200 });
    return new Response("{}", { status: 404 });
  };
  const uDir = path.join(dataDir, "test_broll_unsplash");
  const uAssets = await fetchBrollAssets(
    [{ start: 4, end: 6.5, text: "the city at night", query: "city skyline night", kind: "video" }],
    { unsplashKey: "u-test", destDir: uDir, tag: "u" }
  );
  await new Promise((r) => setTimeout(r, 50)); // let the download ping fire
  (globalThis as any).fetch = realFetch;
  const search = ucalls.find((c) => c.url.startsWith("https://api.unsplash.com/search/photos"));
  check(Boolean(search) && search!.auth === "Client-ID u-test" && /orientation=portrait/.test(search!.url), "searches Unsplash (portrait) with the Access Key");
  check(!ucalls.some((c) => c.url.endsWith("/off")), "off-topic Unsplash photo is skipped by the relevance gate");
  check(uAssets.length === 1 && uAssets[0].kind === "image" && fs.existsSync(uAssets[0].assetPath), "the on-topic Unsplash photo becomes a still cutaway");
  check(ucalls.some((c) => c.url === "https://api.unsplash.com/photos/on/download"), "reports the download to Unsplash");
  fs.rmSync(uDir, { recursive: true, force: true });

  for (const f of [clean, music]) {
    try { fs.unlinkSync(f); } catch {}
  }
  if (failures) {
    console.error(`\nADAPTIVE FX FAILURES: ${failures}`);
    process.exit(1);
  }
  console.log("\nALL ADAPTIVE FX TESTS PASSED!");
})();
