import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import path from "path";
import fs from "fs";
import util from "util";
import os from "os";

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
          if (raw.includes("<c>")) {
            const clean = raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
            if (clean) cueText += (cueText ? " " : "") + clean;
          } else if (!raw.includes("<") && raw.length > 0 && segments.length === 0) {
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
  let tempCookiePath: string | null = null;

  try {
    const body = await req.json();
    const { url, cookies, proxy } = body;

    if (!url) {
      return NextResponse.json({ error: "YouTube URL is required" }, { status: 400 });
    }

    const downloadDir = path.join(process.cwd(), "public", "downloads");
    if (!fs.existsSync(downloadDir)) {
      fs.mkdirSync(downloadDir, { recursive: true });
    }

    // 0. Instant Sample Video Handler (Offline & 100% reliable bypass)
    if (url === "sample" || url.includes("sample-podcast") || url.includes("sample-keynote")) {
      const sampleFiles = ["test_dynamic_pan.mp4", "test_split_screen.mp4", "test_tracked_crop.mp4"];
      const existingSample = sampleFiles.find((s) => fs.existsSync(path.join(downloadDir, s))) || sampleFiles[0];
      const fullSamplePath = path.join(downloadDir, existingSample);

      return NextResponse.json({
        success: true,
        filePath: fullSamplePath,
        fileUrl: `/downloads/${existingSample}`,
        fileName: existingSample,
        transcriptText:
          "[00:00] In the next decade, AI compute will scale by more than ten thousand times.\n[00:15] The companies that fail to reframe their entire workflow around artificial intelligence will simply cease to exist.\n[00:30] This is not an incremental shift. It is the greatest technological inflection point in modern history.",
        transcriptSegments: [
          { start: 0, end: 12, text: "In the next decade, AI compute will scale by more than ten thousand times." },
          { start: 12, end: 26, text: "The companies that fail to reframe their entire workflow around artificial intelligence will simply cease to exist." },
          { start: 26, end: 40, text: "This is not an incremental shift. It is the greatest technological inflection point in modern history." },
        ],
        transcriptWords: [
          { word: "In", start: 0.1, end: 0.5 },
          { word: "the", start: 0.5, end: 0.8 },
          { word: "next", start: 0.8, end: 1.2 },
          { word: "decade,", start: 1.2, end: 1.8 },
          { word: "AI", start: 1.8, end: 2.3 },
          { word: "compute", start: 2.3, end: 2.9 },
          { word: "will", start: 2.9, end: 3.3 },
          { word: "scale", start: 3.3, end: 3.8 },
          { word: "by", start: 3.8, end: 4.1 },
          { word: "more", start: 4.1, end: 4.5 },
          { word: "than", start: 4.5, end: 4.8 },
          { word: "ten", start: 4.8, end: 5.2 },
          { word: "thousand", start: 5.2, end: 5.8 },
          { word: "times.", start: 5.8, end: 6.4 },
        ],
      });
    }

    const filePrefix = `yt-${Date.now()}`;
    const outputTemplate = path.join(downloadDir, `${filePrefix}.%(ext)s`);
    const ytDlp = getYtDlpCommand();
    const binDir = path.join(process.cwd(), "bin");

    // Cookie configuration (from request body, env var, or local file)
    let cookieArg = "";
    const rawCookies = cookies || process.env.YOUTUBE_COOKIES || "";
    const localCookieFile = path.join(process.cwd(), "cookies.txt");

    if (rawCookies && rawCookies.trim().length > 10) {
      tempCookiePath = path.join(os.tmpdir(), `yt-cookies-${Date.now()}.txt`);
      fs.writeFileSync(tempCookiePath, rawCookies.trim(), "utf-8");
      cookieArg = `--cookies "${tempCookiePath}"`;
    } else if (fs.existsSync(localCookieFile)) {
      cookieArg = `--cookies "${localCookieFile}"`;
    }

    // Proxy configuration (from request body or env var)
    let proxyArg = "";
    const activeProxy = proxy || process.env.YOUTUBE_PROXY || process.env.HTTP_PROXY || "";
    if (activeProxy && activeProxy.trim().length > 5) {
      proxyArg = `--proxy "${activeProxy.trim()}"`;
    }

    // Multi-tier download strategies
    // Strategy 1: JS runtime enabled + VisionOS & iOS clients (most effective against datacenter bot walls)
    const strategy1 = `${ytDlp} --js-runtimes node --ffmpeg-location "${binDir}" ${cookieArg} ${proxyArg} --extractor-args "youtube:player_client=visionos,ios,mweb" -f "bestvideo[height<=720]+bestaudio/best[height<=720]/best" --no-warnings --ignore-errors --merge-output-format mp4 -o "${outputTemplate}" "${url}"`;

    // Strategy 2: JS runtime enabled + iOS & Android clients
    const strategy2 = `${ytDlp} --js-runtimes node --ffmpeg-location "${binDir}" ${cookieArg} ${proxyArg} --extractor-args "youtube:player_client=ios,android" -f "bestvideo[height<=720]+bestaudio/best[height<=720]/best" --no-warnings --ignore-errors --merge-output-format mp4 -o "${outputTemplate}" "${url}"`;

    // Strategy 3: Standard client with fallback format
    const strategy3 = `${ytDlp} --js-runtimes node --ffmpeg-location "${binDir}" ${cookieArg} ${proxyArg} -f "best[height<=720]/best" --no-warnings --ignore-errors --merge-output-format mp4 -o "${outputTemplate}" "${url}"`;

    let downloadSucceeded = false;
    let lastError: any = null;

    for (const cmd of [strategy1, strategy2, strategy3]) {
      try {
        await execPromise(cmd, { timeout: 240000 });
        downloadSucceeded = true;
        break;
      } catch (err: any) {
        lastError = err;
        console.warn("yt-dlp strategy attempt failed:", err?.message);
      }
    }

    // Look for downloaded mp4 (either merged or single)
    let videoFilename = `${filePrefix}.mp4`;
    let fullVideoPath = path.join(downloadDir, videoFilename);

    if (!fs.existsSync(fullVideoPath)) {
      const files = fs.readdirSync(downloadDir);
      const vidFile = files.find(
        (f) => f.startsWith(filePrefix) && (f.endsWith(".mp4") || f.endsWith(".webm") || f.endsWith(".mkv"))
      );
      if (vidFile) {
        videoFilename = vidFile;
        fullVideoPath = path.join(downloadDir, videoFilename);
        downloadSucceeded = true;
      }
    }

    if (!downloadSucceeded || !fs.existsSync(fullVideoPath)) {
      const errMsg = lastError?.message || "";
      const isBotBlocked =
        errMsg.includes("Sign in to confirm you're not a bot") ||
        errMsg.includes("bot") ||
        errMsg.includes("cookies") ||
        errMsg.includes("429") ||
        errMsg.includes("403");

      return NextResponse.json(
        {
          error: isBotBlocked
            ? "YouTube has bot-checked this cloud server IP for this video. You can upload the video file directly (drag & drop below) or add YouTube cookies in API Settings."
            : "Video download failed. Please upload your video file directly or try another link.",
          isBotBlocked: true,
          suggestion: "upload_direct",
        },
        { status: 422 }
      );
    }

    // Attempt separate non-blocking subtitle download
    let transcriptText = "";
    let transcriptSegments: { start: number; end: number; text: string }[] = [];
    let transcriptWords: { word: string; start: number; end: number }[] = [];

    try {
      const subCmd = `${ytDlp} --js-runtimes node ${cookieArg} ${proxyArg} --skip-download --write-auto-sub --sub-lang "en.*,en" --convert-subs vtt -o "${outputTemplate}" "${url}"`;
      await execPromise(subCmd, { timeout: 45000 });

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
    } catch (subErr) {
      console.warn("Subtitles could not be auto-extracted, falling back to Whisper AI transcription:", subErr);
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
      {
        error:
          err?.message ||
          "Failed to download YouTube video. Please upload your MP4 file directly.",
        isBotBlocked: true,
      },
      { status: 500 }
    );
  } finally {
    if (tempCookiePath && fs.existsSync(tempCookiePath)) {
      try {
        fs.unlinkSync(tempCookiePath);
      } catch (e) {}
    }
  }
}
