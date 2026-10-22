import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import path from "path";
import fs from "fs";
import os from "os";
import { spawn, execFile } from "child_process";
import util from "util";

const execFileP = util.promisify(execFile);

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

// Resolution order: 1. Env override -> 2. ./bin -> 3. system PATH (Docker installs yt-dlp to /usr/local/bin)
export function getYtDlpBinary(): string {
  if (process.env.YTDLP_PATH && fs.existsSync(process.env.YTDLP_PATH)) {
    return process.env.YTDLP_PATH;
  }
  const isWin = process.platform === "win32";
  const binName = isWin ? "yt-dlp.exe" : "yt-dlp";
  const localBin = path.join(process.cwd(), "bin", binName);
  if (fs.existsSync(localBin)) {
    return localBin;
  }
  if (checkBinaryRunnable("yt-dlp")) {
    return "yt-dlp";
  }
  throw new Error(
    `yt-dlp binary not found. Checked YTDLP_PATH env, ./bin/${binName}, and system PATH.`
  );
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
  captionStyle?: "hormozi" | "neon" | "beast" | "clean" | "kinetic";
  // Render picture only; captions are burned later by applyPostEffects so
  // they can sit ON TOP of B-roll cutaways instead of underneath them.
  skipCaptions?: boolean;
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
  version?: number;
  speakers?: number;
  layoutSuggestion?: string | null;
}

function formatSrtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.min(999, Math.floor((seconds % 1) * 1000));
  return `${h < 10 ? "0" : ""}${h}:${m < 10 ? "0" : ""}${m}:${s < 10 ? "0" : ""}${s},${ms < 100 ? (ms < 10 ? "00" : "0") : ""}${ms}`;
}

function formatAssTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}:${m < 10 ? "0" : ""}${m}:${s < 10 ? "0" : ""}${s.toFixed(2)}`;
}

interface KaraokeWord {
  start: number;
  end: number;
  text: string;
}

/**
 * Karaoke-style captions (the OpusClip/Hormozi look): a short phrase stays
 * on screen while the currently-spoken word is highlighted in the accent
 * colour. Emitted as ASS with one Dialogue event per word; each event
 * re-renders the whole phrase with a different word highlighted, so there
 * is never a flicker or a lonely single word on screen.
 */
export function buildKaraokeAss(
  words: KaraokeWord[],
  captionStyle: "hormozi" | "neon" | "beast" | "clean" | "kinetic",
  marginV: number,
  playRes: { x: number; y: number } = { x: 1080, y: 1920 }
): string {
  // ASS colours are &HAABBGGRR.
  const palettes = {
    hormozi: { base: "&H00FFFFFF", accent: "&H0000FFFF", size: 56, outline: 6 },
    neon: { base: "&H00FFFFFF", accent: "&H0000FF00", size: 56, outline: 6 },
    beast: { base: "&H00FFFFFF", accent: "&H0000FFFF", size: 62, outline: 8 },
    clean: { base: "&H00FFFFFF", accent: "&H00FFFFFF", size: 46, outline: 3 },
    kinetic: { base: "&H00FFFFFF", accent: "&H0000FFFF", size: 98, outline: 9 },
  } as const;
  const pal = palettes[captionStyle] || palettes.hormozi;
  // Font size is authored against a 1920px-tall canvas; scale it to the
  // actual PlayRes so 16:9 / 1:1 renders don't get oversized captions.
  const fontSize = Math.max(20, Math.round(pal.size * (playRes.y / 1920)));

  const header = `[Script Info]
