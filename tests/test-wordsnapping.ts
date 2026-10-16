import assert from "node:assert";
import { snapAndValidateClips } from "../src/lib/wordSnapping";
import { CuratedClipResult } from "../src/lib/aiService";

console.log("=== Running Word Snapping Tests (Item 1 & Regressions) ===");

function makeClip(partial: Partial<CuratedClipResult> & { startTime: number; endTime: number; title: string }): CuratedClipResult {
  return {
    hookHeadline: partial.title,
    durationFormatted: "0:05",
    viralityScore: 90,
    hookStrength: 85,
    engagementScore: 88,
    trendMatch: 80,
    viralityReason: "High emotional resonance",
    keyPhrases: ["test"],
    suggestedEmojis: ["🔥"],
    ...partial,
  };
}

// Words fixture including sentence boundaries and the exact pattern from real run:
// "...hooper." (ends with period at 40.44s) -> "Ain't..." (starts next sentence at 40.70s)
const words = [
  { word: "Intro", start: 0.00, end: 1.00 },
  { word: "play", start: 37.00, end: 37.50 },
  { word: "against", start: 37.50, end: 38.50 },
  { word: "D1", start: 38.60, end: 39.30 },
  { word: "female", start: 39.40, end: 39.98 },
  { word: "hooper.", start: 39.98, end: 40.44 },
  { word: "Ain't", start: 40.70, end: 41.20 },
  { word: "no", start: 41.20, end: 41.50 },
  { word: "way", start: 41.50, end: 42.00 },
  { word: "bro.", start: 42.00, end: 42.50 },
  { word: "She", start: 43.00, end: 43.40 },
  { word: "can", start: 43.40, end: 43.70 },
  { word: "hoop.", start: 43.70, end: 44.50 },
  { word: "Done.", start: 50.00, end: 50.80 },
  // Gap between 50.8s and 94.0s
  { word: "Editing", start: 94.74, end: 95.20 },
  { word: "this", start: 95.20, end: 95.60 },
  { word: "out.", start: 95.60, end: 96.00 },
  // Gap between 96.0s and 127.0s
  { word: "Last", start: 127.50, end: 128.00 },
  { word: "second.", start: 128.00, end: 129.50 },
];

const totalDuration = 130.0;

// Test 1: A start boundary is the word AFTER a sentence-ending word, not the punctuated word itself
// Test: "...hooper." "Ain't..." with rawStart=40.0s must start at "Ain't" (40.7s), NOT "hooper." (39.98s)
console.log("\n[Test 1] Start boundary after sentence-ending word (never start on punctuated word)...");
const clip1 = makeClip({
  title: "Hooper sentence test",
  startTime: 40.0,
  endTime: 45.0,
});
const result1 = snapAndValidateClips([clip1], words, { totalDuration, minDuration: 3.0 });
assert.strictEqual(result1.length, 1, "Clip must be accepted");
console.log(`-> Raw start: 40.0s, Snapped start: ${result1[0].startTime}s, First word: "${result1[0].snappedWords[0]?.word}"`);
assert.strictEqual(
  result1[0].snappedWords[0]?.word,
  "Ain't",
  `First word must be "Ain't", not "hooper."`
);
assert.ok(
  result1[0].startTime >= 40.5 && result1[0].startTime <= 40.75,
  `Snapped start must be aligned with "Ain't" (~40.7s), got ${result1[0].startTime}s`
);
console.log("-> PASS: Start boundary correctly snapped to 'Ain't' after 'hooper.'");

// Test 2: Never move start or end more than 3s from raw value (Regression test: raw [118, 130] must NOT become [94.74, 130.01])
console.log("\n[Test 2] Max 3s shift limit & regression test on raw [118, 130]...");
const clip2 = makeClip({
  title: "Regression [118, 130]",
  startTime: 118.0,
  endTime: 130.0,
});
const result2 = snapAndValidateClips([clip2], words, { totalDuration, maxShiftSec: 3.0 });
// No words exist within 3s of 118.0s (closest is 96.0s or 127.5s, diff > 9s)
// Therefore, the clip MUST BE DROPPED, and MUST NOT shift back to 94.74s!
assert.strictEqual(result2.length, 0, "Clip starting at 118s must be dropped because no words exist within 3s");
console.log("-> PASS: Raw [118, 130] correctly dropped (did not jump to 94.74s)");

