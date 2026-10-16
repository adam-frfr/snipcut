import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import path from "path";
import fs from "fs";
import util from "util";

const execPromise = util.promisify(exec);

function getYtDlpCommand() {
  if (process.platform === "win32") {
    const localBin = path.join(process.cwd(), "bin", "yt-dlp.exe");
    if (fs.existsSync(localBin)) {
      return `"${localBin}"`;
    }
  }
  const linuxBin = path.join(process.cwd(), "bin", "yt-dlp");
  if (fs.existsSync(linuxBin)) {
    return `"${linuxBin}"`;
  }
  return "yt-dlp";
}

/**
 * Parses WebVTT subtitles into clean timecoded narrative blocks and word-level timings
 */
function parseVttToTranscript(vttContent: string) {
  const lines = vttContent.split(/\r?\n/);
  const words: { word: string; start: number; end: number }[] = [];
  const segments: { start: number; end: number; text: string }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes("-->")) {
      const timeMatch = line.match(
        /(\d{2}):(\d{2}):(\d{2})\.(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})\.(\d{3})/
      );
      if (timeMatch) {
        const s =
          parseInt(timeMatch[1], 10) * 3600 +
          parseInt(timeMatch[2], 10) * 60 +
          parseInt(timeMatch[3], 10) +
          parseInt(timeMatch[4], 10) / 1000;
        const e =
          parseInt(timeMatch[5], 10) * 3600 +
          parseInt(timeMatch[6], 10) * 60 +
          parseInt(timeMatch[7], 10) +
          parseInt(timeMatch[8], 10) / 1000;

        i++;
        let cueText = "";
        while (i < lines.length && lines[i].trim() !== "") {
          const raw = lines[i].trim();
          // Extract newly spoken words from lines containing <c> tags or regular lines
          if (raw.includes("<c>")) {
            const clean = raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
            if (clean) cueText += (cueText ? " " : "") + clean;
          } else if (!raw.includes("<") && raw.length > 0 && segments.length === 0) {
            // Include opening cue
            cueText += (cueText ? " " : "") + raw;
          }
          i++;
        }

        if (cueText) {
          segments.push({ start: s, end: e, text: cueText });
          const parts = cueText.split(/\s+/).filter(Boolean);
          const duration = Math.max(0.4, e - s);
          const wordDur = duration / Math.max(1, parts.length);
          parts.forEach((w, idx) => {
            words.push({
              word: w,
              start: Math.round((s + idx * wordDur) * 100) / 100,
              end: Math.round((s + (idx + 1) * wordDur) * 100) / 100,
            });
          });
        }
      }
    }
  }

  // Format into compact timecoded blocks: [00:15] Hello everyone...
  const blocks: string[] = [];
  let curBlock = { start: 0, text: "" };
  for (const seg of segments) {
    if (seg.start - curBlock.start >= 20 && curBlock.text) {
      const m = Math.floor(curBlock.start / 60);
      const sec = Math.floor(curBlock.start % 60);
      const ts = `[${m < 10 ? "0" : ""}${m}:${sec < 10 ? "0" : ""}${sec}]`;
      blocks.push(`${ts} ${curBlock.text}`);
      curBlock = { start: seg.start, text: seg.text };
    } else {
      curBlock.text += (curBlock.text ? " " : "") + seg.text;
    }
  }
  if (curBlock.text) {
    const m = Math.floor(curBlock.start / 60);
    const sec = Math.floor(curBlock.start % 60);
    const ts = `[${m < 10 ? "0" : ""}${m}:${sec < 10 ? "0" : ""}${sec}]`;
    blocks.push(`${ts} ${curBlock.text}`);
  }

  return {
    transcriptText: blocks.join("\n"),
    segments,
    words,
  };
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
    const cmd = `${ytDlp} --ffmpeg-location "${binDir}" -f "bestvideo[ext=mp4][height<=1080]+bestaudio[ext=m4a]/best[ext=mp4]/best" --no-warnings --ignore-errors --write-sub --write-auto-sub --sub-lang "en.*,en-orig,en" --convert-subs vtt --merge-output-format mp4 -o "${outputTemplate}" "${url}"`;

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
    let transcriptWords: { word: string; start: number; end: number }[] = [];

    const files = fs.readdirSync(downloadDir);
    const subtitleFile = files.find((f) => f.startsWith(filePrefix) && f.endsWith(".vtt"));
    if (subtitleFile) {
      const vttPath = path.join(downloadDir, subtitleFile);
      const vttContent = fs.readFileSync(vttPath, "utf-8");
      const parsed = parseVttToTranscript(vttContent);
      transcriptText = parsed.transcriptText;
      transcriptSegments = parsed.segments;
      transcriptWords = parsed.words;
    }

    return NextResponse.json({
      success: true,
      filePath: fullVideoPath,
      fileUrl: `/downloads/${videoFilename}`,
      fileName: videoFilename,
      transcriptText,
      transcriptSegments,
      transcriptWords,
    });
  } catch (err: any) {
    console.error("YouTube download error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to download YouTube video. Please check the URL." },
      { status: 500 }
    );
  }
}