Title: OpusClip Karaoke Captions
ScriptType: v4.00+
PlayResX: ${playRes.x}
PlayResY: ${playRes.y}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Karaoke,Arial,${fontSize},${pal.base},${pal.base},&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,${pal.outline},2,2,60,60,${marginV},1
Style: Kinetic,Arial,${fontSize},${pal.base},${pal.base},&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,${pal.outline},3,5,40,40,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const escapeAssText = (t: string) => t.replace(/\\/g, "\\\\").replace(/\{/g, "\\{").replace(/\}/g, "\\}");

  if (captionStyle === "kinetic") {
    // KINETIC: 1-3 word chunks, center-screen, each chunk pops in with a
    // quick scale settle; the strongest word in the chunk gets the accent
    // colour and a size bump. This mirrors the reference-style edits where
    // captions ARE the visual.
    const chunks: KaraokeWord[][] = [];
    let cur: KaraokeWord[] = [];
    for (const w of words) {
      if (cur.length > 0) {
        const prev = cur[cur.length - 1];
        if (cur.length >= 3 || w.start - prev.end > 0.35 || /[.!?]$/.test(prev.text)) {
          chunks.push(cur);
          cur = [];
        }
      }
      cur.push(w);
    }
    if (cur.length > 0) chunks.push(cur);

    const evts: string[] = [];
    chunks.forEach((chunk, ci) => {
      const start = chunk[0].start;
      const lastEnd = chunk[chunk.length - 1].end;
      const nextStart = ci + 1 < chunks.length ? chunks[ci + 1][0].start : lastEnd + 0.3;
      const end = Math.max(lastEnd, Math.min(nextStart, start + 0.28));
      // Emphasis: longest word (ties -> the later one), or any word with digits.
      let emph = 0;
      chunk.forEach((w, i) => {
        if (/\d/.test(w.text) || w.text.replace(/[^A-Za-z]/g, "").length >= chunk[emph].text.replace(/[^A-Za-z]/g, "").length) emph = i;
      });
      // Auto-fit: Arial Bold uppercase averages ~0.68em per glyph; if the
      // chunk would overflow the canvas, shrink the whole event uniformly.
      const avail = playRes.x - 96;
      const estWidth = chunk.reduce((sum, w, i) => {
        const fs = i === emph && chunk.length > 1 ? fontSize * 1.14 : fontSize;
        return sum + w.text.length * 0.68 * fs + (i > 0 ? 0.35 * fontSize : 0);
      }, 0);
      const fitScale = estWidth > avail ? Math.max(0.55, avail / estWidth) : 1;
      const parts = chunk.map((w, i) => {
        const txt = escapeAssText(w.text.toUpperCase());
        return i === emph && chunk.length > 1
          ? `{\\c${pal.accent}\\fs${Math.round(fontSize * fitScale * 1.14)}}${txt}{\\r}`
          : txt;
      });
      const anim = `{\\fad(45,60)${fitScale < 1 ? `\\fs${Math.round(fontSize * fitScale)}` : ""}\\fscx115\\fscy115\\t(0,110,1,\\fscx100\\fscy100)}`;
      evts.push(`Dialogue: 0,${formatAssTime(start)},${formatAssTime(end)},Kinetic,,0,0,0,,${anim}${parts.join(" ")}`);
    });
    return header + evts.join("\n") + "\n";
  }

  // Group words into phrases: max 4 words, break on sentence punctuation
  // or a pause longer than 0.45s.
  const phrases: KaraokeWord[][] = [];
  let current: KaraokeWord[] = [];
  for (const w of words) {
    if (current.length > 0) {
      const prev = current[current.length - 1];
      const gap = w.start - prev.end;
      if (current.length >= 4 || gap > 0.45 || /[.!?]$/.test(prev.text)) {
        phrases.push(current);
        current = [];
      }
    }
    current.push(w);
  }
  if (current.length > 0) phrases.push(current);

  const escapeAss = (t: string) => t.replace(/\\/g, "\\\\").replace(/\{/g, "\\{").replace(/\}/g, "\\}");
  const events: string[] = [];
  for (const phrase of phrases) {
    for (let i = 0; i < phrase.length; i++) {
      const w = phrase[i];
      const nextStart = i + 1 < phrase.length ? phrase[i + 1].start : w.end;
      const evStart = w.start;
      const evEnd = Math.max(w.end, Math.min(nextStart, w.start + 0.12));
      const parts = phrase.map((pw, j) => {
        const txt = escapeAss(pw.text.toUpperCase());
        if (captionStyle === "clean") {
          return j === i ? `{\\b1}${txt}{\\b0}` : txt;
        }
        if (j === i) return `{\\c${pal.accent}\\fs${Math.round(pal.size * 1.12)}}${txt}{\\r}`;
        return txt;
      });
      events.push(
        `Dialogue: 0,${formatAssTime(evStart)},${formatAssTime(evEnd)},Karaoke,,0,0,0,,${parts.join(" ")}`
      );
    }
  }
  return header + events.join("\n") + "\n";
}

