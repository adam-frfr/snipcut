/**
 * Editor timeline + pro caption features.
 *
 * - Deleted words (editor) are cut exactly, with or without silence
 *   removal; pauses are kept when silence removal is off.
 * - Source <-> output time mapping round-trips across cuts, so the
 *   editor's transcript lines up with a tightened video.
 * - Captions: AI keyword words get the highlight colour, the hook title
 *   is a separate top-card event that is NOT clipped by the karaoke
 *   overlap fix, and split-screen spans put captions mid-screen.
 */
import { computeKeepRanges, toOutputTime, toSourceTime, wordsOnOutput, keptDuration, inSpokenOrder } from "../src/lib/timeline";
import { buildKaraokeAss, keywordSet, wrapTitle } from "../src/lib/videoService";

let failures = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`${ok ? "-> PASS" : "-> FAIL"}: ${msg}`);
  if (!ok) failures++;
};
const near = (a: number, b: number, eps = 0.011) => Math.abs(a - b) <= eps;

// 10 words, 0.4s apart, one long pause after word 5, a filler at word 7.
const texts = ["So", "here", "is", "the", "thing.", "Um", "you", "need", "to", "ship."];
const words = texts.map((text, i) => {
  const start = 100 + i * 0.4 + (i >= 5 ? 1.2 : 0);
  return { text, start, end: start + 0.3 };
});

// ---- 1. deletions only (silence removal OFF): pauses and fillers stay ---
{
  const edited = words.map((w, i) => (i === 2 || i === 3 ? { ...w, deleted: true } : w));
  const { ranges, deletedRemoved, fillersRemoved } = computeKeepRanges(edited, 99.5, 105.5, {
    pauseGap: Infinity,
    cutFillers: false,
    tightEdges: false,
  });
  check(ranges.length === 2, `deleting 2 words splits the clip into 2 ranges (got ${ranges.length})`);
  check(near(ranges[0].start, 99.5) && near(ranges[1].end, 105.5), "window edges kept when silence removal is off");
  check(ranges[0].end <= words[2].start + 0.001, `cut starts at the deleted word (${ranges[0].end.toFixed(2)} <= ${words[2].start.toFixed(2)})`);
  check(ranges[1].start >= words[3].end - 0.001, `cut ends after the deleted word (${ranges[1].start.toFixed(2)} >= ${words[3].end.toFixed(2)})`);
  check(deletedRemoved === 2 && fillersRemoved === 0, "2 deleted, the um/filler kept (removal off)");
  const out = wordsOnOutput(edited, ranges);
  check(out.length === 8 && !out.some((w) => w.text === "is" || w.text === "the"), "deleted words are gone from the captions");
}

// ---- 2. deletions + silence removal ----------------------------------
{
  const edited = words.map((w, i) => (i === 8 ? { ...w, deleted: true } : w));
  const { ranges, fillersRemoved, deletedRemoved } = computeKeepRanges(edited, 99.5, 105.5);
  check(fillersRemoved === 1 && deletedRemoved === 1, `filler + deleted word both cut (${fillersRemoved}, ${deletedRemoved})`);
  check(ranges.length >= 3, `pause, filler and deletion each split the clip (${ranges.length} ranges)`);
  for (let i = 1; i < ranges.length; i++) {
    if (ranges[i].start < ranges[i - 1].end) {
      check(false, `ranges overlap at ${i}`);
    }
  }
  // Round trip: every kept word maps to output and back.
  let worst = 0;
  for (const w of wordsOnOutput(edited, ranges)) {
    const src = toSourceTime(ranges, w.start);
    const orig = edited.find((x) => x.text === w.text)!;
    worst = Math.max(worst, Math.abs(src - Math.max(orig.start, ranges.find((r) => src >= r.start - 0.01 && src <= r.end + 0.01)?.start ?? orig.start)));
  }
  check(worst < 0.02, `source -> output -> source round-trips (worst ${worst.toFixed(3)}s)`);
  const total = keptDuration(ranges);
  check(near(toOutputTime(ranges, 1000), total), "times after the clip map to its end");
  check(toOutputTime(ranges, 0) === 0, "times before the clip map to 0");
}

