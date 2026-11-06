/**
 * Highlight reel: stitches the best part of each finished clip into one
 * video with transitions and a title. Checked on generated 9:16 clips:
 * the reel exists, has the expected length, audio and video match, and
 * fewer than 2 clips gives no reel.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { buildHighlightReel } from "../src/lib/highlightReel";
import { getFfmpegBinary } from "../src/lib/videoService";
import { probeDuration } from "../src/lib/clipStyle";

let failures = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`${ok ? "-> PASS" : "-> FAIL"}: ${msg}`);
  if (!ok) failures++;
};

/** Decoded length of one stream (ffmpeg prints progress on stderr). */
const streamLen = (file: string, sel: "v" | "a"): number => {
  const r = spawnSync(getFfmpegBinary(), ["-hide_banner", "-i", file, "-map", `0:${sel}`, "-c", "copy", "-f", "null", "-"], { encoding: "utf8" });
  const all = [...String(r.stderr || "").matchAll(/time=(\d+):(\d+):([\d.]+)/g)];
  const m = all[all.length - 1];
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0;
};

(async () => {
  const dir = path.join(process.cwd(), "data", "test_reel");
  fs.mkdirSync(dir, { recursive: true });
  const clips: string[] = [];
  const colors = ["red", "green", "blue"];
  for (let i = 0; i < 3; i++) {
    const f = path.join(dir, `clip${i}.mp4`);
    execFileSync(getFfmpegBinary(), [
      "-hide_banner", "-loglevel", "error", "-y",
      "-f", "lavfi", "-i", `color=c=${colors[i]}:s=1080x1920:r=30:d=14`,
      "-f", "lavfi", "-i", `sine=f=${300 + i * 100}:d=14`,
      "-shortest", "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p", "-c:a", "aac", f,
    ]);
    clips.push(f);
  }

  const out = path.join(dir, "reel.mp4");
  const res = await buildHighlightReel(
    clips.map((p, i) => ({ path: p, hype: i === 1 ? 9 : undefined })),
    out,
    { W: 1080, H: 1920 }
  );
  check(!!res && fs.existsSync(out), "reel is written");
  check(res?.parts === 3, "all 3 clips are in the reel");
  // 3 parts of min(11, 56/3)=11s, minus two 0.4s transitions = 32.2s.
  const d = await probeDuration(out);
  check(Math.abs(d - 32.2) < 0.6, `reel length is right (${d.toFixed(2)}s, expected ~32.2s)`);
  const vLen = streamLen(out, "v");
  const aLen = streamLen(out, "a");
  check(vLen > 0 && Math.abs(vLen - aLen) < 0.25, `audio and video lengths match (${vLen.toFixed(2)} / ${aLen.toFixed(2)})`);

  const none = await buildHighlightReel([{ path: clips[0] }], path.join(dir, "none.mp4"), { W: 1080, H: 1920 });
  check(none === null, "one clip only: no reel");

  fs.rmSync(dir, { recursive: true, force: true });
  if (failures) {
    console.log(`\n${failures} check(s) FAILED`);
    process.exit(1);
  }
  console.log("\nALL HIGHLIGHT REEL CHECKS PASSED");
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