/**
 * Runs deep-learning AI Subject Tracking (OpusClip ReframeAnything)
 * Computes optimal 9:16 crop box keeping speaker centered or multi-mode layout
 */
export async function detectSubjectAndReframe(
  videoPath: string,
  startTime: number,
  duration: number,
  mode: ReframeMode = "auto-tracker",
  speechSpans?: { start: number; end: number }[]
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

    // Speech intervals (absolute source time) let the tracker gate its
    // mouth-motion speaker detection to moments when someone is talking.
    let wordsPath: string | null = null;
    const args = [
      scriptPath,
      "--video",
      videoPath,
      "--start",
      String(startTime),
      "--duration",
      String(duration),
      "--mode",
      mode,
    ];
    if (speechSpans && speechSpans.length > 0) {
      try {
        wordsPath = path.join(os.tmpdir(), `opus-speech-${process.pid}-${Date.now()}.json`);
        fs.writeFileSync(wordsPath, JSON.stringify(speechSpans.map((s) => ({ start: s.start, end: s.end }))), "utf-8");
        args.push("--words", wordsPath);
      } catch {
        wordsPath = null;
      }
    }

    const py = spawn(/*turbopackIgnore: true*/ pythonBin, args);

    let stdout = "";
    let stderr = "";

    py.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    py.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    py.on("close", (code) => {
      if (wordsPath) {
        try { fs.unlinkSync(wordsPath); } catch {}
      }
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
  skipCaptions = false,
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
          effectiveMode,
          transcript
        );
        // Premium layout call: two genuine speakers trading lines from
        // opposite sides of the frame read far better as a split screen
        // than as constant camera pans between them.
        if (
          effectiveMode === "auto-tracker" &&
          trackingResult.layoutSuggestion === "split-screen"
        ) {
          const split = await detectSubjectAndReframe(
            resolvedInput,
            startTime,
            duration,
            "split-screen"
          );
          if (split && split.filter_value) {
            trackingResult = {
              ...split,
              summary: `Auto layout: split-screen (two active speakers detected). ${split.summary || ""}`,
            };
          }
        }
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
    // Emoji have no glyphs in the caption fonts (Arial/Liberation) and burn
    // as blank boxes — strip them from the headline fallback text only
    // (titles elsewhere keep their emoji).
    const burnHeadline = headline
      ? headline
          .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2B00}-\u{2BFF}]/gu, "")
          .replace(/\s+/g, " ")
          .trim()
      : headline;
    let tempSrtPath: string | null = null;
    let srtEntries: { start: number; end: number; text: string }[] = [];

    if (!skipCaptions && transcript && transcript.length > 0) {
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
    } else if (!skipCaptions && burnHeadline) {
      srtEntries = [
        {
          start: 0,
          end: duration,
          text: burnHeadline.toUpperCase(),
        },
      ];
    }

    // Words were supplied but none landed inside this render window
    // (misaligned timings) — never ship a silently caption-less clip when
    // a headline exists to fall back on.
    if (!skipCaptions && srtEntries.length === 0 && burnHeadline) {
      srtEntries = [
        {
          start: 0,
          end: duration,
          text: burnHeadline.toUpperCase(),
        },
      ];
    }

    let subtitleFilterStr: string | null = null;
    if (srtEntries.length > 0) {
      // Karaoke ASS: the whole phrase stays on screen, the spoken word is
      // highlighted. (Previously one SRT entry per word in a single colour.)
      const playRes =
        aspectRatio === "16:9"
          ? { x: 1920, y: 1080 }
          : aspectRatio === "1:1"
            ? { x: 1080, y: 1080 }
            : { x: 1080, y: 1920 };
      let marginV = Math.round(playRes.y * 0.27);
      if (captionPositionY !== undefined) {
        marginV = Math.max(60, Math.min(playRes.y - 120, Math.round(playRes.y * (1 - captionPositionY / 100))));
      }
      const assContent = buildKaraokeAss(
        srtEntries.map((e) => ({ start: e.start, end: e.end, text: e.text })),
        captionStyle,
        marginV,
        playRes
      );

      tempSrtPath = path.join(dir, `sub-${Date.now()}-${Math.floor(Math.random() * 1000)}.ass`);
      fs.writeFileSync(tempSrtPath, assContent, "utf-8");

      // Save a debug copy to data/debug for validation/testing
      try {
        const debugDir = path.join(process.cwd(), "data", "debug");
        if (!fs.existsSync(debugDir)) fs.mkdirSync(debugDir, { recursive: true });
        fs.writeFileSync(path.join(debugDir, "last_subtitles.ass"), assContent, "utf-8");
      } catch {}

      console.log(
        `[Stage: Subtitle Alignment] Burning karaoke captions for ${srtEntries.length} words into clip: first="${srtEntries[0]?.text}" at relative ${srtEntries[0]?.start.toFixed(2)}s, last="${srtEntries[srtEntries.length - 1]?.text}" at relative ${srtEntries[srtEntries.length - 1]?.end.toFixed(2)}s`
      );

      const assEscaped = tempSrtPath.replace(/\\/g, "/").replace(/:/g, "\\:");
      subtitleFilterStr = `subtitles='${assEscaped}'`;
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
 * Generates a lightweight preview rendition of a rendered clip so in-browser
 * playback stays smooth on slow connections (max 720px wide, CRF 28, 96k
 * audio, faststart — typically 40-60% smaller than the master). The master
 * file remains the download/posting quality. Returns the preview file NAME
 * (same directory as the master) or null on failure — a preview problem
 * must never fail the render itself.
 */

/**
 * Extract a small JPEG poster (frame at ~1s) for a rendered clip. The
 * dashboard shows posters instead of auto-preloading every video —
 * on slow links a wall of <video preload="auto"> elements starves the
 * browser's per-host connection pool (6), which left players black
 * and even blocked API POSTs behind queued media fetches.
 */
export async function generatePosterImage(masterPath: string): Promise<string | null> {
  try {
    const resolved = resolveSafeFilePath(masterPath);
    if (!fs.existsSync(/*turbopackIgnore: true*/ resolved)) return null;
    const dir = path.dirname(resolved);
    const posterName = `poster-${path.basename(resolved).replace(/\.mp4$/i, "")}.jpg`;
    const posterPath = path.join(dir, posterName);
    if (fs.existsSync(/*turbopackIgnore: true*/ posterPath)) return posterName;
    const { execFile } = await import("child_process");
    await new Promise<void>((resolve, reject) => {
      execFile(
        /*turbopackIgnore: true*/ getFfmpegBinary(),
        ["-y", "-ss", "1", "-i", resolved, "-frames:v", "1", "-vf", "scale=360:-2", "-q:v", "4", posterPath],
        { timeout: 60000 },
        (err) => (err ? reject(err) : resolve())
      );
    });
    return fs.existsSync(/*turbopackIgnore: true*/ posterPath) ? posterName : null;
  } catch (err) {
    console.error("[Stage: Poster] Generation failed (non-fatal):", err);
    return null;
  }
}

export async function generatePreviewClip(masterPath: string): Promise<string | null> {
  try {
    const resolved = resolveSafeFilePath(masterPath);
    if (!fs.existsSync(/*turbopackIgnore: true*/ resolved)) return null;
    const dir = path.dirname(resolved);
    const previewName = `preview-${path.basename(resolved)}`;
    const previewPath = path.join(dir, previewName);
    if (fs.existsSync(/*turbopackIgnore: true*/ previewPath)) return previewName;

    const { execFile } = await import("child_process");
    await new Promise<void>((resolve, reject) => {
      execFile(
        /*turbopackIgnore: true*/ getFfmpegBinary(),
        [
          "-y",
          "-i", resolved,
          "-vf", "scale='min(720,iw)':-2",
          "-c:v", "libx264",
          "-preset", "veryfast",
          "-crf", "28",
          "-c:a", "aac",
          "-b:a", "96k",
          "-movflags", "+faststart",
          previewPath,
        ],
        { timeout: 180000 },
        (err) => (err ? reject(err) : resolve())
      );
    });
    return fs.existsSync(/*turbopackIgnore: true*/ previewPath) ? previewName : null;
  } catch (err) {
    console.error("[Stage: Preview] Generation failed (non-fatal):", err);
    return null;
  }
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

/* ------------------------------------------------------------------ */
/* Post effects: B-roll cutaways + punch-in zooms + ducked music bed   */
/* + captions burned ON TOP (reference-style edit assembly).           */
/* ------------------------------------------------------------------ */

export interface BrollCue {
  start: number; // clip-relative seconds
  end: number;
  assetPath: string;
  kind: "image" | "video";
}

export interface PostFxOptions {
  basePath: string;
  outputPath: string;
  duration: number;
  aspectRatio: "9:16" | "1:1" | "16:9";
  words: { start: number; end: number; text: string }[]; // clip-relative
  captionStyle: "hormozi" | "neon" | "beast" | "clean" | "kinetic";
  broll: BrollCue[];
  punches: { start: number; end: number }[]; // clip-relative
  musicBed: boolean;
}

function punchZoomExpr(punches: { start: number; end: number }[], fps = 30): string {
  let expr = "1";
  for (const p of punches) {
    const f1 = Math.max(0, Math.round(p.start * fps));
    const f2 = Math.max(f1 + 10, Math.round(p.end * fps));
    expr += `+0.13*max(0,min(1,min((in-${f1})/5,(${f2}-in)/5)))`;
  }
  return `min(1.16,${expr})`;
}

async function ensureMusicBed(): Promise<string | null> {
  const musicDir = path.join(process.cwd(), "data", "music");
  const custom = path.join(musicDir, "bed.mp3");
  if (fs.existsSync(custom)) return custom;
  const synth = path.join(musicDir, "bed-synth.mp3");
  if (fs.existsSync(synth)) return synth;
  try {
    fs.mkdirSync(musicDir, { recursive: true });
    // Warm low pad (A minor-ish stack) through a lowpass with a slow swell.
    // Deliberately quiet: sidechain ducking + the mix keep it under speech.
    await execFileP(
      getFfmpegBinary(),
      [
        "-y",
        "-f", "lavfi", "-i", "sine=frequency=110:duration=200",
        "-f", "lavfi", "-i", "sine=frequency=164.81:duration=200",
        "-f", "lavfi", "-i", "sine=frequency=220:duration=200",
        "-f", "lavfi", "-i", "sine=frequency=261.63:duration=200",
        "-filter_complex",
        "[0][1][2][3]amix=inputs=4:normalize=0,lowpass=f=650,volume=0.35+0.3*sin(2*PI*t/24):eval=frame,volume=0.5,afade=t=in:st=0:d=3",
        "-c:a", "libmp3lame", "-b:a", "96k",
        synth,
      ],
      { maxBuffer: 16 * 1024 * 1024 }
    );
    return fs.existsSync(synth) ? synth : null;
  } catch (err) {
    console.warn("[PostFX] Could not generate music bed:", err);
    return null;
  }
}

export async function applyPostEffects(opts: PostFxOptions): Promise<void> {
  const W = opts.aspectRatio === "16:9" ? 1920 : 1080;
  const H = opts.aspectRatio === "16:9" ? 1080 : opts.aspectRatio === "1:1" ? 1080 : 1920;

  const args: string[] = ["-y", "-i", opts.basePath];
  for (const cue of opts.broll) {
    const win = Math.max(0.6, cue.end - cue.start);
    if (cue.kind === "image") {
      args.push("-loop", "1", "-framerate", "30", "-t", win.toFixed(2), "-i", cue.assetPath);
    } else {
      args.push("-stream_loop", "-1", "-t", (win + 0.25).toFixed(2), "-i", cue.assetPath);
    }
  }
  let musicIdx = -1;
  if (opts.musicBed) {
    const bed = await ensureMusicBed();
    if (bed) {
      musicIdx = 1 + opts.broll.length;
      args.push("-stream_loop", "-1", "-i", bed);
    }
  }

  const filters: string[] = [];
  if (opts.punches.length > 0) {
    filters.push(
      `[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},zoompan=z='${punchZoomExpr(opts.punches)}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${W}x${H}:fps=30[base]`
    );
  } else {
    filters.push(`[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=30[base]`);
  }

  let last = "base";
  opts.broll.forEach((cue, i) => {
    const idx = i + 1;
    const win = Math.max(0.6, cue.end - cue.start);
    const frames = Math.max(10, Math.round(win * 30));
    if (cue.kind === "image") {
      const sw = Math.round(W * 1.25);
      const sh = Math.round(H * 1.25);
      // Ken Burns drift: pre-scaled still, crop window pans slowly across it.
      filters.push(
        `[${idx}:v]scale=${sw}:${sh}:force_original_aspect_ratio=increase,crop=${sw}:${sh},crop=${W}:${H}:x='(in_w-out_w)*(n/${frames})':y='(in_h-out_h)/2',setpts=PTS+${cue.start.toFixed(2)}/TB[b${i}]`
      );
    } else {
      const sw = Math.round(W * 1.08);
      const sh = Math.round(H * 1.08);
      filters.push(
        `[${idx}:v]scale=${sw}:${sh}:force_original_aspect_ratio=increase,crop=${W}:${H},setpts=PTS+${cue.start.toFixed(2)}/TB[b${i}]`
      );
    }
    filters.push(
      `[${last}][b${i}]overlay=0:0:enable='between(t,${cue.start.toFixed(2)},${cue.end.toFixed(2)})'[v${i}]`
    );
    last = `v${i}`;
  });

  // Captions last so they sit on top of base AND B-roll.
  let finalV = last;
  let assPath: string | null = null;
  if (opts.words.length > 0) {
    const playRes =
      opts.aspectRatio === "16:9" ? { x: 1920, y: 1080 } : opts.aspectRatio === "1:1" ? { x: 1080, y: 1080 } : { x: 1080, y: 1920 };
    const assContent = buildKaraokeAss(
      opts.words.map((w) => ({ start: w.start, end: w.end, text: w.text })),
      opts.captionStyle,
      Math.round(playRes.y * 0.27),
      playRes
    );
    const fxDir = path.join(process.cwd(), "data", "postfx");
    fs.mkdirSync(fxDir, { recursive: true });
    assPath = path.join(fxDir, `fx-${Date.now()}-${Math.floor(Math.random() * 10000)}.ass`);
    fs.writeFileSync(assPath, assContent, "utf-8");
    const assEscaped = assPath.replace(/\\/g, "/").replace(/:/g, "\\:");
    filters.push(`[${last}]subtitles='${assEscaped}'[vfinal]`);
    finalV = "vfinal";
  }

  const hasMusic = musicIdx >= 0;
  if (hasMusic) {
    filters.push(`[0:a]asplit=2[vo][side]`);
    filters.push(`[${musicIdx}:a]atrim=0:${opts.duration.toFixed(2)},asetpts=PTS-STARTPTS,volume=0.55[mus]`);
    filters.push(`[mus][side]sidechaincompress=threshold=0.02:ratio=9:attack=30:release=400[ducked]`);
    filters.push(`[vo][ducked]amix=inputs=2:duration=first:normalize=0[aout]`);
  }

  args.push("-filter_complex", filters.join(";"), "-map", `[${finalV}]`);
  if (hasMusic) args.push("-map", "[aout]");
  else args.push("-map", "0:a");
  args.push(
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
    "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart",
    opts.outputPath
  );

  try {
    await execFileP(getFfmpegBinary(), args, { maxBuffer: 64 * 1024 * 1024 });
    console.log(
      `[PostFX] Applied ${opts.broll.length} B-roll cue(s), ${opts.punches.length} punch zoom(s), music=${hasMusic}, captions=${opts.words.length > 0}`
    );
  } finally {
    if (assPath) {
      try { fs.unlinkSync(assPath); } catch {}
    }
  }
}
