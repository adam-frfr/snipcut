import { getFfmpegBinary } from "../src/lib/videoService";
import { execFile } from "child_process";
import util from "util";
import fs from "fs";
import path from "path";

const execFilePromise = util.promisify(execFile);

async function runBenchmark() {
  const inputFile = path.resolve(process.cwd(), "data", "real_speech_2min.mp4");
  const ffmpegBin = getFfmpegBinary();
  const out1080 = path.resolve(process.cwd(), "data", "benchmark_1080p.mp4");
  const out720 = path.resolve(process.cwd(), "data", "benchmark_720p.mp4");

  if (fs.existsSync(out1080)) fs.unlinkSync(out1080);
  if (fs.existsSync(out720)) fs.unlinkSync(out720);

  console.log("=== Benchmarking Upload Transcode: 1080p vs 720p ===");
  console.log(`Input: ${inputFile} (130.0s, 1080p AV1)`);

  // 1080p Transcode
  console.log("\n[Stage: 1080p Transcode] Starting...");
  const t0_1080 = Date.now();
  await execFilePromise(ffmpegBin, [
    "-y",
    "-i", inputFile,
    "-vf", "scale='min(1920,iw)':-2",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "23",
    "-pix_fmt", "yuv420p",
    "-r", "30",
    "-c:a", "aac",
    "-b:a", "128k",
    "-movflags", "+faststart",
    out1080
  ]);
  const dur1080 = Date.now() - t0_1080;
  const size1080 = fs.statSync(out1080).size;
  console.log(`[Stage: 1080p Transcode] Completed in ${dur1080}ms (${(dur1080/1000).toFixed(2)}s), size: ${(size1080/(1024*1024)).toFixed(2)} MB`);

  // 720p Transcode
  console.log("\n[Stage: 720p Transcode] Starting...");
  const t0_720 = Date.now();
  await execFilePromise(ffmpegBin, [
    "-y",
    "-i", inputFile,
    "-vf", "scale='min(1280,iw)':-2",
    "-c:v", "libx264",
    "-preset", "veryfast",
    "-crf", "23",
    "-pix_fmt", "yuv420p",
    "-r", "30",
    "-c:a", "aac",
    "-b:a", "128k",
    "-movflags", "+faststart",
    out720
  ]);
  const dur720 = Date.now() - t0_720;
  const size720 = fs.statSync(out720).size;
  console.log(`[Stage: 720p Transcode] Completed in ${dur720}ms (${(dur720/1000).toFixed(2)}s), size: ${(size720/(1024*1024)).toFixed(2)} MB`);

  console.log("\n=== Benchmark Summary ===");
  console.log(`1080p: ${dur1080}ms | ${(size1080/(1024*1024)).toFixed(2)} MB`);
  console.log(`720p:  ${dur720}ms | ${(size720/(1024*1024)).toFixed(2)} MB`);
  console.log(`Speedup (720p vs 1080p): ${((dur1080 / dur720)).toFixed(2)}x faster (${((1 - dur720 / dur1080) * 100).toFixed(1)}% time reduction)`);
  console.log(`Size reduction: ${((1 - size720 / size1080) * 100).toFixed(1)}% smaller`);

  // Clean up benchmark files
  if (fs.existsSync(out1080)) fs.unlinkSync(out1080);
  if (fs.existsSync(out720)) fs.unlinkSync(out720);
}

runBenchmark().catch(console.error);
