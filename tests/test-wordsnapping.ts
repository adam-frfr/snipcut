import assert from "node:assert";
import { snapAndValidateClips } from "../src/lib/wordSnapping";

console.log("=== Running Word Snapping Tests ===");

const words = [
  { word: "Hello", start: 10.0, end: 10.4 },
  { word: "world.", start: 10.5, end: 11.0 },
  { word: "This", start: 12.0, end: 12.3 },
  { word: "is", start: 12.4, end: 12.6 },
  { word: "a", start: 12.7, end: 12.8 },
  { word: "test", start: 12.9, end: 13.5 },
  { word: "video.", start: 13.6, end: 14.2 },
  { word: "Goodbye.", start: 20.0, end: 20.8 },
];

const totalDuration = 25.0;

import { CuratedClipResult } from "../src/lib/aiService";

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

// Test 1: Drop clips starting at or after total video duration
console.log("\n[Test 1] Dropping clips starting at or after total video duration...");
const clipsBeyondEnd: CuratedClipResult[] = [
  makeClip({
    title: "Clip Past End",
    startTime: 25.0,
    endTime: 30.0,
  }),
  makeClip({
    title: "Clip Far Past End",
    startTime: 35.0,
    endTime: 45.0,
  }),
];
const result1 = snapAndValidateClips(clipsBeyondEnd, words, { totalDuration });
assert.strictEqual(result1.length, 0, "Clips starting >= totalDuration must be dropped");
console.log("-> PASS: Clips starting at/after totalDuration correctly dropped (result count = 0)");

// Test 2: Drop clips with no words in range (closest word > 3.5s away)
console.log("\n[Test 2] Dropping clips with no words in range...");
const clipsNoWordsInRange: CuratedClipResult[] = [
  makeClip({
    title: "Empty Intro Segment",
    startTime: 3.0, // closest word is at 10.0s (diff 7.0s > 3.5s)
    endTime: 6.0,
  }),
];
const result2 = snapAndValidateClips(clipsNoWordsInRange, words, { totalDuration });
assert.strictEqual(result2.length, 0, "Clip with closest word > 3.5s away must be dropped");
console.log("-> PASS: Clip with no words in range correctly dropped (result count = 0)");

// Test 3: Drop clips with no words at all in transcript
console.log("\n[Test 3] Dropping clips when words in clip range is empty...");
const result3 = snapAndValidateClips(
  [makeClip({
    title: "Silence Clip",
    startTime: 50.0,
    endTime: 60.0,
  })],
  words,
  { totalDuration: 100.0 }
);
assert.strictEqual(result3.length, 0, "Clip with no words in range must be dropped");
console.log("-> PASS: Clip with no words in range correctly dropped");

// Test 4: Successfully snap valid clips to word boundaries
console.log("\n[Test 4] Valid clip snapping to word boundaries...");
const validClips: CuratedClipResult[] = [
  makeClip({
    title: "Valid Intro",
    startTime: 9.8,
    endTime: 14.5,
  }),
];
const result4 = snapAndValidateClips(validClips, words, { totalDuration, minDuration: 4.0 });
assert.strictEqual(result4.length, 1, "Valid clip should be accepted and snapped");
const snapped = result4[0];
console.log(`-> Snapped start: ${snapped.startTime}s, end: ${snapped.endTime}s`);
assert.ok(snapped.startTime >= 9.5 && snapped.startTime <= 12.0, "Start snapped to nearby sentence or word boundary");
assert.ok(snapped.endTime >= 14.0, "End snapped near boundary");
assert.ok(snapped.snappedWords && snapped.snappedWords.length > 0, "Snapped words must be populated");
// Verify words are shifted relative to snappedStart
assert.ok(snapped.snappedWords[0].start >= 0, "First word relative start must be >= 0");
console.log("-> PASS: Valid clip snapped accurately with relative words");

console.log("\nALL WORD SNAPPING TESTS PASSED!\n");
