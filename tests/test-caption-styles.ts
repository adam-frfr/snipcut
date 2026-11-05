/**
 * Every caption preset must only reference ASS styles that its header
 * defines. A rename once left "Style: Opus" in the header while the
 * default "snipcut" preset's events used "Snipcut", so libass silently
 * fell back to its tiny built-in default style on every default clip.
 */
import { buildKaraokeAss, CAPTION_STYLES } from "../src/lib/videoService";

const presets = CAPTION_STYLES;
const words = ["This", "is", "how", "you", "win.", "Every", "single", "time."].map((text, i) => ({
  text,
  start: 0.2 + i * 0.4,
  end: 0.55 + i * 0.4,
}));

let failures = 0;
for (const preset of presets) {
  const ass = buildKaraokeAss(words, preset, 500);
  const defined = new Set([...ass.matchAll(/^Style: ([^,]+),/gm)].map((m) => m[1]));
  const used = new Set([...ass.matchAll(/^Dialogue: [^,]*,[^,]*,[^,]*,([^,]+),/gm)].map((m) => m[1]));
  const missing = [...used].filter((s) => !defined.has(s));
  const ok = used.size > 0 && missing.length === 0;
  console.log(
    `${ok ? "-> PASS" : "-> FAIL"}: "${preset}" uses [${[...used].join(", ")}]` +
      (missing.length ? ` — undefined: ${missing.join(", ")}` : used.size ? "" : " — no caption events")
  );
  if (!ok) failures++;
}

// Overlapping word timings (fast speech: each word padded to 0.3s while
// words start every 0.18s) must never put two caption events on screen at
// once — libass stacks them, showing the same line twice.
const fast = ["a", "small", "few", "hours", "and", "then", "I", "need", "some", "breaks."].map((text, i) => ({
  text,
  start: 1 + i * 0.18,
  end: 1 + i * 0.18 + 0.3,
}));
const t = (s: string) => {
  const [h, m, sec] = s.split(":");
  return Number(h) * 3600 + Number(m) * 60 + Number(sec);
};
for (const preset of presets) {
  const ass = buildKaraokeAss(fast, preset, 500);
  const evs = [...ass.matchAll(/^Dialogue: [^,]*,([^,]*),([^,]*),/gm)]
    .map((m) => ({ s: t(m[1]), e: t(m[2]) }))
    .sort((a, b) => a.s - b.s);
  let overlaps = 0;
  for (let i = 1; i < evs.length; i++) if (evs[i].s < evs[i - 1].e - 0.001) overlaps++;
  const ok = evs.length > 0 && overlaps === 0;
  console.log(`${ok ? "-> PASS" : "-> FAIL"}: "${preset}" fast speech: ${evs.length} events, ${overlaps} overlapping`);
  if (!ok) failures++;
}

if (failures) {
  console.error(`\nCAPTION STYLE FAILURES: ${failures}`);
  process.exit(1);
}
console.log("\nALL CAPTION STYLE TESTS PASSED!");
