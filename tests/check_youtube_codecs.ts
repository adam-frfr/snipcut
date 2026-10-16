import { exec } from "child_process";
import util from "util";
import path from "path";
import fs from "fs";
import { getFfprobeBinary } from "../src/lib/videoService";

const execPromise = util.promisify(exec);

const testVideos = [
  {
    id: "Video 1 (Me at the zoo)",
    url: "https://www.youtube.com/watch?v=jNQXAC9IVRw",
  },
  {
    id: "Video 2 (Big Buck Bunny Public Demo)",
    url: "https://www.youtube.com/watch?v=aqz-KE-bpKQ",
  },
  {
    id: "Video 3 (Blender Tears of Steel 1080p Clip)",
    url: "https://www.youtube.com/watch?v=R6MlUcmOul8",
  },
];

async function checkCodecs() {
  console.log("=== Running YouTube Codec Check (Item 4) ===");
  const downloadDir = path.resolve(process.cwd(), "data", "test_yt_codecs");
  if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir, { recursive: true });

  const binDir = path.resolve(process.cwd(), "bin");
  const ytDlp = path.join(binDir, "yt-dlp.exe");
  const ffprobeBin = getFfprobeBinary();

  const preferredFormat =
    "bestvideo[vcodec^=avc1][height<=1080]+bestaudio[ext=m4a]/bestvideo[vcodec^=avc1][height<=1080]+bestaudio/best[vcodec^=avc1][height<=1080]/bestvideo[height<=1080]+bestaudio/best[height<=1080]/best";

  const results = [];

  for (let i = 0; i < testVideos.length; i++) {
    const item = testVideos[i];
    console.log(`\n[${i + 1}/3] Downloading ${item.id}: ${item.url}...`);
    const outTemplate = path.join(downloadDir, `test_yt_${i + 1}.%(ext)s`);

    const cmd = `"${ytDlp}" --js-runtimes node --ffmpeg-location "${binDir}" -f "${preferredFormat}" --no-warnings --ignore-errors --merge-output-format mp4 -o "${outTemplate}" "${item.url}"`;

    try {
      await execPromise(cmd, { timeout: 120000 });
      const targetMp4 = path.join(downloadDir, `test_yt_${i + 1}.mp4`);

      if (!fs.existsSync(targetMp4)) {
        // Look for any extension
        const found = fs.readdirSync(downloadDir).find((f) => f.startsWith(`test_yt_${i + 1}.`));
        if (found) {
          const actualPath = path.join(downloadDir, found);
          console.log(`Downloaded: ${found}`);
        }
      }

      const probeCmd = `"${ffprobeBin}" -v error -select_streams v:0 -show_entries stream=codec_name,pix_fmt,width,height,r_frame_rate:format=duration -of json "${targetMp4}"`;
      const { stdout } = await execPromise(probeCmd);
      const probeData = JSON.parse(stdout);
      const vStream = probeData.streams?.[0] || {};
      const format = probeData.format || {};

      const res = {
        video: item.id,
        url: item.url,
        codecName: vStream.codec_name || "unknown",
        pixFmt: vStream.pix_fmt || "unknown",
        resolution: `${vStream.width}x${vStream.height}`,
        fps: vStream.r_frame_rate || "unknown",
        durationSec: parseFloat(format.duration || "0").toFixed(2),
        isAvc1: vStream.codec_name === "h264",
      };

      console.log(`-> Probed Result: codec=${res.codecName}, pixFmt=${res.pixFmt}, res=${res.resolution}, duration=${res.durationSec}s`);
      results.push(res);

      // Clean up downloaded file
      if (fs.existsSync(targetMp4)) fs.unlinkSync(targetMp4);
    } catch (err: any) {
      console.warn(`Failed downloading ${item.id}:`, err?.message);
      results.push({
        video: item.id,
        url: item.url,
        error: err?.message,
      });
    }
  }

  // Clean directory
  try {
    fs.rmdirSync(downloadDir);
  } catch (e) {}

  console.log("\n==================================================");
  console.log("             YOUTUBE CODEC CHECK SUMMARY          ");
  console.log("==================================================");
  console.table(results);

  return results;
}

checkCodecs().catch(console.error);