// ---- 2b. spoken order survives out-of-order Whisper timestamps ------------
{
  const ws = inSpokenOrder([
    { text: "time", start: 47.56, end: 47.84 },
    { text: "to", start: 47.86, end: 47.96 },
    { text: "work", start: 47.98, end: 48.3 },
    { text: "because", start: 47.7, end: 48.46 },
    { text: "everyone", start: 48.48, end: 48.78 },
  ]);
  const caps = buildKaraokeAss(ws, "snipcut", 500)
    .split("\n")
    .filter((l) => l.startsWith("Dialogue:"));
  const order = ws.map((w) => w.text).join(" ");
  check(order === "time to work because everyone", `word order kept (${order})`);
  check(ws.every((w, i) => i === 0 || w.start >= ws[i - 1].start), "start times are non-decreasing");
  check(!caps.some((l) => /BECAUSE TO WORK/.test(l)), "no caption reads 'BECAUSE TO WORK'");
}

// ---- 3. captions: keywords, hook, centre on split ------------------------
{
  const cw = [
    { text: "Deep", start: 0.2, end: 0.5 },
    { text: "work", start: 0.5, end: 0.8 },
    { text: "at", start: 0.8, end: 1.0 },
    { text: "3", start: 1.0, end: 1.2 },
    { text: "a.m.", start: 1.2, end: 1.6 },
    { text: "changes", start: 1.8, end: 2.2 },
    { text: "everything.", start: 2.2, end: 2.9 },
    { text: "Trust", start: 3.4, end: 3.7 },
    { text: "me.", start: 3.7, end: 4.0 },
  ];
  const kw = keywordSet(["deep work", "the night owl"]);
  check(kw.has("deep") && kw.has("work") && kw.has("night") && !kw.has("the"), "key phrases split into words, stopwords dropped");
  check(wrapTitle("Why 3 AM is the best time to do deep work", 16).every((l) => l.length <= 16), "hook title wraps to the line budget");

  for (const style of ["snipcut", "hormozi", "kinetic", "beast", "neon"] as const) {
    const ass = buildKaraokeAss(cw, style, 500, { x: 1080, y: 1920 }, {
      keywords: ["deep work"],
      hook: { text: "3 AM deep work 🔥 changes everything" },
      centerSpans: [{ start: 3.3, end: 10 }],
    });
    const hook = ass.split("\n").filter((l) => l.startsWith("Dialogue:") && l.includes(",Hook,"));
    check(hook.length === 1 && !hook[0].includes("🔥"), `${style}: one hook title event, emoji stripped`);
    const hookEnd = hook[0]?.split(",")[2] || "";
    check(hookEnd === "0:00:03.20", `${style}: hook stays up for its full time, not clipped by the first caption (ends ${hookEnd})`);
    check(/Style: Hook,.*,3,\d+,0,8,/.test(ass), `${style}: hook is a boxed top-centre card`);
    const caps = ass.split("\n").filter((l) => l.startsWith("Dialogue:") && !l.includes(",Hook,"));
    const kwColor = style === "neon" ? "&H0000E5FF" : style === "beast" ? "&H00303BFF" : "&H006BE322";
    check(caps.some((l) => l.includes(kwColor)), `${style}: keyword / number words use the highlight colour`);
    const late = caps.filter((l) => l.split(",")[1] >= "0:00:03.40");
    const early = caps.filter((l) => l.split(",")[1] < "0:00:03.00");
    check(late.length > 0 && late.every((l) => l.includes("\\an5") || style === "kinetic"), `${style}: captions in the split span sit mid-screen`);
    check(early.every((l) => !l.includes("\\an5")), `${style}: captions outside the split stay at their normal height`);
  }
  // Long hook titles shrink to fit instead of being cut off mid-sentence.
  const longHook = "Meet the brand-new 2025 iPhone 16e — and why it's no longer a budget phone at all";
  const lh = buildKaraokeAss(cw, "snipcut", 500, { x: 1080, y: 1920 }, { hook: { text: longHook } })
    .split("\n")
    .find((l) => l.includes(",Hook,")) || "";
  const shown = lh.replace(/\{[^}]*\}/g, "").split(",,").pop()!.replace(/\\N/g, " ");
  check(shown.includes("budget phone at all") && (lh.match(/\\N/g) || []).length <= 2, `long hook title kept whole in <=3 lines ("${shown}")`);

  const clean = buildKaraokeAss(cw, "clean", 500, { x: 1080, y: 1920 }, { keywords: ["deep work"] });
  check(!clean.includes("&H006BE322"), "clean style stays minimal (no keyword colour)");
}

if (failures) {
  console.error(`\nEDITOR TIMELINE / CAPTION FEATURE FAILURES: ${failures}`);
  process.exit(1);
}
console.log("\nALL EDITOR TIMELINE & CAPTION FEATURE TESTS PASSED!");
