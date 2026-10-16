import { exec } from "child_process";
import util from "util";
import path from "path";
import fs from "fs";
import { getFfprobeBinary } from "../src/lib/videoService";

const execPromise = util.promisify(exec);

// 3 recent public uploads (under 30 days old) + 1 Short
const testVideos = [
  {
    id: "Recent Upload #1",
    title: "NASA's SpaceX Crew-13 Mission Trailer (< 30 days old)",
    url: "https://www.youtube.com/watch?v=ErAqN6gXqZQ",
    type: "Regular Upload",
  },
  {
    id: "Recent Upload #2",
    title: "NASA Moon Base: The First Six Months (< 30 days old)",
    url: "https://www.youtube.com/watch?v=IwZVXmQdX1E",
    type: "Regular Upload",
  },
  {
    id: "Recent Upload #3",
    title: "NASA What It Takes (< 30 days old)",
    url: "https://www.youtube.com/watch?v=90Kgw_SvK4w",
    type: "Regular Upload",
  },
  {
    id: "Recent Short #4",
    title: "NASA Short: From the Moon to the 50-Yard Line",
    url: "https://www.youtube.com/shorts/-62C9R_41Sc",
    type: "YouTube Short",
  },
];

async function checkCodecs() {
  console.log("=== Running YouTube Codec Check: 3 Recent Uploads + 1 Short (Item 6) ===");
  const downloadDir = path.resolve(process.cwd(), "data", "test_yt_codecs");
  if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir, { recursive: true });

  const binDir = path.resolve(process.cwd(), "bin");
  const ytDlp = path.join(binDir, "yt-dlp.exe");
  const ffprobeBin = getFfprobeBinary();

  // Route's identical preferredFormat string from src/app/api/download-youtube/route.ts
  const preferredFormat =
    "bestvideo[vcodec^=avc1][height<=1080]+bestaudio[ext=m4a]/bestvideo[vcodec^=avc1][height<=1080]+bestaudio/best[vcodec^=avc1][height<=1080]/bestvideo[height<=1080]+bestaudio/best[height<=1080]/best";

  console.log("Route Format Selector:", preferredFormat);
  console.log("Environment: Ran from local PC (Windows), not Render.");

  const results = [];

  for (let i = 0; i < testVideos.length; i++) {
    const item = testVideos[i];
    console.log(`\n[${i + 1}/${testVideos.length}] Downloading ${item.id} (${item.type}): ${item.title}`);
    console.log(`URL: ${item.url}`);
    const outTemplate = path.join(downloadDir, `recent_yt_${i + 1}.%(ext)s`);

    const t0 = Date.now();
    const cmd = `"${ytDlp}" --js-runtimes node --ffmpeg-location "${binDir}" -f "${preferredFormat}" --no-warnings --ignore-errors --merge-output-format mp4 -o "${outTemplate}" "${item.url}"`;

    try {
      await execPromise(cmd, { timeout: 180000 });
      const dlDuration = Date.now() - t0;

      let targetMp4 = path.join(downloadDir, `recent_yt_${i + 1}.mp4`);
      if (!fs.existsSync(targetMp4)) {
        const found = fs.readdirSync(downloadDir).find((f) => f.startsWith(`recent_yt_${i + 1}.`));
        if (found) targetMp4 = path.join(downloadDir, found);
      }

      if (!fs.existsSync(targetMp4)) {
        throw new Error(`Downloaded output file not found at ${targetMp4}`);
      }

      const probeCmd = `"${ffprobeBin}" -v error -select_streams v:0 -show_entries stream=codec_name,pix_fmt,width,height,r_frame_rate:format=duration -of json "${targetMp4}"`;
      const { stdout } = await execPromise(probeCmd);
      const probeData = JSON.parse(stdout);
      const vStream = probeData.streams?.[0] || {};
      const format = probeData.format || {};

      const codec = vStream.codec_name;
      const pixFmt = vStream.pix_fmt;
      const width = vStream.width;
      const height = vStream.height;
      const duration = parseFloat(format.duration || "0");
      const isDirectRemuxReady = codec === "h264" && pixFmt === "yuv420p";

      console.log(`-> Downloaded in ${dlDuration}ms: codec=${codec}, pix_fmt=${pixFmt}, res=${width}x${height}, duration=${duration.toFixed(1)}s, directRemux=${isDirectRemuxReady}`);

      results.push({
        id: item.id,
        type: item.type,
        title: item.title,
        codec,
        pixFmt,
        resolution: `${width}x${height}`,
        durationSec: Number(duration.toFixed(1)),
        directRemuxReady: isDirectRemuxReady,
        transcodeNeeded: !isDirectRemuxReady,
        downloadTimeMs: dlDuration,
      });
    } catch (err: any) {
      console.error(`Error downloading ${item.title}:`, err.message);
      results.push({
        id: item.id,
        type: item.type,
        title: item.title,
        codec: "ERROR",
        pixFmt: "N/A",
        resolution: "N/A",
        durationSec: 0,
        directRemuxReady: false,
        transcodeNeeded: true,
        downloadTimeMs: 0,
        error: err.message,
      });
    }
  }

  console.log("\n==================================================");
  console.log("        YOUTUBE CODEC CHECK RESULTS               ");
  console.log("==================================================");
  console.table(results);
}

checkCodecs().catch((err) => {
  console.error("YouTube check error:", err);
  process.exit(1);
});
