import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { renderVideoClip, getFfmpegBinary } from "../src/lib/videoService";

console.log("=== Running Subtitle Time Base Tests ===");

// 1. Ensure a test video of at least 50 seconds exists
const testVideoPath = path.join(process.cwd(), "data", "test_50s_speech.mp4");
if (!fs.existsSync(testVideoPath)) {
  console.log("Generating 50s test video for subtitle alignment verification...");
  const ffmpegBin = getFfmpegBinary();
  execFileSync(ffmpegBin, [
    "-f", "lavfi", "-i", "testsrc=duration=50:size=640x360:rate=30",
    "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
    "-c:v", "libx264", "-preset", "ultrafast",
    "-t", "50",
    "-c:a", "aac",
    "-shortest",
    "-y",
    testVideoPath,
  ]);
  console.log("50s test video generated at:", testVideoPath);
}

// 2. Define a FULL transcript spanning from 0s to 49s
// Words BEFORE 35s:
//   - "Early" (5.0s - 5.5s)
//   - "Intro" (10.0s - 10.8s)
//   - "Midway" (25.0s - 25.7s)
// Words IN CLIP (35s - 45s):
//   - "ClipTarget" (36.0s - 36.8s) -> relative start: 1.0s, end: 1.8s
//   - "Focused" (37.5s - 38.2s)    -> relative start: 2.5s, end: 3.2s
//   - "Active" (42.0s - 43.0s)     -> relative start: 7.0s, end: 8.0s
// Words AFTER 45s:
//   - "Later" (47.0s - 48.0s)
const fullTranscript = [
  { word: "Early", text: "Early", start: 5.0, end: 5.5 },
  { word: "Intro", text: "Intro", start: 10.0, end: 10.8 },
  { word: "Midway", text: "Midway", start: 25.0, end: 25.7 },
  { word: "ClipTarget", text: "ClipTarget", start: 36.0, end: 36.8 },
  { word: "Focused", text: "Focused", start: 37.5, end: 38.2 },
  { word: "Active", text: "Active", start: 42.0, end: 43.0 },
  { word: "Later", text: "Later", start: 47.0, end: 48.0 },
];

const outputDir = path.join(process.cwd(), "public", "rendered_clips");
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}
const clipOutputPath = path.join(outputDir, `test-subtitle-clip-${Date.now()}.mp4`);

console.log("\nCalling renderVideoClip with clip starting at 35.0s (duration 10s)...");
const renderStartTime = Date.now();

async function runTest() {
  const result = await renderVideoClip({
    inputPath: testVideoPath,
    outputPath: clipOutputPath,
    startTime: 35.0,
    duration: 10.0,
    aspectRatio: "9:16",
    reframeMode: "center",
    transcript: fullTranscript,
    captionStyle: "hormozi",
  });

  console.log(`Render completed in ${Date.now() - renderStartTime}ms`);
  console.log("Rendered clip path:", result.outputPath);
  assert.ok(fs.existsSync(result.outputPath), "Rendered video clip must exist on disk");

  // Read saved srt from data/debug/last_subtitles.srt
  const debugSrt = path.join(process.cwd(), "data", "debug", "last_subtitles.srt");
  assert.ok(fs.existsSync(debugSrt), "Debug SRT must have been written");
  const srtContent = fs.readFileSync(debugSrt, "utf8");
  console.log("\nGenerated SRT subtitles for clip [35.0s - 45.0s]:");
  console.log("--------------------------------------------------");
  console.log(srtContent.trim());
  console.log("--------------------------------------------------");

  // Verifications:
  // 1. Confirm NO earlier words appear at t=0
  assert.ok(!srtContent.includes("EARLY"), "Earlier word 'EARLY' (t=5s) must NOT appear in clip starting at 35s");
  assert.ok(!srtContent.includes("INTRO"), "Earlier word 'INTRO' (t=10s) must NOT appear in clip starting at 35s");
  assert.ok(!srtContent.includes("MIDWAY"), "Earlier word 'MIDWAY' (t=25s) must NOT appear in clip starting at 35s");
  console.log("-> PASS: Confirmed no earlier words (Early, Intro, Midway) appear in clip subtitles");

  // 2. Confirm later words outside range do NOT appear
  assert.ok(!srtContent.includes("LATER"), "Later word 'LATER' (t=47s) must NOT appear in clip ending at 45s");
  console.log("-> PASS: Confirmed later word 'Later' (t=47s) does not appear in clip subtitles");

  // 3. Confirm words in range DO appear
  assert.ok(srtContent.includes("CLIPTARGET"), "Word 'CLIPTARGET' must appear in clip subtitles");
  assert.ok(srtContent.includes("FOCUSED"), "Word 'FOCUSED' must appear in clip subtitles");
  assert.ok(srtContent.includes("ACTIVE"), "Word 'ACTIVE' must appear in clip subtitles");
  console.log("-> PASS: Confirmed target words (CLIPTARGET, FOCUSED, ACTIVE) appear in subtitles");

  // 4. Confirm start timing of first word is relative to 0:
  // ClipTarget started at 36.0s in absolute time, clip started at 35.0s -> relative start is 1.00s (00:00:01,000)
  assert.ok(
    srtContent.includes("00:00:01,000"),
    `CLIPTARGET should start at relative 1.000s, found: ${srtContent}`
  );
  console.log("-> PASS: Confirmed first word start time shifted by 35s to relative 00:00:01,000 (t >= 0)");

  console.log("\nALL SUBTITLE TIME BASE TESTS PASSED!\n");
}

runTest().catch((err) => {
  console.error("Subtitle test error:", err);
  process.exit(1);
});
