import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import path from "path";
import fs from "fs";
import { spawn } from "child_process";

// Set fluent-ffmpeg binary path to local bin or system/static ffmpeg
function checkBinaryRunnable(binPath: string): boolean {
  try {
    const { execFileSync } = require("child_process");
    execFileSync(binPath, ["-version"], { stdio: "ignore", timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

// Resolution order: 1. Env override -> 2. ./bin (platform matching) -> 3. static package -> 4. system PATH -> Clear error
export function getFfmpegBinary(): string {
  if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) {
    return process.env.FFMPEG_PATH;
  }

  const isWin = process.platform === "win32";
  const binName = isWin ? "ffmpeg.exe" : "ffmpeg";
  const localBin = path.join(process.cwd(), "bin", binName);
  if (fs.existsSync(localBin)) {
    return localBin;
  }

  try {
    const staticPath = typeof ffmpegStatic === "string" ? ffmpegStatic : (ffmpegStatic as any)?.path;
    if (staticPath && fs.existsSync(staticPath)) {
      return staticPath;
    }
  } catch {}

  if (checkBinaryRunnable("ffmpeg")) {
    return "ffmpeg";
  }

  throw new Error(
    `FFmpeg binary not found for platform "${process.platform}". Checked FFMPEG_PATH env, ./bin/${binName}, ffmpeg-static, and system PATH.`
  );
}

export function getFfprobeBinary(): string {
  if (process.env.FFPROBE_PATH && fs.existsSync(process.env.FFPROBE_PATH)) {
    return process.env.FFPROBE_PATH;
  }

  const isWin = process.platform === "win32";
  const binName = isWin ? "ffprobe.exe" : "ffprobe";
  const localBin = path.join(process.cwd(), "bin", binName);
  if (fs.existsSync(localBin)) {
    return localBin;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ffprobePkg = require("ffprobe-static");
    const staticPath =
      ffprobePkg?.path || ffprobePkg?.default?.path || ffprobePkg?.default || ffprobePkg;
    if (typeof staticPath === "string" && fs.existsSync(staticPath)) {
      return staticPath;
    }
  } catch {}

  if (checkBinaryRunnable("ffprobe")) {
    return "ffprobe";
  }

  throw new Error(
    `ffprobe binary not found for platform "${process.platform}". Checked FFPROBE_PATH env, ./bin/${binName}, ffprobe-static, and system PATH.`
  );
}

try {
  ffmpeg.setFfmpegPath(getFfmpegBinary());
} catch (e: any) {
  console.warn("FFmpeg path init notice:", e?.message || e);
}

try {
  ffmpeg.setFfprobePath(getFfprobeBinary());
} catch (e: any) {
  console.warn("ffprobe path init notice:", e?.message || e);
}

export interface VideoStreamInfo {
  codecName: string;
  pixFmt: string;
  bitsPerRawSample?: string;
  width?: number;
  height?: number;
  duration?: number;
  colorTransfer?: string;
  rFrameRate?: string;
  avgFrameRate?: string;
  isVfr: boolean;
  isHdr: boolean;
  isH264Yuv420p8Bit: boolean;
}

let isZscaleAvailableCache: boolean | null = null;
export function checkZscaleSupported(): boolean {
  if (isZscaleAvailableCache !== null) return isZscaleAvailableCache;
  try {
    const { execFileSync } = require("child_process");
    const bin = getFfmpegBinary();
    const stdout = execFileSync(/*turbopackIgnore: true*/ bin, ["-filters"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
      timeout: 5000,
    });
    isZscaleAvailableCache = stdout.includes("zscale");
  } catch {
    isZscaleAvailableCache = false;
  }
  return isZscaleAvailableCache ?? false;
}

const ALLOWED_DIRECTORIES = [
  path.resolve(process.cwd(), "public", "uploads"),
  path.resolve(process.cwd(), "public", "downloads"),
  path.resolve(process.cwd(), "public", "rendered_clips"),
  path.resolve(process.cwd(), "data"),
];

/**
 * Resolves an upload id, relative path, or filename safely strictly within allowed server directories.
 * Prevents arbitrary filesystem traversal attacks.
 */
export function resolveSafeFilePath(input: string): string {
  if (!input || typeof input !== "string") {
    throw new Error("Invalid file identifier provided");
  }

  // Strip media query prefix if passed as /api/media?file=...
  let clean = input.trim();
  if (clean.includes("/api/media?file=")) {
    clean = decodeURIComponent(clean.split("/api/media?file=")[1] || "");
  }

  const baseOnly = path.basename(clean);
  const candidates: string[] = [];

  if (path.isAbsolute(clean)) {
    candidates.push(path.resolve(/*turbopackIgnore: true*/ clean));
  } else {
    candidates.push(path.resolve(/*turbopackIgnore: true*/ process.cwd(), clean));
    candidates.push(path.resolve(/*turbopackIgnore: true*/ process.cwd(), "public", clean));
    candidates.push(path.resolve(/*turbopackIgnore: true*/ process.cwd(), "public", "uploads", baseOnly));
    candidates.push(path.resolve(/*turbopackIgnore: true*/ process.cwd(), "public", "downloads", baseOnly));
    candidates.push(path.resolve(/*turbopackIgnore: true*/ process.cwd(), "public", "rendered_clips", baseOnly));
    candidates.push(path.resolve(/*turbopackIgnore: true*/ process.cwd(), "data", baseOnly));
  }

  for (const candidate of candidates) {
    const isAllowed = ALLOWED_DIRECTORIES.some((allowed) => {
      const allowedWithSep = allowed.endsWith(path.sep) ? allowed : allowed + path.sep;
      return candidate === allowed || candidate.startsWith(allowedWithSep);
    });

    if (isAllowed && fs.existsSync(/*turbopackIgnore: true*/ candidate)) {
      return candidate;
    }
  }

  const primary = candidates[0];
  const isPrimaryAllowed = ALLOWED_DIRECTORIES.some((allowed) => {
    const allowedWithSep = allowed.endsWith(path.sep) ? allowed : allowed + path.sep;
    return primary === allowed || primary.startsWith(allowedWithSep);
  });

  if (!isPrimaryAllowed) {
    throw new Error("Access denied: requested path resolves outside allowed media directories");
  }

  return primary;
}

/**
 * Converts a server filesystem path into a safe, client-facing relative fileId/URL
 */
export function toSafeFileIdentifier(absolutePath: string): { fileId: string; fileUrl: string } {
  const publicDir = path.resolve(process.cwd(), "public");
  let relative = path.relative(publicDir, absolutePath).replace(/\\/g, "/");
  if (relative.startsWith("..")) {
    relative = path.relative(process.cwd(), absolutePath).replace(/\\/g, "/");
  }
  return {
    fileId: relative,
    fileUrl: `/api/media?file=${encodeURIComponent(relative)}`,
  };
}

/**
 * Inspect video streams using ffprobe to check format, VFR, and HDR transfer
 */
export async function probeVideoFormat(filePath: string): Promise<VideoStreamInfo> {
  const ffprobeBin = getFfprobeBinary();
  const { execFile } = await import("child_process");
  const util = await import("util");
  const execFilePromise = util.promisify(execFile);

  try {
    const { stdout } = await execFilePromise(ffprobeBin, [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=codec_name,pix_fmt,bits_per_raw_sample,width,height,duration,r_frame_rate,avg_frame_rate,color_transfer,color_space,color_primaries",
      "-of",
      "json",
      filePath,
    ]);

    const data = JSON.parse(stdout);
    const stream = data.streams?.[0] || {};
    const codecName = (stream.codec_name || "").toLowerCase();
    const pixFmt = (stream.pix_fmt || "").toLowerCase();
    const bits = stream.bits_per_raw_sample;
    const colorTransfer = (stream.color_transfer || "").toLowerCase();
    const rFrameRate = stream.r_frame_rate;
    const avgFrameRate = stream.avg_frame_rate;

    // Rule: Decide isHdr ONLY from color_transfer (smpte2084 / arib-std-b67), not from pixel format or bit depth
    const isHdr =
      colorTransfer === "arib-std-b67" ||
      colorTransfer === "smpte2084";

    const isVfr = Boolean(
      rFrameRate && avgFrameRate && rFrameRate !== avgFrameRate
    );

    const isH264 = codecName === "h264" || codecName === "avc1";
    const isYuv420p = pixFmt === "yuv420p";
    // bits_per_raw_sample is often missing for H.264. Only check if present. Treat missing as OK.
    const is8Bit = !bits || bits === "8" || bits === 8;

    // Direct copy-remux eligible only if H.264 8-bit yuv420p SDR
    const isH264Yuv420p8Bit = isH264 && isYuv420p && is8Bit && !isHdr;

    return {
      codecName,
      pixFmt,
      bitsPerRawSample: bits ? String(bits) : undefined,
      width: stream.width,
      height: stream.height,
      duration: stream.duration ? parseFloat(stream.duration) : undefined,
      colorTransfer: colorTransfer || undefined,
      rFrameRate,
      avgFrameRate,
      isVfr,
      isHdr,
      isH264Yuv420p8Bit,
    };
  } catch (err: any) {
    console.warn("ffprobe inspection warning, falling back to transcode:", err?.message || err);
    return {
      codecName: "unknown",
      pixFmt: "unknown",
      isVfr: false,
      isHdr: false,
      isH264Yuv420p8Bit: false,
    };
  }
}

export type ReframeMode = "auto-tracker" | "split-screen" | "blurred-fit" | "center";

export interface SplitScreenCustomOptions {
  splitRatio?: number; // 0.2 to 0.8 (default 0.5)
  topCropXPercent?: number; // 0 to 100% of source width
  topCropYPercent?: number; // 0 to 100%
  topZoom?: number; // 1.0 to 2.5
  botCropXPercent?: number; // 0 to 100% of source width
  botCropYPercent?: number; // 0 to 100%
  botZoom?: number; // 1.0 to 2.5
}

export interface RenderOptions {
  inputPath: string;
  outputPath: string;
  startTime: number;
  duration: number;
  aspectRatio: "9:16" | "1:1" | "16:9";
  reframeMode?: ReframeMode;
  splitScreen?: boolean;
  splitScreenOptions?: SplitScreenCustomOptions;
  captionPositionY?: number;
  transcript?: { start: number; end: number; text: string }[];
  headline?: string;
  captionStyle?: "hormozi" | "neon" | "beast" | "clean";
}

export interface FocusShot {
  start: number;
  end: number;
  position: "left" | "center" | "right";
  subject_center_x?: number;
  crop_x: number;
  label: string;
  details: string;
}

export interface TrackingResult {
  status: "success" | "error";
  mode: string;
  isDynamic?: boolean;
  shots?: FocusShot[];
  filter_type: "vf" | "filter_complex";
  filter_value: string;
  subject_center_x?: number;
  crop_x?: number;
  crop_w?: number;
  crop_h?: number;
  summary?: string;
}

function formatSrtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.min(999, Math.floor((seconds % 1) * 1000));
  return `${h < 10 ? "0" : ""}${h}:${m < 10 ? "0" : ""}${m}:${s < 10 ? "0" : ""}${s},${ms < 100 ? (ms < 10 ? "00" : "0") : ""}${ms}`;
}

/**
 * Runs deep-learning AI Subject Tracking (OpusClip ReframeAnything)
 * Computes optimal 9:16 crop box keeping speaker centered or multi-mode layout
 */
export async function detectSubjectAndReframe(
  videoPath: string,
  startTime: number,
  duration: number,
  mode: ReframeMode = "auto-tracker"
): Promise<TrackingResult> {
  return new Promise((resolve) => {
    const scriptPath = path.join(process.cwd(), "scripts", "track_reframe.py");
    if (!fs.existsSync(scriptPath)) {
      return resolve({
        status: "success",
        mode: "center",
        filter_type: "vf",
        filter_value: "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920",
        summary: "Default center crop fallback",
      });
    }

    const pythonBin =
      process.env.PYTHON_BIN || (process.platform === "win32" ? "python" : "python3");

    const py = spawn(/*turbopackIgnore: true*/ pythonBin, [
      scriptPath,
      "--video",
      videoPath,
      "--start",
      String(startTime),
      "--duration",
      String(duration),
      "--mode",
      mode,
    ]);

    let stdout = "";
    let stderr = "";

    py.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    py.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    py.on("close", (code) => {
      if (code === 0 && stdout.trim()) {
        try {
          const lines = stdout.trim().split("\n");
          for (let i = lines.length - 1; i >= 0; i--) {
            const line = lines[i].trim();
            if (line.startsWith("{") && line.endsWith("}")) {
              const parsed = JSON.parse(line);
              return resolve(parsed);
            }
          }
        } catch (e) {
          console.warn("Could not parse tracking python output:", stdout);
        }
      }

      // Fallback
      resolve({
        status: "success",
        mode: "center",
        filter_type: "vf",
        filter_value: "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920",
        summary: "Default center crop",
      });
    });

    py.on("error", (err) => {
      console.warn("Python tracking spawn error:", err);
      resolve({
        status: "success",
        mode: "center",
        filter_type: "vf",
        filter_value: "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920",
        summary: "Default center crop fallback",
      });
    });
  });
}

/**
 * Trims, reframes to 9:16 vertical (with AI Subject Tracking), and burns in viral subtitles using local FFmpeg
 */
export async function renderVideoClip({
  inputPath,
  outputPath,
  startTime,
  duration,
  aspectRatio = "9:16",
  reframeMode = "auto-tracker",
  splitScreen = false,
  splitScreenOptions,
  captionPositionY,
  transcript,
  headline,
  captionStyle = "hormozi",
}: RenderOptions): Promise<{ outputPath: string; tracking: TrackingResult }> {
  // Resolve input and output paths safely strictly within allowed directories
  const resolvedInput = resolveSafeFilePath(inputPath);
  const resolvedOutput = resolveSafeFilePath(outputPath);

  // Determine actual reframe mode
  let effectiveMode: ReframeMode = reframeMode;
  if (splitScreen) {
    effectiveMode = "split-screen";
  }

  // Run AI Subject Tracking or Custom Layout
  let trackingResult: TrackingResult = {
    status: "success",
    mode: effectiveMode,
    filter_type: "vf",
    filter_value: "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920",
    summary: "Static center crop",
  };

  if (aspectRatio === "9:16") {
    if (effectiveMode === "split-screen") {
      const opts = splitScreenOptions || {};
      const ratio = Math.max(0.2, Math.min(0.8, opts.splitRatio ?? 0.5));
      const topH = Math.round((1920 * ratio) / 2) * 2;
      const botH = 1920 - topH;

      const topZoom = Math.max(1.0, Math.min(3.0, opts.topZoom ?? 1.0));
      const botZoom = Math.max(1.0, Math.min(3.0, opts.botZoom ?? 1.0));
      const topX = Math.max(0, Math.min(100, opts.topCropXPercent ?? 25));
      const botX = Math.max(0, Math.min(100, opts.botCropXPercent ?? 75));

      // Build precise crop expressions for top and bottom speakers
      const filterValue =
        `[0:v]crop=w='min(iw,iw/${topZoom})':h='min(ih,ih/${topZoom})':x='max(0,min(iw-iw/${topZoom},(iw*${topX}/100)-iw/(2*${topZoom})))':y='(ih-ih/${topZoom})/2',scale=1080:${topH}:force_original_aspect_ratio=increase,crop=1080:${topH}[top];` +
        `[0:v]crop=w='min(iw,iw/${botZoom})':h='min(ih,ih/${botZoom})':x='max(0,min(iw-iw/${botZoom},(iw*${botX}/100)-iw/(2*${botZoom})))':y='(ih-ih/${botZoom})/2',scale=1080:${botH}:force_original_aspect_ratio=increase,crop=1080:${botH}[bot];` +
        `[top][bot]vstack=inputs=2`;

      trackingResult = {
        status: "success",
        mode: "split-screen",
        filter_type: "filter_complex",
        filter_value: filterValue,
        summary: `Custom Dual-Speaker Split: Top ${Math.round(ratio * 100)}% (pan ${topX}%, zoom ${topZoom}x), Bottom ${Math.round((1 - ratio) * 100)}% (pan ${botX}%, zoom ${botZoom}x)`,
      };
    } else {
      try {
        trackingResult = await detectSubjectAndReframe(
          resolvedInput,
          startTime,
          duration,
          effectiveMode
        );
      } catch (e) {
        console.warn("AI Tracking warning:", e);
      }
    }
  }

  return new Promise((resolve, reject) => {
    // Ensure output directory exists
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const renderStartTime = Date.now();
    console.log(
      `[Stage: FFmpeg Render] Starting precision render: start=${startTime}s, duration=${duration}s, mode=${effectiveMode}, input=${resolvedInput}`
    );

    // Fast seeking: Put -ss before -i via inputOptions.
    // Re-encoding with libx264 ensures frame accuracy at the cut point.
    let command = ffmpeg(resolvedInput)
      .inputOptions(["-ss", String(startTime)])
      .setDuration(duration);

    // Prepare subtitles
    let tempSrtPath: string | null = null;
    let srtEntries: { start: number; end: number; text: string }[] = [];

    if (transcript && transcript.length > 0) {
      // Subtitle time base: Always assume absolute time base from source video.
      // Filter strictly to words within [startTime, startTime + duration] and shift by startTime.
      const clipEndTime = startTime + duration;
      const relevantWords = transcript.filter(
        (t) => t.end > startTime && t.start < clipEndTime
      );

      srtEntries = relevantWords.map((t) => {
        const shiftedStart = Math.max(0, Number((t.start - startTime).toFixed(2)));
        // Ensure the last caption's end is not clamped mid-word: allow full word duration
        const shiftedEnd = Math.max(
          shiftedStart + 0.2,
          Number((t.end - startTime).toFixed(2))
        );
        const wordText = t.text || (t as any).word || "";
        return {
          start: shiftedStart,
          end: shiftedEnd,
          text: wordText.toUpperCase(),
        };
      });
    } else if (headline) {
      srtEntries = [
        {
          start: 0,
          end: duration,
          text: headline.toUpperCase(),
        },
      ];
    }

    let subtitleFilterStr: string | null = null;
    if (srtEntries.length > 0) {
      const srtLines: string[] = [];
      srtEntries.forEach((entry, idx) => {
        srtLines.push(`${idx + 1}`);
        srtLines.push(`${formatSrtTime(entry.start)} --> ${formatSrtTime(entry.end)}`);
        srtLines.push(entry.text);
        srtLines.push("");
      });

      tempSrtPath = path.join(dir, `sub-${Date.now()}-${Math.floor(Math.random() * 1000)}.srt`);
      fs.writeFileSync(tempSrtPath, srtLines.join("\n"), "utf-8");

      // Save a debug copy to data/debug for validation/testing
      try {
        const debugDir = path.join(process.cwd(), "data", "debug");
        if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir, { recursive: true });
        fs.writeFileSync(path.join(debugDir, "last_subtitles.srt"), srtLines.join("\n"), "utf-8");
      } catch {}

      console.log(
        `[Stage: Subtitle Alignment] Burning ${srtEntries.length} words into clip: first="${srtEntries[0]?.text}" at relative ${srtEntries[0]?.start.toFixed(2)}s, last="${srtEntries[srtEntries.length - 1]?.text}" at relative ${srtEntries[srtEntries.length - 1]?.end.toFixed(2)}s`
      );

      let marginV = 130;
      if (captionPositionY !== undefined) {
        marginV = Math.max(40, Math.min(1800, Math.round(1920 * (1 - captionPositionY / 100))));
      }

      let forceStyle =
        `Fontname=Arial,Fontsize=24,PrimaryColour=&H0000FFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=3,Alignment=2,MarginV=${marginV}`;
      if (captionStyle === "neon") {
        forceStyle =
          `Fontname=Arial,Fontsize=24,PrimaryColour=&H0000FF00,OutlineColour=&H00000000,BorderStyle=1,Outline=3,Alignment=2,MarginV=${marginV}`;
      } else if (captionStyle === "beast") {
        forceStyle =
          `Fontname=Arial,Fontsize=26,PrimaryColour=&H0000FFFF,OutlineColour=&H000000FF,BorderStyle=1,Outline=4,Alignment=2,MarginV=${marginV}`;
      } else if (captionStyle === "clean") {
        forceStyle =
          `Fontname=Arial,Fontsize=22,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=2,Alignment=2,MarginV=${marginV}`;
      }

      const srtEscaped = tempSrtPath.replace(/\\/g, "/").replace(/:/g, "\\:");
      subtitleFilterStr = `subtitles='${srtEscaped}':force_style='${forceStyle}'`;
    }

    // Apply filters based on aspect ratio and tracking
    if (aspectRatio === "9:16") {
      if (trackingResult.filter_type === "filter_complex") {
        if (subtitleFilterStr) {
          command = command.complexFilter(
            `${trackingResult.filter_value}[base_v];[base_v]${subtitleFilterStr}[v]`,
            "v"
          );
        } else {
          command = command.complexFilter(trackingResult.filter_value);
        }
      } else {
        // Standard video filter array (auto-tracker or center crop)
        const filters = [trackingResult.filter_value];
        if (subtitleFilterStr) {
          filters.push(subtitleFilterStr);
        }
        command = command.videoFilters(filters);
      }
    } else if (aspectRatio === "1:1") {
      const filters = ["scale=1080:1080:force_original_aspect_ratio=increase,crop=1080:1080"];
      if (subtitleFilterStr) {
        filters.push(subtitleFilterStr);
      }
      command = command.videoFilters(filters);
    } else {
      // 16:9
      const filters: string[] = [];
      if (subtitleFilterStr) {
        filters.push(subtitleFilterStr);
      }
      if (filters.length > 0) {
        command = command.videoFilters(filters);
      }
    }

    const cleanup = () => {
      if (tempSrtPath && fs.existsSync(tempSrtPath)) {
        try {
          fs.unlinkSync(tempSrtPath);
        } catch (e) {}
      }
    };

    command
      .outputOptions([
        "-c:v libx264",
        "-preset veryfast",
        "-crf 23",
        "-pix_fmt yuv420p",
        "-c:a aac",
        "-b:a 192k",
        "-movflags +faststart",
      ])
      .output(resolvedOutput)
      .on("end", () => {
        cleanup();
        const elapsedMs = Date.now() - renderStartTime;
        const sizeBytes = fs.existsSync(resolvedOutput) ? fs.statSync(resolvedOutput).size : 0;
        console.log(
          `[Stage: FFmpeg Render] Finished rendering in ${elapsedMs}ms -> ${resolvedOutput} (${sizeBytes} bytes)`
        );
        resolve({ outputPath: resolvedOutput, tracking: trackingResult });
      })
      .on("error", (err) => {
        cleanup();
        console.error("[Stage: FFmpeg Render] Render error:", err);
        reject(err);
      })
      .run();
  });
}

/**
 * Extracts a lightweight compressed MP3 audio track from any video for OpenAI Whisper
 */
export async function extractAudioForWhisper(
  videoPath: string,
  audioOutputPath: string
): Promise<string> {
  const audioStartTime = Date.now();
  console.log(`[Stage: Audio Extraction] Extracting audio for Whisper from: ${videoPath}`);

  return new Promise((resolve, reject) => {
    const dir = path.dirname(audioOutputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    ffmpeg(videoPath)
      .noVideo()
      .audioCodec("libmp3lame")
      .audioBitrate(64)
      .audioChannels(1)
      .output(audioOutputPath)
      .on("end", () => {
        const elapsedMs = Date.now() - audioStartTime;
        const sizeBytes = fs.existsSync(audioOutputPath) ? fs.statSync(audioOutputPath).size : 0;
        console.log(
          `[Stage: Audio Extraction] Finished in ${elapsedMs}ms -> ${audioOutputPath} (${sizeBytes} bytes)`
        );
        resolve(audioOutputPath);
      })
      .on("error", (err) => {
        console.error("[Stage: Audio Extraction] Error:", err);
        reject(err);
      })
      .run();
  });
}
