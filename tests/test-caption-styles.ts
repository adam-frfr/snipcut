/**
 * Every caption preset must only reference ASS styles that its header
 * defines. A rename once left "Style: Opus" in the header while the
 * default "snipcut" preset's events used "Snipcut", so libass silently
 * fell back to its tiny built-in default style on every default clip.
 */
import { buildKaraokeAss } from "../src/lib/videoService";

const presets = ["hormozi", "neon", "beast", "clean", "kinetic", "snipcut"] as const;
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

if (failures) {
  console.error(`\nCAPTION STYLE FAILURES: ${failures}`);
  process.exit(1);
}
console.log("\nALL CAPTION STYLE TESTS PASSED!");
