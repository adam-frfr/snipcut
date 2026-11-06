/**
 * Disk cleanup: old clips / thumbnails / B-roll go after the retention
 * window, crashed-render temp files after 3h, fresh files and kept data
 * (uploaded music, job records) stay, and the hourly timer starts once.
 */
import fs from "node:fs";
import path from "node:path";
import { cleanupExpiredFiles, startCleanupTimer } from "../src/lib/cleanup";

let failures = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`${ok ? "-> PASS" : "-> FAIL"}: ${msg}`);
  if (!ok) failures++;
};

const H = 3600 * 1000;
const tag = `cleanuptest-${Date.now()}`;
const made: string[] = [];
const file = (rel: string, ageHours: number) => {
  const p = path.join(process.cwd(), rel);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, "x");
  const t = new Date(Date.now() - ageHours * H);
  fs.utimesSync(p, t, t);
  made.push(p);
  return p;
};

const oldClip = file(`public/rendered_clips/${tag}-clip.mp4`, 30);
const oldThumb = file(`public/rendered_clips/thumb-${tag}.jpg`, 30);
const freshClip = file(`public/rendered_clips/${tag}-fresh.mp4`, 1);
const oldBroll = file(`data/broll/${tag}/nested/old.jpg`, 30);
const freshBroll = file(`data/broll/${tag}-fresh.jpg`, 2);
const stalePostfx = file(`data/postfx/${tag}.ass`, 4);
const livePostfx = file(`data/postfx/${tag}-live.ass`, 0.5);
const staleVo = file(`data/voiceover/${tag}.mp3`, 5);
const music = file(`data/music/user/${tag}.mp3`, 500);
const job = file(`data/jobs/${tag}.json`, 500);
const oldDebug = file(`data/debug/transcript-${tag}.json`, 30);
const oldCache = file(`data/cache/transcripts/${tag}.json`, 30);
const freshCache = file(`data/cache/renders/${tag}.json`, 1);

const res = cleanupExpiredFiles(24);
const gone = (p: string) => !fs.existsSync(p);
check(gone(oldClip) && gone(oldThumb), "clips and thumbnails older than 24h are deleted");
check(!gone(freshClip), "a fresh clip is kept");
check(gone(oldBroll) && !fs.existsSync(path.join(process.cwd(), `data/broll/${tag}`)), "old B-roll is deleted, empty folders removed");
check(!gone(freshBroll), "fresh B-roll is kept");
check(gone(stalePostfx) && gone(staleVo), "temp files from a crashed render go after 3h");
check(!gone(livePostfx), "a render's temp files in use are kept");
check(!gone(music) && !gone(job), "uploaded music and job records are never deleted");
check(gone(oldDebug) && gone(oldCache), "old transcript dumps and caches are deleted");
check(!gone(freshCache) && fs.existsSync(path.join(process.cwd(), "data/cache/transcripts")), "fresh cache entries and the cache folders themselves are kept");
check(res.deletedFiles >= 5, `reports what it deleted (${res.deletedFiles} files)`);

startCleanupTimer();
startCleanupTimer();
check((globalThis as any).__snipcutCleanupTimer === true, "hourly timer starts (once)");

for (const p of made) {
  try { fs.unlinkSync(p); } catch {}
}
try { fs.rmdirSync(path.join(process.cwd(), "data/music/user")); } catch {}

if (failures) {
  console.log(`\n${failures} check(s) FAILED`);
  process.exit(1);
}
console.log("\nALL CLEANUP CHECKS PASSED");
process.exit(0);
