import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import path from "path";
import fs from "fs";
import util from "util";

const execPromise = util.promisify(exec);

function getYtDlpCommand() {
  const localBin = path.join(process.cwd(), "bin", "yt-dlp.exe");
  if (fs.existsSync(localBin)) {
    return `"${localBin}"`;
  }
  return "yt-dlp";
}

/**
 * Simple parser for VTT subtitles into timestamped segments
 */
function parseVttToTranscript(vttContent: string) {
  const lines = vttContent.split(/\r?\n/);
  const segments: { start: number; end: number; text: string }[] = [];
  let currentStart = 0;
  let currentEnd = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    const timeMatch = line.match(/(\d{2}):(\d{2}):(\d{2})\.(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})\.(\d{3})/);
    if (timeMatch) {
      const h1 = parseInt(timeMatch[1], 10);
      const m1 = parseInt(timeMatch[2], 10);
      const s1 = parseInt(timeMatch[3], 10);
      const ms1 = parseInt(timeMatch[4], 10);
      currentStart = h1 * 3600 + m1 * 60 + s1 + ms1 / 1000;

      const h2 = parseInt(timeMatch[5], 10);
      const m2 = parseInt(timeMatch[6], 10);
      const s2 = parseInt(timeMatch[7], 10);
      const ms2 = parseInt(timeMatch[8], 10);
      currentEnd = h2 * 3600 + m2 * 60 + s2 + ms2 / 1000;

      // The next lines until empty line are the caption text
      let textLines = [];
      i++;
      while (i < lines.length && lines[i].trim() !== "") {
        textLines.push(lines[i].trim().replace(/<[^>]*>/g, ""));
        i++;
      }
      const text = textLines.join(" ").trim();
      if (text) {
        segments.push({ start: currentStart, end: currentEnd, text });
      }
    }
  }

  return segments;
}

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();

    if (!url) {
      return NextResponse.json({ error: "YouTube URL is required" }, { status: 400 });
    }

    const downloadDir = path.join(process.cwd(), "public", "downloads");
    if (!fs.existsSync(downloadDir)) {
      fs.mkdirSync(downloadDir, { recursive: true });
    }

    const filePrefix = `yt-${Date.now()}`;
    const outputTemplate = path.join(downloadDir, `${filePrefix}.%(ext)s`);
    const ytDlp = getYtDlpCommand();
    const binDir = path.join(process.cwd(), "bin");

    // 1. Download video & write English subtitles with ffmpeg audio/video merging
    const cmd = `${ytDlp} --ffmpeg-location "${binDir}" -f "bestvideo[ext=mp4][height<=1080]+bestaudio[ext=m4a]/best[ext=mp4]/best" --no-warnings --ignore-errors --write-sub --write-auto-sub --sub-lang "en" --convert-subs vtt --merge-output-format mp4 -o "${outputTemplate}" "${url}"`;

    await execPromise(cmd, { timeout: 240000 });

    // Look for downloaded mp4 (either merged or single)
    let videoFilename = `${filePrefix}.mp4`;
    let fullVideoPath = path.join(downloadDir, videoFilename);

    // If merged mp4 doesn't exist, search for any downloaded video format with this prefix
    if (!fs.existsSync(fullVideoPath)) {
      const files = fs.readdirSync(downloadDir);
      const vidFile = files.find(
        (f) => f.startsWith(filePrefix) && (f.endsWith(".mp4") || f.endsWith(".webm") || f.endsWith(".mkv"))
      );
      if (vidFile) {
        videoFilename = vidFile;
        fullVideoPath = path.join(downloadDir, videoFilename);
      }
    }

    // Look for downloaded vtt subtitle
    let transcriptText = "";
    let transcriptSegments: { start: number; end: number; text: string }[] = [];

    const files = fs.readdirSync(downloadDir);
    const subtitleFile = files.find((f) => f.startsWith(filePrefix) && f.endsWith(".vtt"));
    if (subtitleFile) {
      const vttPath = path.join(downloadDir, subtitleFile);
      const vttContent = fs.readFileSync(vttPath, "utf-8");
      transcriptSegments = parseVttToTranscript(vttContent);
      transcriptText = transcriptSegments.map((s) => s.text).join(" ");
    }

    return NextResponse.json({
      success: true,
      filePath: fullVideoPath,
      fileUrl: `/downloads/${videoFilename}`,
      fileName: videoFilename,
      transcriptText,
      transcriptSegments,
    });
  } catch (err: any) {
    console.error("YouTube download error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to download YouTube video. Please check the URL." },
      { status: 500 }
    );
  }
}
