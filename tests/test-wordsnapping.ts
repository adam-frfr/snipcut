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
assert.ok(snapped.snappedWords[0].start >= 0, "First word relative start must be >= 0");
console.log("-> PASS: Valid clip snapped accurately with relative words");

// Test 5: Start prefers sentence boundary at or before raw start (within 2.5s)
console.log("\n[Test 5] Preferring sentence boundary at or before raw start within 2.5s...");
// In words: "world." ends at 11.0s. Index 2 "This" at 12.0s is a sentence start.
// rawStart = 12.5s. Closest word is "is" (12.4s, diff 0.1s).
// But "This" (12.0s) is a sentence start at or before rawStart within 2.5s (diff 0.5s <= 2.5s).
// The algorithm should choose "This" (12.0s) instead of mid-sentence "is" (12.4s).
const test5Clips: CuratedClipResult[] = [
  makeClip({
    title: "Sentence Start Preference",
    startTime: 12.5,
    endTime: 18.0,
  }),
];
const result5 = snapAndValidateClips(test5Clips, words, { totalDuration: 30.0 });
assert.strictEqual(result5.length, 1);
console.log(`-> Snapped start: ${result5[0].startTime}s (expected <= 12.0s before "This")`);
assert.ok(result5[0].startTime <= 12.0, "Must choose sentence start 'This' at 12.0s rather than mid-sentence at 12.4s");
console.log("-> PASS: Sentence start at or before raw start correctly preferred");

// Test 6: End prefers sentence boundary at or after raw end
console.log("\n[Test 6] Preferring sentence boundary at or after raw end...");
// In words: "test" is 12.9 - 13.5s. "video." is 13.6 - 14.2s (ends with period).
// rawEnd = 13.2s. Closest word is "test" (diff 0.3s).
// But "video." is a sentence end at or after rawEnd within range (14.2s >= 13.2s).
// The algorithm should choose "video." (14.2s) to cleanly conclude the thought.
const test6Clips: CuratedClipResult[] = [
  makeClip({
    title: "Sentence End Preference",
    startTime: 10.0,
    endTime: 13.2,
  }),
];
const result6 = snapAndValidateClips(test6Clips, words, { totalDuration: 30.0, minDuration: 3.0 });
assert.strictEqual(result6.length, 1);
console.log(`-> Snapped end: ${result6[0].endTime}s (expected >= 14.2s after 'video.')`);
assert.ok(result6[0].endTime >= 14.2, "Must choose sentence end 'video.' at 14.2s rather than cutting off at 'test'");
console.log("-> PASS: Sentence end at or after raw end correctly preferred");

// Test 7: Never shift start later than raw start by more than word-snap padding
console.log("\n[Test 7] Ensuring start is never shifted later than rawStart by > targetPadding...");
// rawStart = 11.1s. "world." ended at 11.0s. Next word "This" starts at 12.0s.
// targetPadding = 0.2s. Max allowed start is 11.1 + 0.2 = 11.3s.
// Snapped start must NOT jump ahead to 11.9s.
const test7Clips: CuratedClipResult[] = [
  makeClip({
    title: "No Late Start Shift",
    startTime: 11.1,
    endTime: 15.0,
  }),
];
const result7 = snapAndValidateClips(test7Clips, words, { totalDuration: 30.0, targetPaddingSec: 0.2 });
assert.strictEqual(result7.length, 1);
console.log(`-> Snapped start: ${result7[0].startTime}s (rawStart: 11.1s, max allowed: 11.3s)`);
assert.ok(
  result7[0].startTime <= 11.1 + 0.2001,
  `Snapped start (${result7[0].startTime}s) must not exceed rawStart + padding (11.3s)`
);
console.log("-> PASS: Start never shifted later than rawStart by more than padding");

console.log("\nALL WORD SNAPPING TESTS PASSED!\n");
