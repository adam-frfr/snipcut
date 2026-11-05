/**
 * Cut accuracy & A/V sync.
 *
 * Source: 20s black video that flashes white for 0.1s at every whole
 * second, with a 0.1s beep at exactly the same moments. A mixed-layout
 * (crop / fit / crop) render must keep every flash on its beep
 * (picture/sound sync), the offset must not grow across layout joins
 * (drift), and the clip must be the requested length.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import {
  renderSegmentedClip,
  cutKeepRanges,
  getFfmpegBinary,
  getFfprobeBinary,
} from "../src/lib/videoService";

const ff = getFfmpegBinary();
const fp = getFfprobeBinary();
const dataDir = path.join(process.cwd(), "data");
fs.mkdirSync(dataDir, { recursive: true });
const src = path.join(dataDir, "test_flash_beeps_20s.mp4");

if (!fs.existsSync(src)) {
  execFileSync(ff, [
    "-hide_banner", "-loglevel", "error",
    "-f", "lavfi", "-i", "color=c=black:s=1280x720:r=30:d=20,drawbox=enable='lt(mod(t\\,1)\\,0.1)':x=0:y=0:w=iw:h=ih:color=white:t=fill",
    "-f", "lavfi", "-i", "aevalsrc='if(lt(mod(t\\,1)\\,0.1)\\,0.8*sin(2*PI*1000*t)\\,0)':s=44100:d=20",
    "-c:v", "libx264", "-preset", "ultrafast", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "128k", "-shortest", "-y", src,
  ]);
}

function streamDur(file: string, sel: "v:0" | "a:0"): number {
  const out = execFileSync(fp, [
    "-v", "error", "-select_streams", sel, "-show_entries", "packet=pts_time,duration_time",
    "-of", "csv=p=0", file,
  ], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  let end = 0;
  for (const line of out.trim().split(/\r?\n/)) {
    const [pts, dur] = line.split(",").map(Number);
    if (Number.isFinite(pts)) end = Math.max(end, pts + (Number.isFinite(dur) ? dur : 0));
  }
  return end;
}

/** Audio: beep onsets (end of each silence). */
function beepOnsets(file: string): number[] {
  const r = spawnSync(ff, ["-hide_banner", "-i", file, "-af", "silencedetect=n=-30dB:d=0.15", "-f", "null", "-"], { encoding: "utf8" });
  return [...String(r.stderr || "").matchAll(/silence_end: ([0-9.]+)/g)].map((m) => Number(m[1]));
}

/** Video: flash onsets (end of each black stretch). */
function flashOnsets(file: string): number[] {
  const r = spawnSync(ff, ["-hide_banner", "-i", file, "-vf", "blackdetect=d=0.1:pix_th=0.2:pic_th=0.9", "-an", "-f", "null", "-"], { encoding: "utf8" });
  return [...String(r.stderr || "").matchAll(/black_end:([0-9.]+)/g)].map((m) => Number(m[1]));
}

async function main() {
  const failures: string[] = [];
  const check = (cond: boolean, msg: string) => {
    console.log(`${cond ? "-> PASS" : "-> FAIL"}: ${msg}`);
    if (!cond) failures.push(msg);
  };

  /** Pair each flash with the nearest beep; report picture-vs-sound offsets. */
  const checkSync = (label: string, file: string, minPairs: number) => {
    // A black stretch that ends because the FILE ends is not a flash.
    const end = streamDur(file, "v:0");
    const flashes = flashOnsets(file).filter((t) => t < end - 0.1);
    const beeps = beepOnsets(file);
    const offs = flashes
      .map((f) => {
        const b = beeps.reduce((best, x) => (Math.abs(x - f) < Math.abs(best - f) ? x : best), Infinity);
        return b - f;
      })
      .filter((o) => Math.abs(o) < 0.5);
    console.log(`${label}: ${flashes.length} flashes, ${beeps.length} beeps; sound-minus-picture (ms): ${offs.map((o) => Math.round(o * 1000)).join(", ")}`);
    check(offs.length >= minPairs, `${label}: found ${offs.length} flash/beep pairs (need ${minPairs})`);
    if (!offs.length) return;
    const worst = Math.max(...offs.map(Math.abs));
    const drift = Math.max(...offs) - Math.min(...offs);
    // One frame at 30fps is 33ms; lip-sync errors under ~45ms are invisible.
    check(worst < 0.045, `${label}: picture and sound within 45ms (worst ${Math.round(worst * 1000)}ms)`);
    check(drift < 0.02, `${label}: no drift across cuts (spread ${Math.round(drift * 1000)}ms)`);
  };

  // ---- 1. Mixed-layout (segmented) render: crop / fit / crop ----------
  {
    const out = path.join(dataDir, "test_cut_segmented.mp4");
    const duration = 12.0;
    await renderSegmentedClip({
      input: src,
      output: out,
      startTime: 2.5,
      segments: [
        { start: 0, end: 3.3, layout: "crop" },
        { start: 3.3, end: 7.7, layout: "fit" },
        { start: 7.7, end: 12.0, layout: "crop" },
      ],
      cropFilter: "crop=405:720:437:0,scale=1080:1920",
      videoW: 1280,
      videoH: 720,
      subtitleFilterStr: null,
    });
    const v = streamDur(out, "v:0");
    const a = streamDur(out, "a:0");
    console.log(`segmented: video=${v.toFixed(3)}s audio=${a.toFixed(3)}s`);
    check(Math.abs(v - duration) < 0.05, `segmented video length ${v.toFixed(3)}s ≈ ${duration}s`);
    check(Math.abs(a - v) < 0.05, `segmented audio length matches video (${a.toFixed(3)} vs ${v.toFixed(3)})`);
    checkSync("segmented", out, 11);
  }

  // ---- 2. Silence removal: cut keep-ranges out of one render and join --
  // (4 pieces, odd edges that are not on the frame grid). Every flash must
  // still land on its beep after the joins, with no drift, and audio and
  // video must stay exactly the same length.
  {
    const out = path.join(dataDir, "test_cut_tightened.mp4");
    const joined = await cutKeepRanges(src, out, [
      { start: 0.83, end: 2.31 },
      { start: 3.97, end: 5.42 },
      { start: 6.88, end: 8.61 },
      { start: 9.96, end: 11.57 },
    ]);
    const v = streamDur(out, "v:0");
    const a = streamDur(out, "a:0");
    console.log(`tightened: reported=${joined.toFixed(3)}s video=${v.toFixed(3)}s audio=${a.toFixed(3)}s`);
    check(Math.abs(v - joined) < 0.04, `tightened video length ${v.toFixed(3)}s matches kept time ${joined.toFixed(3)}s`);
    check(Math.abs(a - v) < 0.03, `tightened audio length matches video (${a.toFixed(3)} vs ${v.toFixed(3)})`);
    checkSync("tightened", out, 8);
  }

  if (failures.length) {
    console.error(`\nCUT ACCURACY FAILURES: ${failures.length}`);
    process.exit(1);
  }
  console.log("\nALL CUT ACCURACY TESTS PASSED!");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
