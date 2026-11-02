import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { probeVideoFormat, getFfmpegBinary } from "../src/lib/videoService";

console.log("=== Running Remux Decision & Fallback Tests ===");

const ffmpegBin = getFfmpegBinary();

// 1. Prepare an H.264 8-bit yuv420p file
const normalPath = path.join(process.cwd(), "data", "normal_h264_8bit.mp4");
if (!fs.existsSync(normalPath)) {
  execFileSync(ffmpegBin, [
    "-f", "lavfi", "-i", "testsrc=duration=2:size=320x240:rate=30",
    "-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
    "-c:v", "libx264", "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-t", "2",
    "-y",
    normalPath,
  ]);
}

// 2. Prepare an incompatible format file (Theora in OGG container)
const incompatiblePath = path.join(process.cwd(), "data", "test_theora.ogg");
if (!fs.existsSync(incompatiblePath)) {
  execFileSync(ffmpegBin, [
    "-f", "lavfi", "-i", "testsrc=duration=2:size=320x240:rate=25",
    "-c:v", "libtheora",
    "-t", "2",
    "-y",
    incompatiblePath,
  ]);
}

async function runTests() {
  // Test probe decision for normal H.264 yuv420p
  console.log("\nProbing standard H.264 file...");
  const normalProbe = await probeVideoFormat(normalPath);
  console.log("Normal file probe result:", {
    codec: normalProbe.codecName,
    pixFmt: normalProbe.pixFmt,
    bits: normalProbe.bitsPerRawSample,
    isH264Yuv420p8Bit: normalProbe.isH264Yuv420p8Bit,
  });
  assert.strictEqual(normalProbe.isH264Yuv420p8Bit, true, "Standard H.264 yuv420p must be eligible for copy remux");
  console.log("-> PASS: Standard H.264 file identified as eligible for copy remux");

  // Perform copy remux
  const remuxOut = path.join(process.cwd(), "data", "normal_remuxed_out.mp4");
  const remuxArgs = ["-y", "-i", normalPath, "-c", "copy", "-movflags", "+faststart", remuxOut];
  const t0 = Date.now();
  execFileSync(ffmpegBin, remuxArgs);
  console.log(`-> Copy remux completed in ${Date.now() - t0}ms -> ${remuxOut}`);
  assert.ok(fs.existsSync(remuxOut), "Remuxed file should exist");
  assert.ok(fs.statSync(remuxOut).size > 1000, "Remuxed file size should be valid");
  console.log("-> PASS: Copy remux succeeded");

  // Test copy remux failure & transcode fallback on incompatible container/codec
  console.log("\nTesting copy remux behavior on incompatible OGG Theora file...");
  const fallbackOut = path.join(process.cwd(), "data", "test_remux_fallback_out.mp4");
  let remuxFailed = false;
  try {
    // Attempting to copy Theora video into MP4 container will fail in ffmpeg
    execFileSync(ffmpegBin, ["-y", "-i", incompatiblePath, "-c", "copy", "-movflags", "+faststart", fallbackOut]);
  } catch (err: any) {
    remuxFailed = true;
    console.log("-> Copy remux rejected incompatible stream as expected (Theora into MP4)");
  }
  assert.ok(remuxFailed, "Copy remuxing Theora into MP4 container must fail and trigger transcode");

  console.log("Executing transcode fallback with libx264 and aac...");
  const transcodeArgs = [
    "-y",
    "-i", incompatiblePath,
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "23",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-b:a", "128k",
    "-movflags", "+faststart",
    fallbackOut,
  ];
  const t1 = Date.now();
  execFileSync(ffmpegBin, transcodeArgs);
  console.log(`-> Transcode fallback completed in ${Date.now() - t1}ms -> ${fallbackOut}`);
  assert.ok(fs.existsSync(fallbackOut), "Transcoded file should exist");
  assert.ok(fs.statSync(fallbackOut).size > 1000, "Transcoded file size should be valid");

  const fallbackProbe = await probeVideoFormat(fallbackOut);
  assert.strictEqual(fallbackProbe.isH264Yuv420p8Bit, true, "Transcoded output must be standard H.264 yuv420p");
  console.log("-> PASS: Transcode fallback produced standard H.264 MP4");

  console.log("\nALL REMUX & FALLBACK TESTS PASSED!\n");
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
