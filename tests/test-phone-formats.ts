import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { probeVideoFormat, getFfmpegBinary } from "../src/lib/videoService";

console.log("=== Running Phone Video Format Tests (VFR & HDR) ===");

const ffmpegBin = getFfmpegBinary();

// 1. Generate an HDR10 test video with smpte2084 color transfer if not already present
const hdrVideoPath = path.join(process.cwd(), "data", "test_hdr10.mov");
if (!fs.existsSync(hdrVideoPath)) {
  console.log("Generating HDR10 sample video (color_transfer smpte2084)...");
  execFileSync(ffmpegBin, [
    "-f", "lavfi", "-i", "testsrc=duration=2:size=320x240:rate=30",
    "-c:v", "libx265",
    "-color_primaries", "bt2020",
    "-color_trc", "smpte2084",
    "-colorspace", "bt2020nc",
    "-pix_fmt", "yuv420p10le",
    "-t", "2",
    "-y",
    hdrVideoPath,
  ]);
}

async function runTests() {
  console.log("\n[Test 1] Probing HDR10 video...");
  const hdrProbe = await probeVideoFormat(hdrVideoPath);
  console.log("HDR Probe result:", {
    codec: hdrProbe.codecName,
    pixFmt: hdrProbe.pixFmt,
    colorTransfer: hdrProbe.colorTransfer,
    isHdr: hdrProbe.isHdr,
    isH264Yuv420p8Bit: hdrProbe.isH264Yuv420p8Bit,
  });

  assert.strictEqual(hdrProbe.isHdr, true, "HDR video with smpte2084 must be detected as isHdr=true");
  assert.strictEqual(hdrProbe.isH264Yuv420p8Bit, false, "HDR video must NOT be eligible for direct copy-remux");
  console.log("-> PASS: HDR10 video detected accurately; copy-remux correctly disabled");

  console.log("\n[Test 2] Testing HDR -> SDR Tone Mapping & CFR Normalization transcode...");
  const sdrOutputPath = path.join(process.cwd(), "data", "test_sdr_tonemapped.mp4");
  const tonemapVf = "scale='min(1920,iw)':-2,zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p";

  const transcodeArgs = [
    "-y",
    "-i", hdrVideoPath,
    "-c:v", "libx264",
    "-preset", "ultrafast",
    "-crf", "23",
    "-fps_mode", "cfr",
    "-r", "30",
    "-vf", tonemapVf,
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    sdrOutputPath,
  ];

  const t0 = Date.now();
  execFileSync(ffmpegBin, transcodeArgs);
  console.log(`-> Tone mapping & CFR transcode finished in ${Date.now() - t0}ms -> ${sdrOutputPath}`);
  assert.ok(fs.existsSync(sdrOutputPath), "Tone-mapped SDR output must exist");

  const sdrProbe = await probeVideoFormat(sdrOutputPath);
  console.log("SDR Output Probe result:", {
    codec: sdrProbe.codecName,
    pixFmt: sdrProbe.pixFmt,
    colorTransfer: sdrProbe.colorTransfer,
    isHdr: sdrProbe.isHdr,
    rFrameRate: sdrProbe.rFrameRate,
    avgFrameRate: sdrProbe.avgFrameRate,
    isVfr: sdrProbe.isVfr,
  });

  assert.strictEqual(sdrProbe.isHdr, false, "Tone-mapped output must no longer be HDR");
  assert.strictEqual(sdrProbe.isVfr, false, "Normalized output must have constant frame rate");
  console.log("-> PASS: Transcoded output is standard 8-bit SDR with constant frame rate (CFR)");

  console.log("\nALL PHONE FORMAT (VFR & HDR) TESTS PASSED!\n");
}

runTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