// Test 2b: Nearest word within 3s is accepted when no sentence boundary exists
console.log("\n[Test 2b] Snap to nearest word within 3s when no sentence boundary is in range...");
const clip2b = makeClip({
  title: "Nearest word in range",
  startTime: 41.0, // "Ain't" is 40.7, "no" is 41.2
  endTime: 44.0,
});
const result2b = snapAndValidateClips([clip2b], words, { totalDuration, minDuration: 2.0 });
assert.strictEqual(result2b.length, 1);
assert.ok(
  Math.abs(result2b[0].startTime - 41.0) <= 3.0,
  "Start must not move > 3s from raw value"
);
console.log(`-> Snapped start: ${result2b[0].startTime}s (diff: ${Math.abs(result2b[0].startTime - 41.0).toFixed(2)}s <= 3.0s)`);
console.log("-> PASS: Snapped to word within 3s limit");

// Test 3: Clamp end to totalDuration exactly
console.log("\n[Test 3] Clamp end to totalDuration exactly...");
const clip3 = makeClip({
  title: "Clamp to duration",
  startTime: 125.0,
  endTime: 135.0, // totalDuration is 130.0
});
const result3 = snapAndValidateClips([clip3], words, { totalDuration, minDuration: 2.0 });
assert.strictEqual(result3.length, 1);
assert.strictEqual(
  result3[0].endTime,
  130.0,
  `End must be clamped to totalDuration (130.0) exactly, got ${result3[0].endTime}`
);
console.log(`-> Raw end: 135.0s, Clamped end: ${result3[0].endTime}s (totalDuration: ${totalDuration}s)`);
console.log("-> PASS: End clamped to totalDuration exactly");

// Test 4: Overlap resolution: clips may not overlap by more than 0.5s: trim later clip's start or drop it
console.log("\n[Test 4] Clips may not overlap by more than 0.5s (trim later clip's start or drop)...");
const overlappingClips: CuratedClipResult[] = [
  makeClip({
    title: "Earlier Clip",
    startTime: 40.0,
    endTime: 44.0,
  }),
  makeClip({
    title: "Later Overlapping Clip (trimmable)",
    startTime: 42.5, // Overlaps by 1.5s (> 0.5s)
    endTime: 50.8,
  }),
  makeClip({
    title: "Later Overlapping Clip (untrimmable / too short)",
    startTime: 43.0,
    endTime: 44.5, // trimmed duration would be 44.5 - 44.0 = 0.5s < minDuration (3s)
  }),
];

const result4 = snapAndValidateClips(overlappingClips, words, { totalDuration, minDuration: 3.0 });
assert.strictEqual(result4.length, 2, "Second clip trimmed, third clip dropped");
console.log(`-> Accepted Clip #1: [${result4[0].startTime}s - ${result4[0].endTime}s] "${result4[0].title}"`);
console.log(`-> Accepted Clip #2: [${result4[1].startTime}s - ${result4[1].endTime}s] "${result4[1].title}"`);

const overlap = Number((result4[0].endTime - result4[1].startTime).toFixed(2));
assert.ok(
  overlap <= 0.5,
  `Overlap (${overlap}s) between adjacent clips must be <= 0.5s`
);
assert.strictEqual(
  result4[1].startTime,
  result4[0].endTime,
  `Later clip start must be trimmed to earlier clip's end (${result4[0].endTime}s)`
);
console.log("-> PASS: Later overlapping clip's start trimmed to prevent >0.5s overlap, untrimmable clip dropped");

console.log("\nALL WORD SNAPPING FIXES & REGRESSION TESTS PASSED!\n");
