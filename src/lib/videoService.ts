import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import path from "path";
import fs from "fs";
import os from "os";
import { spawn, execFile } from "child_process";
import util from "util";
import { emojiFor } from "./emojiMap";
import {
  parseCounter,
  formatCounter,
  filmLookFilter,
  fitBackgroundChain,
  hexToAss,
  isProfane,
  maskProfanity,
  detectHypeMoments,
  emojiImage,
  CAPTION_SIZE_SCALE,
  FitBackground,
  ClipStyle,
  MusicMood,
  DEFAULT_CLIP_STYLE,
  ensureMoodTrack,
  ensureSfx,
  planSfx,
  beatGrid,
  snapToBeat,
  gradeFilter,
  transitionFilter,
  STUDIO_VOICE_CHAIN,
  LOUDNESS_CHAIN,
} from "./clipStyle";

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
  captionStyle?: CaptionStyleName;
  // Render picture only; captions are burned later by applyPostEffects so
  // they can sit ON TOP of B-roll cutaways instead of underneath them.
  skipCaptions?: boolean;
  /** AI key phrases to colour in the captions. */
  keywords?: string[];
  /** Hook title shown in the upper third for the opening seconds. */
  hookTitle?: string;
  /** Caption font key (CAPTION_FONTS). */
  captionFont?: string;
  /** Background behind fitted (screen / wide) shots. */
  fitBackground?: FitBackground;
  /** Brand colour (#RRGGBB) for the "brand" fit background. */
  brandHex?: string;
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
  layoutSegments?: LayoutSegment[];
  video_w?: number;
  video_h?: number;
}

export interface LayoutSegment {
  start: number;
  end: number;
  layout: "crop" | "fit" | "split";
  panels?: { cx: number; cy: number; face_w: number; face_h: number }[];
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
 * Caption events must never overlap: libass stacks simultaneous events, so
 * two karaoke states of one phrase showed as the same line twice (seen in
 * testing). Overlaps are common — word timings from Whisper overlap, the
 * renderer pads words to >=0.2s, and silence-removal parts clamp early
 * words to 0. End every event where the next one starts.
 */
export function preventCaptionOverlaps(dialogues: string[]): string[] {
  const parseT = (s: string) => {
    const [h, m, sec] = s.split(":");
    return Number(h) * 3600 + Number(m) * 60 + Number(sec);
  };
  const evs = dialogues
    .map((line) => {
      const m = /^Dialogue: ([^,]*),([^,]*),([^,]*),(.*)$/.exec(line);
      return m ? { layer: m[1], start: parseT(m[2]), end: parseT(m[3]), rest: m[4] } : null;
    })
    .filter((e): e is { layer: string; start: number; end: number; rest: string } => e !== null)
    .sort((a, b) => a.start - b.start);
  const out: string[] = [];
  for (let i = 0; i < evs.length; i++) {
    const e = evs[i];
    const next = evs[i + 1];
    const end = next && next.start > e.start ? Math.min(e.end, next.start) : e.end;
    if (end - e.start < 0.03) continue;
    out.push(`Dialogue: ${e.layer},${formatAssTime(e.start)},${formatAssTime(end)},${e.rest}`);
  }
  return out;
}

/**
 * Karaoke-style captions: a short phrase stays
 * on screen while the currently-spoken word is highlighted in the accent
 * colour. Emitted as ASS with one Dialogue event per word; each event
 * re-renders the whole phrase with a different word highlighted, so there
 * is never a flicker or a lonely single word on screen.
 */
/** Every caption look the engine can burn. */
export const CAPTION_STYLES = [
  "snipcut", "kinetic", "hormozi", "neon", "beast", "clean",
  "boxed", "bounce", "typewriter", "slide", "glow",
] as const;
export type CaptionStyleName = (typeof CAPTION_STYLES)[number];

/** Bundled OFL fonts (assets/fonts) by key -> family name inside the file. */
export const CAPTION_FONTS: Record<string, string> = {
  default: "Arial",
  montserrat: "Montserrat Thin ExtraBold",
  bebas: "Bebas Neue",
  anton: "Anton",
  poppins: "Poppins ExtraBold",
  bangers: "Bangers",
  luckiest: "Luckiest Guy",
};

/** Narrow display fonts look small at the same point size: scale them up. */
export const CAPTION_FONT_SCALE: Record<string, number> = { bebas: 1.28, anton: 1.12, bangers: 1.18 };

export const FONTS_DIR = path.join(process.cwd(), "assets", "fonts");

/** ffmpeg subtitles filter for an .ass file, with the bundled fonts available. */
export function subtitlesFilter(assPath: string): string {
  const esc = (p: string) => p.replace(/\\/g, "/").replace(/:/g, "\\:");
  return `subtitles='${esc(assPath)}':fontsdir='${esc(FONTS_DIR)}'`;
}

export interface CaptionOptions {
  /** Caption font key (CAPTION_FONTS); default Arial. */
  font?: string;
  /** AI key phrases; their words (and any number) get a highlight colour. */
  keywords?: string[];
  /** Clip-relative spans where captions sit mid-screen (split-screen seam). */
  centerSpans?: { start: number; end: number }[];
  /** Hook title drawn in the upper third for the opening seconds. */
  hook?: { text: string; until?: number };
  /** Caption height was chosen by the user: every style honours marginV. */
  customMarginV?: boolean;
  textCase?: "upper" | "title" | "lower";
  /** Caption size multiplier (1 = the style's size). */
  sizeScale?: number;
  /** Who is talking when (0 / 1); speaker 2's spoken word gets a second colour. */
  speakerSpans?: { start: number; end: number; speaker: number }[];
  /** Brand colours (ASS &H00BBGGRR) for the spoken word and keywords. */
  brand?: { accent: string; kw: string };
  /** Second-language line under the captions. */
  translations?: { start: number; end: number; text: string }[];
  hookAnim?: string;
  endCard?: { text: string; sub?: string; start: number; end: number };
  lowerThird?: { name: string; title?: string };
  /** Numbers count up big on screen when they're said. */
  counters?: boolean;
  watermark?: { text: string; pos: string; opacity: number };
  /** Telestrator marks (x/y in % of the frame). */
  drawings?: { t: number; x: number; y: number; kind: "circle" | "arrow" }[];
}

const KEYWORD_STOPWORDS = new Set(
  "the a an and or but of to in on at for with from by is are was were be been being it its this that these those you your we our they their he she his her i me my mine us them as so if not no do does did have has had just very really than then there here what which who whom how why when where can could would should will shall may might must about into over under more most less much many some any all".split(" ")
);

const normWord = (t: string) => t.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Words (normalised) that make up the clip's key phrases. */
export function keywordSet(phrases?: string[]): Set<string> {
  const out = new Set<string>();
  for (const p of phrases || []) {
    for (const raw of String(p || "").split(/\s+/)) {
      const w = normWord(raw);
      if (w.length >= 3 && !KEYWORD_STOPWORDS.has(w)) out.add(w);
    }
  }
  return out;
}

/** Hard-wrap a title into lines of at most `max` characters (libass WrapStyle 2 never wraps). */
export function wrapTitle(text: string, max: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (cur && (cur + " " + w).length > max) {
      lines.push(cur);
      cur = w;
    } else {
      cur = cur ? `${cur} ${w}` : w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

export function stripEmoji(text: string): string {
  return text
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{2B00}-\u{2BFF}\u{200D}]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildKaraokeAss(
  words: KaraokeWord[],
  captionStyle: CaptionStyleName,
  marginV: number,
  playRes: { x: number; y: number } = { x: 1080, y: 1920 },
  options: CaptionOptions = {}
): string {
  // ASS colours are &HAABBGGRR. `kw` = keyword highlight colour (differs
  // from the spoken-word accent so both read at once).
  const palettes = {
    hormozi: { base: "&H00FFFFFF", accent: "&H0000FFFF", kw: "&H006BE322", size: 56, outline: 6 },
    neon: { base: "&H00FFFFFF", accent: "&H0000FF00", kw: "&H0000E5FF", size: 56, outline: 6 },
    beast: { base: "&H00FFFFFF", accent: "&H0000FFFF", kw: "&H00303BFF", size: 62, outline: 8 },
    clean: { base: "&H00FFFFFF", accent: "&H00FFFFFF", kw: "&H00FFFFFF", size: 46, outline: 3 },
    kinetic: { base: "&H00FFFFFF", accent: "&H0000FFFF", kw: "&H006BE322", size: 98, outline: 9 },
    boxed: { base: "&H00FFFFFF", accent: "&H0000D7FF", kw: "&H006BE322", size: 84, outline: 9 },
    bounce: { base: "&H00FFFFFF", accent: "&H0000FFFF", kw: "&H00FF7A2E", size: 86, outline: 10 },
    typewriter: { base: "&H00FFFFFF", accent: "&H0000FFFF", kw: "&H006BE322", size: 80, outline: 8 },
    slide: { base: "&H00FFFFFF", accent: "&H0062E85C", kw: "&H0000E5FF", size: 84, outline: 9 },
    glow: { base: "&H00FFFFFF", accent: "&H00FFF04D", kw: "&H00FF6BD8", size: 84, outline: 5 },
    snipcut: { base: "&H00FFFFFF", accent: "&H0000FFFF", kw: "&H006BE322", size: 74, outline: 10 },
  } as const;
  const kwSet = keywordSet(options.keywords);
  const isKeyword = (t: string) => {
    if (captionStyle === "clean") return false;
    const n = normWord(t);
    return n.length > 0 && (kwSet.has(n) || /\d/.test(n));
  };
  const centerSpans = options.centerSpans || [];
  // Split-screen: captions on the seam between the two panels, never over a face.
  const posTag = (t: number) =>
    centerSpans.some((s) => t >= s.start - 0.05 && t < s.end) ? "{\\an5}" : "";
  const palBase = palettes[captionStyle] || palettes.hormozi;
  const pal =
    options.brand && captionStyle !== "clean" ? { ...palBase, accent: options.brand.accent, kw: options.brand.kw } : palBase;
  const SPEAKER2 = pal.accent === "&H00FFC83C" ? "&H0000FFFF" : "&H00FFC83C";
  const speakerSpans = options.speakerSpans || [];
  // Spoken-word colour: speaker 2 gets a second colour.
  const A = (t: number) =>
    speakerSpans.some((s) => s.speaker === 1 && t >= s.start - 0.05 && t < s.end) ? SPEAKER2 : pal.accent;
  const cased = (t: string) =>
    options.textCase === "lower"
      ? t.toLowerCase()
      : options.textCase === "title"
        ? t.replace(/^(\P{L}*)(\p{L})/u, (_m, pre, c) => pre + c.toUpperCase())
        : t.toUpperCase();
  // Font size is authored against a 1920px-tall canvas; scale it to the
  // actual PlayRes so 16:9 / 1:1 renders don't get oversized captions.
  // Sizes are authored for a 1080px-wide 9:16 frame. Scale by the SHORT
  // side so 16:9 and 1:1 captions are as readable as 9:16 ones (scaling by
  // height/1920 shrank 16:9 captions to 56% — unreadable on a phone).
  const captionScale = Math.min(playRes.x, playRes.y) / 1080;
  const fontBoost = (CAPTION_FONT_SCALE[options.font || ""] || 1) * (options.sizeScale || 1);
  const fontSize = Math.max(20, Math.round(pal.size * captionScale * fontBoost));
  const snipcutMarginV = options.customMarginV ? marginV : Math.round(playRes.y * 0.16);
  const fontName = CAPTION_FONTS[options.font || "default"] || "Arial";
  const proSize = Math.max(20, Math.round(pal.size * captionScale * fontBoost));
  const hookSize = Math.max(20, Math.round(68 * captionScale));

  // Hook title: short white card with black text in the upper third
  // (clear of the platform UI) for the opening seconds, like pro edits.
  const hookEvents: string[] = [];
  const hookText = options.hook?.text ? stripEmoji(options.hook.text) : "";
  if (hookText) {
    const lastWordEnd = words.length ? words[words.length - 1].end : 3.2;
    const until = Math.max(1.2, Math.min(options.hook?.until ?? 3.2, lastWordEnd));
    // Fit the whole title in at most 3 lines by stepping the font down
    // (long titles used to be cut off mid-sentence after line 3).
    const charsFor = (size: number) => Math.max(10, Math.floor((playRes.x - 180) / (0.62 * size)));
    let hookFs = hookSize;
    let raw = wrapTitle(hookText, charsFor(hookFs));
    while (raw.length > 3 && hookFs > hookSize * 0.8) {
      hookFs = Math.round(hookFs * 0.88);
      raw = wrapTitle(hookText, charsFor(hookFs));
    }
    if (raw.length > 4) raw = [...raw.slice(0, 3), `${raw.slice(3).join(" ").slice(0, 28).trim()}…`];
    const lines = raw.map((l) =>
      l.replace(/\\/g, "\\\\").replace(/\{/g, "\\{").replace(/\}/g, "\\}")
    );
    if (lines.length) {
      const fsTag = hookFs !== hookSize ? `\\fs${hookFs}` : "";
      const hx = Math.round(playRes.x / 2);
      const hy = Math.round(playRes.y * 0.11);
      const anim = options.hookAnim || "pop";
      if (anim === "typewriter") {
        // Letters appear one after another, the card grows with them.
        const full = raw.join("\n");
        const steps = Math.min(full.length, 26);
        const span = Math.min(0.9, until * 0.4);
        for (let k = 1; k <= steps; k++) {
          const n = Math.round((full.length * k) / steps);
          const t0 = ((k - 1) / steps) * span;
          const t1 = k === steps ? until : (k / steps) * span;
          const txt = full
            .slice(0, n)
            .split("\n")
            .map((l) => l.replace(/\\/g, "\\\\").replace(/\{/g, "\\{").replace(/\}/g, "\\}"))
            .join("\\N");
          hookEvents.push(`Dialogue: 1,${formatAssTime(t0)},${formatAssTime(t1)},Hook,,0,0,0,,{${fsTag}${k === steps ? "\\fad(0,220)" : ""}}${txt}`);
        }
      } else {
        const tags =
          anim === "slide"
            ? `\\fad(60,220)\\move(${-Math.round(playRes.x * 0.6)},${hy},${hx},${hy},0,280)`
            : anim === "drop"
              ? `\\fad(60,220)\\move(${hx},${-Math.round(playRes.y * 0.12)},${hx},${hy},0,240)\\t(240,320,\\fscy90)\\t(320,400,\\fscy100)`
              : anim === "shake"
                ? "\\fad(120,220)\\fscx88\\fscy88\\t(0,160,1,\\fscx100\\fscy100)\\t(160,210,\\frz4)\\t(210,260,\\frz-4)\\t(260,310,\\frz2)\\t(310,360,\\frz0)"
                : "\\fad(120,220)\\fscx88\\fscy88\\t(0,160,1,\\fscx100\\fscy100)";
        hookEvents.push(`Dialogue: 1,${formatAssTime(0)},${formatAssTime(until)},Hook,,0,0,0,,{${fsTag}${tags}}${lines.join("\\N")}`);
      }
    }
  }

  const header = `[Script Info]
Title: Snipcut Karaoke Captions
ScriptType: v4.00+
PlayResX: ${playRes.x}
PlayResY: ${playRes.y}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Karaoke,${fontName},${fontSize},${pal.base},${pal.base},&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,${pal.outline},2,2,60,60,${marginV},1
Style: Kinetic,${fontName},${fontSize},${pal.base},${pal.base},&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,${pal.outline},3,5,40,40,0,1
Style: Snipcut,${fontName},${Math.max(20, Math.round(74 * captionScale * fontBoost))},&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,10,2,2,50,50,${snipcutMarginV},1
Style: Pro,${fontName},${proSize},${pal.base},${pal.base},&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,${pal.outline},2,2,50,50,${snipcutMarginV},1
Style: Sub,${fontName},${Math.max(18, Math.round(42 * captionScale))},&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,${Math.max(2, Math.round(4 * captionScale))},1,2,60,60,${Math.max(24, (captionStyle === "kinetic" ? Math.round(playRes.y * 0.16) : ["snipcut", "boxed", "bounce", "typewriter", "slide", "glow"].includes(captionStyle) ? snipcutMarginV : marginV) - Math.round(fontSize * 0.5) - Math.round(42 * captionScale))},1
Style: End,${fontName},${Math.max(24, Math.round(118 * captionScale))},&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,${Math.max(3, Math.round(8 * captionScale))},3,5,60,60,0,1
Style: LTName,${fontName},${Math.max(18, Math.round(50 * captionScale))},&H00111111,&H00111111,${pal.accent === "&H00FFFFFF" ? "&H0000D7FF" : pal.accent},&H00000000,-1,0,0,0,100,100,0,0,3,${Math.max(6, Math.round(14 * captionScale))},0,1,60,60,0,1
Style: LTTitle,${fontName},${Math.max(16, Math.round(36 * captionScale))},&H00FFFFFF,&H00FFFFFF,&H00111111,&H00000000,0,0,0,0,100,100,0,0,3,${Math.max(5, Math.round(11 * captionScale))},0,1,60,60,0,1
Style: Counter,${fontName},${Math.max(30, Math.round(150 * captionScale))},${pal.accent === "&H00FFFFFF" ? "&H0000FFFF" : pal.accent},&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,${Math.max(4, Math.round(10 * captionScale))},4,5,40,40,0,1
Style: Mark,${fontName},${Math.max(14, Math.round(34 * captionScale))},&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,-1,0,0,0,100,100,1,0,1,2,1,9,44,44,${Math.round(playRes.y * 0.05)},1
Style: Draw,Arial,20,&H00FFFFFF,&H00FFFFFF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,6,0,5,0,0,0,1
Style: Hook,Arial,${hookSize},&H00111111,&H00111111,&H00FFFFFF,&H00000000,-1,0,0,0,100,100,0,0,3,${Math.max(6, Math.round(20 * captionScale))},0,8,80,80,${Math.round(playRes.y * 0.11)},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
  const extraEvents = buildExtraEvents(words, options, {
    playRes,
    captionScale,
    fontSize,
    accent: pal.accent,
    kw: pal.kw,
    centred: (t: number) => posTag(t) !== "",
    hookUntil: hookText ? Math.max(1.2, Math.min(options.hook?.until ?? 3.2, words.length ? words[words.length - 1].end : 3.2)) : 0,
  });
  const finish = (evts: string[]) =>
    header + [...preventCaptionOverlaps(evts), ...hookEvents, ...extraEvents].join("\n") + "\n";

  const escapeAssText = (t: string) => t.replace(/\\/g, "\\\\").replace(/\{/g, "\\{").replace(/\}/g, "\\}");

  if (["boxed", "bounce", "typewriter", "slide", "glow"].includes(captionStyle)) {
    // Phrases of up to 4 words that fit one line; one event per spoken word.
    const lineBudget = playRes.x - 110;
    const wPx = (ws: KaraokeWord[]) =>
      ws.reduce((sum, w, i) => sum + w.text.length * 0.64 * proSize * 1.15 + (i > 0 ? 0.3 * proSize : 0), 0);
    const phrases: KaraokeWord[][] = [];
    let cur: KaraokeWord[] = [];
    for (const w of words) {
      if (cur.length > 0) {
        const prev = cur[cur.length - 1];
        if (cur.length >= 4 || w.start - prev.end > 0.5 || /[.!?]$/.test(prev.text) || wPx([...cur, w]) > lineBudget) {
          phrases.push(cur);
          cur = [];
        }
      }
      cur.push(w);
    }
    if (cur.length > 0) phrases.push(cur);
    const evts: string[] = [];
    const x = Math.round(playRes.x / 2);
    for (const phrase of phrases) {
      for (let i = 0; i < phrase.length; i++) {
        const w = phrase[i];
        const nextStart = i + 1 < phrase.length ? phrase[i + 1].start : w.end;
        const evEnd = Math.max(w.end, Math.min(nextStart, w.start + 0.12));
        const centred = posTag(w.start) !== "";
        const y = centred ? Math.round(playRes.y / 2) : playRes.y - snipcutMarginV;
        const an = centred ? 5 : 2;
        let lead = `{\\an${an}}`;
        if (captionStyle === "slide" && i === 0) {
          // The phrase slides up into place and fades in.
          lead = `{\\an${an}\\move(${x},${y + 70},${x},${y},0,160)\\fad(90,0)}`;
        } else if (captionStyle === "slide") {
          lead = `{\\an${an}\\pos(${x},${y})}`;
        }
        const parts = phrase.map((pw, j) => {
          const txt = escapeAssText(cased(pw.text));
          const kw = isKeyword(pw.text);
          if (captionStyle === "typewriter" && j > i) return `{\\alpha&HFF&}${txt}{\\r}`;
          if (j !== i) {
            if (captionStyle === "glow") return `{\\3c&H00000000&\\bord4\\blur1}${kw ? `{\\c${pal.kw}}` : ""}${txt}{\\r}`;
            return kw ? `{\\c${pal.kw}}${txt}{\\r}` : txt;
          }
          // The word being spoken.
          switch (captionStyle) {
            case "boxed":
              // A thick accent-coloured outline reads as a rounded box behind the word.
              return `{\\c&H00111111&\\3c${A(w.start)}\\bord${Math.round(16 * captionScale)}\\shad0}${txt}{\\r}`;
            case "bounce": {
              const shake = kw ? "\\t(130,170,\\frz5)\\t(170,210,\\frz-5)\\t(210,250,\\frz0)" : "";
              return `{\\c${A(w.start)}\\fscx135\\fscy135\\t(0,110,\\fscx92\\fscy92)\\t(110,190,\\fscx100\\fscy100)${shake}}${txt}{\\r}`;
            }
            case "typewriter":
              return `{\\c${A(w.start)}\\fad(60,0)}${txt}{\\r}`;
            case "glow":
              // White letters, strong coloured glow — readable, not a blur.
              return `{\\c&H00FFFFFF&\\3c${A(w.start)}\\bord7\\blur10\\fscx112\\fscy112\\t(0,120,\\fscx100\\fscy100)}${txt}{\\r}`;
            default:
              return `{\\c${A(w.start)}\\fscx112\\fscy112\\t(0,100,\\fscx100\\fscy100)}${txt}{\\r}`;
          }
        });
        evts.push(`Dialogue: 0,${formatAssTime(w.start)},${formatAssTime(evEnd)},Pro,,0,0,0,,${lead}${parts.join(" ")}`);
      }
    }
    return finish(evts);
  }

  if (captionStyle === "snipcut") {
    // Snipcut's caption look uses phrases of up to 5
    // words sit low-centre; the whole phrase stays on screen while the
    // spoken word turns accent-yellow with a slight pop. Auto-fit keeps
    // long phrases inside the frame (theirs occasionally overflow).
    const snipcutFont = Math.max(20, Math.round(74 * captionScale * fontBoost));
    // Estimated rendered width of a phrase (same model as the auto-fit below).
    const phraseWidth = (ws: KaraokeWord[]) =>
      ws.reduce((sum, pw, i) => sum + pw.text.length * 0.66 * snipcutFont * 1.16 + (i > 0 ? 0.32 * snipcutFont : 0), 0);
    const lineBudget = playRes.x - 100;
    const phrases: KaraokeWord[][] = [];
    let cur: KaraokeWord[] = [];
    for (const w of words) {
      if (cur.length > 0) {
        const prev = cur[cur.length - 1];
        // Also break before a word that would overflow the line: long
        // phrases used to be shrunk to fit, so caption size jumped between
        // big and small from one phrase to the next.
        if (
          cur.length >= 5 ||
          w.start - prev.end > 0.5 ||
          /[.!?]$/.test(prev.text) ||
          phraseWidth([...cur, w]) > lineBudget
        ) {
          phrases.push(cur);
          cur = [];
        }
      }
      cur.push(w);
    }
    if (cur.length > 0) phrases.push(cur);
    const evts: string[] = [];
    for (const phrase of phrases) {
      // Auto-fit per phrase at its widest (active word is 1.16x).
      const avail = playRes.x - 100;
      const est = phrase.reduce(
        (sum, w, i) => sum + w.text.length * 0.66 * snipcutFont * 1.16 + (i > 0 ? 0.32 * snipcutFont : 0),
        0
      );
      const fit = est > avail ? Math.max(0.6, avail / est) : 1;
      for (let i = 0; i < phrase.length; i++) {
        const w = phrase[i];
        const nextStart = i + 1 < phrase.length ? phrase[i + 1].start : w.end;
        const evEnd = Math.max(w.end, Math.min(nextStart, w.start + 0.12));
        const parts = phrase.map((pw, j) => {
          const txt = escapeAssText(cased(pw.text));
          if (j === i) {
            return `{\\c${A(w.start)}\\fs${Math.round(snipcutFont * fit * 1.16)}\\fscx116\\fscy116\\t(0,90,1,\\fscx100\\fscy100)}${txt}{\\r}`;
          }
          const kw = isKeyword(pw.text) ? `\\c${pal.kw}` : "";
          if (fit < 1 || kw) return `{${kw}${fit < 1 ? `\\fs${Math.round(snipcutFont * fit)}` : ""}}${txt}{\\r}`;
          return txt;
        });
        evts.push(
          `Dialogue: 0,${formatAssTime(w.start)},${formatAssTime(evEnd)},Snipcut,,0,0,0,,${posTag(w.start)}${parts.join(" ")}`
        );
      }
    }
    return finish(evts);
  }

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
      // An AI key phrase word beats the length heuristic.
      const kwIdx = chunk.findIndex((w) => isKeyword(w.text));
      if (kwIdx >= 0) emph = kwIdx;
      // Auto-fit: Arial Bold uppercase averages ~0.68em per glyph; if the
      // chunk would overflow the canvas, shrink the whole event uniformly.
      const avail = playRes.x - 96;
      const estWidth = chunk.reduce((sum, w, i) => {
        const fs = i === emph && chunk.length > 1 ? fontSize * 1.14 : fontSize;
        return sum + w.text.length * 0.68 * fs + (i > 0 ? 0.35 * fontSize : 0);
      }, 0);
      const fitScale = estWidth > avail ? Math.max(0.55, avail / estWidth) : 1;
      const parts = chunk.map((w, i) => {
        const txt = escapeAssText(cased(w.text));
        if (i === emph && chunk.length > 1) {
          const col = isKeyword(w.text) ? pal.kw : A(w.start);
          return `{\\c${col}\\fs${Math.round(fontSize * fitScale * 1.14)}}${txt}{\\r}`;
        }
        return txt;
      });
      const anim = `{\\fad(45,60)${fitScale < 1 ? `\\fs${Math.round(fontSize * fitScale)}` : ""}\\fscx115\\fscy115\\t(0,110,1,\\fscx100\\fscy100)}`;
      evts.push(`Dialogue: 0,${formatAssTime(start)},${formatAssTime(end)},Kinetic,,0,0,0,,${anim}${parts.join(" ")}`);
    });
    return finish(evts);
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
        const txt = escapeAss(cased(pw.text));
        if (captionStyle === "clean") {
          return j === i ? `{\\b1}${txt}{\\b0}` : txt;
        }
        if (j === i) return `{\\c${A(w.start)}\\fs${Math.round(fontSize * 1.12)}}${txt}{\\r}`;
        if (isKeyword(pw.text)) return `{\\c${pal.kw}}${txt}{\\r}`;
        return txt;
      });
      events.push(
        `Dialogue: 0,${formatAssTime(evStart)},${formatAssTime(evEnd)},Karaoke,,0,0,0,,${posTag(evStart)}${parts.join(" ")}`
      );
    }
  }
  return finish(events);
}


/** Layered extras: second-language line, end card, lower third, counters, watermark, drawings. */
function buildExtraEvents(
  words: KaraokeWord[],
  options: CaptionOptions,
  ctx: {
    playRes: { x: number; y: number };
    captionScale: number;
    fontSize: number;
    accent: string;
    kw: string;
    centred: (t: number) => boolean;
    hookUntil: number;
  }
): string[] {
  const out: string[] = [];
  const { playRes, captionScale } = ctx;
  const esc = (t: string) => t.replace(/\\/g, "\\\\").replace(/\{/g, "\\{").replace(/\}/g, "\\}");
  const cx = Math.round(playRes.x / 2);
  const T = formatAssTime;

  for (const tl of options.translations || []) {
    if (!tl.text) continue;
    const pos = ctx.centred(tl.start) ? `{\\an8\\pos(${cx},${Math.round(playRes.y / 2 + ctx.fontSize * 0.75)})}` : "";
    out.push(`Dialogue: 0,${T(tl.start)},${T(tl.end)},Sub,,0,0,0,,${pos}${esc(tl.text)}`);
  }

  if (options.endCard && options.endCard.end > options.endCard.start) {
    const ec = options.endCard;
    const sub = ec.sub ? `\\N{\\c${ctx.kw}\\fs${Math.round(64 * captionScale)}}${esc(ec.sub)}` : "";
    out.push(
      `Dialogue: 4,${T(ec.start)},${T(ec.end)},End,,0,0,0,,{\\an5\\pos(${cx},${Math.round(playRes.y * 0.44)})\\fad(160,0)\\fscx40\\fscy40\\t(0,220,\\fscx112\\fscy112)\\t(220,360,\\fscx100\\fscy100)}${esc(ec.text)}${sub}`
    );
  }

  if (options.lowerThird?.name) {
    const lt = options.lowerThird;
    const last = words.length ? words[words.length - 1].end : 6;
    const t0 = Math.min(0.6, last);
    const t1 = Math.min(Math.max(t0 + 1.5, 4.8), last + 0.5);
    const y = Math.round(playRes.y * (playRes.y > playRes.x ? 0.66 : 0.72));
    const x = Math.round(60 * captionScale);
    out.push(`Dialogue: 3,${T(t0)},${T(t1)},LTName,,0,0,0,,{\\an1\\move(${-playRes.x},${y},${x},${y},0,320)\\fad(0,250)}${esc(lt.name.toUpperCase())}`);
    if (lt.title) {
      const y2 = y + Math.round(64 * captionScale);
      out.push(`Dialogue: 3,${T(t0 + 0.12)},${T(t1)},LTTitle,,0,0,0,,{\\an1\\move(${-playRes.x},${y2},${x},${y2},0,320)\\fad(0,250)}${esc(lt.title)}`);
    }
  }

  if (options.counters) {
    let n = 0;
    let lastAt = -10;
    for (const w of words) {
      const c = w.text.split(/\s+/).map((tok) => parseCounter(tok)).find((x) => x) || null;
      if (!c || n >= 3 || w.start - lastAt < 3 || w.start < ctx.hookUntil + 0.1) continue;
      n++;
      lastAt = w.start;
      const steps = 12;
      const stepDur = 0.045;
      const y = Math.round(playRes.y * (playRes.y > playRes.x ? 0.3 : 0.32));
      for (let k = 0; k < steps; k++) {
        const f = (k + 1) / steps;
        const eased = 1 - Math.pow(1 - f, 3);
        const t0 = w.start + k * stepDur;
        const t1 = k === steps - 1 ? Math.max(w.end + 0.9, t0 + 0.6) : t0 + stepDur;
        const tags = k === 0 ? "\\fscx70\\fscy70\\t(0,120,\\fscx100\\fscy100)" : k === steps - 1 ? "\\fscx118\\fscy118\\t(0,140,\\fscx100\\fscy100)\\fad(0,200)" : "";
        out.push(`Dialogue: 3,${T(t0)},${T(t1)},Counter,,0,0,0,,{\\an5\\pos(${cx},${y})${tags}}${esc(formatCounter(c, c.value * eased))}`);
      }
    }
  }

  if (options.watermark?.text) {
    const wm = options.watermark;
    const an = wm.pos === "top-left" ? 7 : wm.pos === "bottom-left" ? 1 : wm.pos === "bottom-right" ? 3 : 9;
    const alpha = Math.round(255 * (1 - Math.min(100, Math.max(10, wm.opacity)) / 100))
      .toString(16)
      .padStart(2, "0")
      .toUpperCase();
    const end = (words.length ? words[words.length - 1].end : 60) + 60;
    out.push(`Dialogue: 5,${T(0)},${T(end)},Mark,,0,0,0,,{\\an${an}\\alpha&H${alpha}&}${esc(wm.text)}`);
  }

  for (const d of options.drawings || []) {
    const x = Math.round((d.x / 100) * playRes.x);
    const y = Math.round((d.y / 100) * playRes.y);
    const sc = Math.round(100 * captionScale);
    if (d.kind === "arrow") {
      out.push(
        `Dialogue: 6,${T(d.t)},${T(d.t + 1.8)},Draw,,0,0,0,,{\\an2\\move(${x},${y - Math.round(120 * captionScale)},${x},${y},0,220)\\fscx${sc}\\fscy${sc}\\bord4\\3c&H00000000&\\1c${ctx.accent}\\shad0\\fad(80,250)\\p1}m 22 0 l 48 0 l 48 110 l 70 110 l 35 165 l 0 110 l 22 110{\\p0}`
      );
    } else {
      const r = 90;
      const k = Math.round(r * 0.552);
      const d2 = 2 * r;
      const path = `m 0 ${r} b 0 ${r - k} ${r - k} 0 ${r} 0 b ${r + k} 0 ${d2} ${r - k} ${d2} ${r} b ${d2} ${r + k} ${r + k} ${d2} ${r} ${d2} b ${r - k} ${d2} 0 ${r + k} 0 ${r}`;
      out.push(
        `Dialogue: 6,${T(d.t)},${T(d.t + 1.8)},Draw,,0,0,0,,{\\an5\\pos(${x},${y})\\fscx${Math.round(sc * 0.2)}\\fscy${Math.round(sc * 0.2)}\\t(0,200,\\fscx${sc}\\fscy${sc})\\bord7\\3c${ctx.accent}\\1a&HFF&\\shad0\\fad(0,250)\\p1}${path}{\\p0}`
      );
    }
  }
  return out;
}

/**
 * Clip-relative spans where captions should sit mid-screen: the whole clip
 * for a split-screen render, or each split layout segment of a mixed
 * (crop / fit / split) render. Bottom captions there cover the lower
 * speaker's face; the seam between the panels is free.
 */
export function captionCenterSpans(
  tracking: TrackingResult | null | undefined,
  duration: number,
  aspectRatio: string
): { start: number; end: number }[] {
  if (!tracking || aspectRatio !== "9:16") return [];
  if (tracking.mode === "split-screen" && tracking.filter_type === "filter_complex") {
    return [{ start: 0, end: duration }];
  }
  return (tracking.layoutSegments || [])
    .filter((s) => s.layout === "split")
    .map((s) => ({ start: s.start, end: s.end }));
}

/**
 * Runs deep-learning AI subject tracking for automatic reframing
 * Computes optimal 9:16 crop box keeping speaker centered or multi-mode layout
 */
export async function detectSubjectAndReframe(
  videoPath: string,
  startTime: number,
  duration: number,
  mode: ReframeMode = "auto-tracker",
  speechSpans?: { start: number; end: number }[],
  aspect: "9:16" | "1:1" = "9:16"
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
      "--aspect",
      aspect,
    ];
    if (speechSpans && speechSpans.length > 0) {
      try {
        wordsPath = path.join(os.tmpdir(), `snipcut-speech-${process.pid}-${Date.now()}.json`);
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
  keywords,
  hookTitle,
  captionFont,
  fitBackground,
  brandHex,
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
          trackingResult.layoutSuggestion === "split-screen" &&
          !trackingResult.layoutSegments?.length
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
  } else if (aspectRatio === "1:1" && (effectiveMode === "auto-tracker" || effectiveMode === "split-screen")) {
    // Square output follows the speaker too (it used to be a fixed centre
    // crop that cut two-person shots in half). Split/fit layouts are 9:16-
    // only, so 1:1 always gets the tracked single crop.
    try {
      const tracked = await detectSubjectAndReframe(resolvedInput, startTime, duration, "auto-tracker", transcript, "1:1");
      if (tracked?.status === "success" && tracked.filter_type === "vf" && /scale=1080:1080/.test(tracked.filter_value || "")) {
        trackingResult = { ...tracked, layoutSegments: [] };
      }
    } catch (e) {
      console.warn("AI Tracking warning (1:1):", e);
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
      const fromWords = Boolean(transcript && transcript.length > 0);
      const assContent = buildKaraokeAss(
        srtEntries.map((e) => ({ start: e.start, end: e.end, text: e.text })),
        captionStyle,
        marginV,
        playRes,
        {
          keywords,
          centerSpans:
            effectiveMode === "auto-tracker" || effectiveMode === "split-screen"
              ? captionCenterSpans(trackingResult, duration, aspectRatio)
              : [],
          hook: fromWords && hookTitle ? { text: hookTitle } : undefined,
          font: captionFont,
          customMarginV: captionPositionY !== undefined,
        }
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

      subtitleFilterStr = subtitlesFilter(tempSrtPath);
    }

    if (fitBackground && fitBackground !== "blur" && trackingResult.filter_value?.includes("boxblur=22:5")) {
      trackingResult.filter_value = trackingResult.filter_value.replace("boxblur=22:5", fitBackgroundChain(fitBackground, brandHex));
    }
    const runMainRender = () => {
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
      const tracked1x1 = /scale=1080:1080/.test(trackingResult.filter_value || "");
      const filters = [
        tracked1x1 ? trackingResult.filter_value : "scale=1080:1080:force_original_aspect_ratio=increase,crop=1080:1080",
      ];
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
    };

    // Tracker v3 per-shot layouts: when the clip mixes compositions
    // (crop / fit / split), render segment-by-segment and join; any
    // failure falls back to the single-pass render above.
    const layoutSegs = trackingResult.layoutSegments;
    const useSegmented =
      aspectRatio === "9:16" &&
      effectiveMode === "auto-tracker" &&
      Array.isArray(layoutSegs) &&
      layoutSegs.length > 0 &&
      layoutSegs.some((s) => s.layout !== "crop");
    if (useSegmented) {
      renderSegmentedClip({
        input: resolvedInput,
        output: resolvedOutput,
        startTime,
        segments: layoutSegs as LayoutSegment[],
        cropFilter: trackingResult.filter_value,
        videoW: trackingResult.video_w || 1920,
        videoH: trackingResult.video_h || 1080,
        subtitleFilterStr,
        fitBg: fitBackgroundChain(fitBackground, brandHex),
      })
        .then(() => {
          if (tempSrtPath && fs.existsSync(tempSrtPath)) {
            try {
              fs.unlinkSync(tempSrtPath);
            } catch {}
          }
          const elapsedMs = Date.now() - renderStartTime;
          const sizeBytes = fs.existsSync(resolvedOutput) ? fs.statSync(resolvedOutput).size : 0;
          console.log(
            `[Stage: FFmpeg Render] Finished segmented render in ${elapsedMs}ms -> ${resolvedOutput} (${sizeBytes} bytes)`
          );
          resolve({ outputPath: resolvedOutput, tracking: trackingResult });
        })
        .catch((err) => {
          console.warn("[Stage: Layouts] Segmented render failed, falling back to single-pass:", err);
          runMainRender();
        });
    } else {
      runMainRender();
    }
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

/**
 * Thumbnail for a clip that hasn't been rendered yet: one frame of the
 * source at the clip's start, centre-cropped to 9:16 (the dashboard showed
 * black boxes for these). Written to public/rendered_clips; returns the
 * file name or null. Never fatal.
 */
export async function generateSourcePoster(sourcePath: string, atSec: number, name: string): Promise<string | null> {
  try {
    const resolved = resolveSafeFilePath(sourcePath);
    const dir = path.join(process.cwd(), "public", "rendered_clips");
    fs.mkdirSync(dir, { recursive: true });
    const posterName = `poster-src-${name.replace(/[^a-zA-Z0-9_-]/g, "_")}.jpg`;
    const posterPath = path.join(dir, posterName);
    if (fs.existsSync(/*turbopackIgnore: true*/ posterPath)) return posterName;
    await execFileP(
      getFfmpegBinary(),
      [
        "-y", "-ss", Math.max(0, atSec).toFixed(2), "-i", resolved, "-frames:v", "1",
        "-vf", "crop='min(iw,ih*9/16)':ih,scale=360:-2", "-q:v", "4", posterPath,
      ],
      { timeout: 60000 }
    );
    return fs.existsSync(/*turbopackIgnore: true*/ posterPath) ? posterName : null;
  } catch (err) {
    console.error("[Stage: Poster] Source thumbnail failed (non-fatal):", err);
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
  captionStyle: CaptionStyleName;
  broll: BrollCue[];
  punches: { start: number; end: number }[]; // clip-relative
  musicBed: boolean;
  /** Same caption extras as renderVideoClip (times clip-relative). */
  captionOptions?: CaptionOptions;
  captionPositionY?: number;
  /** Music, sound effects, voice, grade, transitions, push-in. */
  style?: ClipStyle;
  /** Mood of the music bed (resolved, not "auto"). */
  musicMood?: MusicMood;
  /** Clip-relative times of cuts (silence-removal joins) for transitions + whooshes. */
  transitionTimes?: number[];
  /** AI narrator intro (plays over a frozen first frame). */
  voiceover?: { path: string; duration: number } | null;
  /** Uploaded music track (replaces the mood music). */
  musicPath?: string | null;
  /** Clip-relative fitted (screen / wide) shots: where the face bubble goes. */
  fitSpans?: { start: number; end: number }[];
  /** Source width / height (face bubble geometry). */
  sourceAspect?: number;
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

/**
 * Punch-in zoom candidates from clip-RELATIVE words: emphasis words
 * (long or digit-bearing), max 3, at least 2.4s apart. Shared by the
 * job pipeline and the render-clip FX path.
 */
export function pickPunchZooms(
  relWords: { text: string; start: number; end: number }[],
  /** Only zoom where this allows (talking-head shots, no B-roll on screen). */
  allowed?: (start: number, end: number) => boolean
): { start: number; end: number }[] {
  const punches: { start: number; end: number }[] = [];
  for (const w of relWords) {
    const clean = (w.text || "").replace(/[^A-Za-z0-9]/g, "");
    if (clean.length < 8 && !/\d/.test(clean)) continue;
    if (punches.length > 0 && w.start - punches[punches.length - 1].start < 2.4) continue;
    const p = { start: Math.max(0, w.start - 0.05), end: w.start + 0.85 };
    if (allowed && !allowed(p.start, p.end)) continue;
    punches.push(p);
    if (punches.length >= 3) break;
  }
  return punches;
}

/**
 * Segmented layout render (tracker v3): each layout segment of the clip
 * is rendered with the composition that fits its content — dynamic crop
 * (global camera path, time-offset per segment), fit (whole frame over a
 * blurred backdrop) or split (per-speaker panel crops) — then the pieces
 * are concatenated and captions are burned across the joined video.
 * Throws on any failure; the caller falls back to the single-pass render.
 */
export async function renderSegmentedClip(opts: {
  input: string;
  output: string;
  startTime: number;
  segments: LayoutSegment[];
  cropFilter: string;
  videoW: number;
  videoH: number;
  subtitleFilterStr: string | null;
  fitBg?: string;
}): Promise<void> {
  const ff = getFfmpegBinary();
  const tmpDir = path.join(path.dirname(opts.output), `segfx-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  const even = (n: number) => Math.max(2, Math.round(n / 2) * 2);
  const MB = { maxBuffer: 64 * 1024 * 1024 };
  try {
    const segs: LayoutSegment[] = [];
    for (const s of opts.segments) {
      if (segs.length && s.end - s.start < 0.35) {
        segs[segs.length - 1].end = s.end;
        continue;
      }
      segs.push({ ...s });
    }
    if (!segs.length) throw new Error("no layout segments");
    const segFiles: string[] = [];
    for (let i = 0; i < segs.length; i++) {
      const seg = segs[i];
      const dur = Math.max(0.2, seg.end - seg.start);
      const out = path.join(tmpDir, `seg-${i}.mp4`);
      const base = [
        "-hide_banner", "-loglevel", "error",
        "-ss", String(opts.startTime + seg.start),
        "-t", String(dur),
        "-i", opts.input,
      ];
      const enc = [
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
        "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k",
        "-ar", "44100", "-ac", "2", "-y", out,
      ];
      if (seg.layout === "fit") {
        const fc =
          `[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,${opts.fitBg || "gblur=sigma=24"},setsar=1[bg];` +
          "[0:v]scale=1080:-2,setsar=1[fg];[bg][fg]overlay=(W-w)/2:(H-h)/2,fps=30[v]";
        await execFileP(ff, [...base, "-filter_complex", fc, "-map", "[v]", "-map", "0:a?", ...enc], MB);
      } else if (seg.layout === "split" && seg.panels && seg.panels.length >= 2) {
        const panel = (p: { cx: number; cy: number; face_h: number }) => {
          let pw = even(Math.min(opts.videoW, Math.max(140, p.face_h * 3.0)));
          let ph = even(Math.min(opts.videoH, (pw * 8) / 9));
          if (ph >= opts.videoH) {
            ph = even(opts.videoH);
            pw = even(Math.min(opts.videoW, (ph * 9) / 8));
          }
          const px = Math.round(Math.min(Math.max(0, p.cx - pw / 2), Math.max(0, opts.videoW - pw)));
          const py = Math.round(Math.min(Math.max(0, p.cy - ph * 0.42), Math.max(0, opts.videoH - ph)));
          return `crop=${pw}:${ph}:${px}:${py}`;
        };
        const fc =
          `[0:v]${panel(seg.panels[0])},scale=1080:960:force_original_aspect_ratio=increase,crop=1080:960,setsar=1[top];` +
          `[0:v]${panel(seg.panels[1])},scale=1080:960:force_original_aspect_ratio=increase,crop=1080:960,setsar=1[bot];` +
          "[top][bot]vstack=inputs=2,fps=30[v]";
        await execFileP(ff, [...base, "-filter_complex", fc, "-map", "[v]", "-map", "0:a?", ...enc], MB);
      } else {
        const vf =
          opts.cropFilter.replace(/\bt\b/g, `(t+${seg.start.toFixed(2)})`) +
          ",fps=30,setsar=1";
        await execFileP(ff, [...base, "-vf", vf, ...enc], MB);
      }
      if (!fs.existsSync(out)) throw new Error(`layout segment ${i} produced no file`);
      segFiles.push(out);
    }
    const listPath = path.join(tmpDir, "list.txt");
    fs.writeFileSync(listPath, segFiles.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join("\n"));
    const joined = path.join(tmpDir, "joined.mp4");
    try {
      await execFileP(ff, ["-hide_banner", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", "-y", joined], MB);
    } catch {
      await execFileP(ff, ["-hide_banner", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", listPath, "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-c:a", "aac", "-b:a", "192k", "-y", joined], MB);
    }
    if (opts.subtitleFilterStr) {
      await execFileP(
        ff,
        ["-hide_banner", "-loglevel", "error", "-i", joined, "-vf", opts.subtitleFilterStr, "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-c:a", "copy", "-movflags", "+faststart", "-y", opts.output],
        MB
      );
    } else {
      fs.copyFileSync(joined, opts.output);
    }
    console.log(`[Stage: Layouts] Segmented render used ${segs.length} segment(s): ${segs.map((s) => s.layout).join("/")}`);
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  }
}

/**
 * B-roll cue discipline. Cues used to inherit full sentence lengths
 * (up to ~8s each), could sit back-to-back, and together cover most of
 * a clip — burying the actual footage and any split-screen work under
 * stock imagery. Now: max 2.5s per cue, at least 1.5s of real footage
 * between cues, and total coverage capped at ~20% of the clip.
 */
export function shapeBrollCues<T extends { start: number; end: number }>(cues: T[], duration: number): T[] {
  const MAX_CUE = 2.5;
  const MIN_GAP = 1.5;
  // The first seconds are the hook: viewers decide to stay by seeing the
  // speaker say it. A cutaway at 0s (seen in testing: 3s of stock laptop
  // footage over the opening line) hides exactly that, and becomes the
  // thumbnail too. Keep the speaker on screen for the opening.
  const HOOK_CLEAR = Math.min(3.0, duration * 0.2);
  const budget = Math.max(0, duration * 0.2);
  const sorted = [...cues].sort((a, b) => a.start - b.start);
  const out: T[] = [];
  let used = 0;
  let lastEnd = HOOK_CLEAR - MIN_GAP;
  for (const cue of sorted) {
    const start = Math.max(cue.start, lastEnd + MIN_GAP);
    if (start >= duration - 0.4) continue;
    let len = Math.min(MAX_CUE, cue.end - cue.start, duration - start);
    if (len < 0.6) continue;
    if (used + len > budget) {
      if (out.length === 0) len = Math.max(0.6, Math.min(len, budget));
      else continue;
    }
    const shaped = { ...cue, start: Number(start.toFixed(2)), end: Number((start + len).toFixed(2)) };
    out.push(shaped);
    used += len;
    lastEnd = shaped.end;
  }
  if (out.length !== cues.length) {
    console.log(`[PostFX] B-roll discipline: ${cues.length} cue(s) -> ${out.length} (coverage ${used.toFixed(1)}s of ${duration.toFixed(1)}s)`);
  }
  return out;
}

/**
 * Never bury a split-screen under B-roll: the split IS the visual.
 * Drops cues overlapping a split layout segment by more than 0.4s.
 * All times are clip-relative.
 */
export function dropCuesOverlappingSplits<T extends { start: number; end: number }>(
  cues: T[],
  layoutSegments?: { layout: string; start: number; end: number }[] | null
): T[] {
  if (!layoutSegments?.length) return cues;
  const splits = layoutSegments.filter((s) => s.layout === "split");
  if (!splits.length) return cues;
  const kept = cues.filter(
    (cue) => !splits.some((s) => Math.min(cue.end, s.end) - Math.max(cue.start, s.start) > 0.4)
  );
  if (kept.length !== cues.length) {
    console.log(`[PostFX] Dropped ${cues.length - kept.length} B-roll cue(s) overlapping split-screen segments`);
  }
  return kept;
}

export interface PostFxResult {
  /** Final clip length (pace, inserts and teaser included). */
  duration: number;
  /** Clip-relative time before the effects pass -> time in the final clip. */
  mapTime: (t: number) => number;
  /** [cutTime, finalTime] knots (see timeline.ts); [] when the clock is unchanged. */
  knots: [number, number][];
  /** Big moments found (final clip times). */
  hype: number[];
  notes: string[];
}

type TimelineInsert = { at: number; dur: number; audio: string | null; desat: boolean };

/**
 * Timeline pre-pass: playback speed (pitch kept) and inserted holds — a
 * frozen first frame under the AI voiceover intro, a freeze-frame (with
 * record scratch) on the big moment. Everything after an insert moves later.
 */
async function prepassTimeline(input: string, output: string, duration: number, pace: number, inserts: TimelineInsert[]): Promise<void> {
  const total = duration / pace;
  const ins = [...inserts].sort((a, b) => a.at - b.at).map((i) => ({ ...i, cut: Math.min(total, i.at / pace) }));
  const bounds = Array.from(new Set([0, ...ins.map((i) => Number(i.cut.toFixed(3))), Number(total.toFixed(3))])).sort((a, b) => a - b);
  const segs: { s: number; e: number }[] = [];
  for (let i = 0; i + 1 < bounds.length; i++) if (bounds[i + 1] - bounds[i] > 0.04) segs.push({ s: bounds[i], e: bounds[i + 1] });
  if (!segs.length) segs.push({ s: 0, e: total });
  const args = ["-y", "-i", input];
  const audioIdx = new Map<TimelineInsert, number>();
  let next = 1;
  for (const i of ins) {
    if (i.audio) {
      args.push("-i", i.audio);
      audioIdx.set(i as TimelineInsert, next++);
    }
  }
  const AF = "aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo";
  const f: string[] = [];
  const vs = segs.map((_, i) => `[vs${i}]`).join("");
  const as = segs.map((_, i) => `[as${i}]`).join("");
  f.push(`[0:v]setpts=(PTS-STARTPTS)/${pace},fps=30,split=${segs.length}${vs}`);
  f.push(`[0:a]asetpts=PTS-STARTPTS${pace !== 1 ? `,atempo=${pace}` : ""},${AF},asplit=${segs.length}${as}`);
  const audioOrder: string[] = [];
  ins.forEach((i, k) => {
    const idx = audioIdx.get(i as TimelineInsert);
    f.push(
      idx !== undefined
        ? `[${idx}:a]${AF},apad,atrim=0:${i.dur.toFixed(3)},asetpts=PTS-STARTPTS[ia${k}]`
        : `anullsrc=r=48000:cl=stereo,atrim=0:${i.dur.toFixed(3)},${AF}[ia${k}]`
    );
  });
  segs.forEach((sg, n) => {
    const len = sg.e - sg.s;
    let v = `[vs${n}]trim=start=${sg.s.toFixed(3)}:end=${sg.e.toFixed(3)},setpts=PTS-STARTPTS`;
    const before: string[] = [];
    const after: string[] = [];
    ins.forEach((i, k) => {
      if (Math.abs(i.cut - sg.s) < 0.03 && sg.s < 0.03) {
        v += `,tpad=start_mode=clone:start_duration=${i.dur.toFixed(3)}`;
        before.push(`[ia${k}]`);
      } else if (Math.abs(i.cut - sg.e) < 0.03) {
        v += `,tpad=stop_mode=clone:stop_duration=${i.dur.toFixed(3)}`;
        if (i.desat) v += `,hue=s=0.15:enable='gte(t,${len.toFixed(3)})',eq=contrast=1.15:enable='gte(t,${len.toFixed(3)})'`;
        after.push(`[ia${k}]`);
      }
    });
    f.push(`${v}[sv${n}]`);
    f.push(`[as${n}]atrim=start=${sg.s.toFixed(3)}:end=${sg.e.toFixed(3)},asetpts=PTS-STARTPTS[sa${n}]`);
    audioOrder.push(...before, `[sa${n}]`, ...after);
  });
  f.push(`${segs.map((_, n) => `[sv${n}]`).join("")}concat=n=${segs.length}:v=1:a=0[pv]`);
  f.push(`${audioOrder.join("")}concat=n=${audioOrder.length}:v=0:a=1[pa]`);
  args.push(
    "-filter_complex", f.join(";"), "-map", "[pv]", "-map", "[pa]",
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "17", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "192k", output
  );
  await execFileP(getFfmpegBinary(), args, { maxBuffer: 64 * 1024 * 1024 });
}

/** Zoom expression parts: punches by zoom type, hype hits, and the shake they carry. */
function zoomParts(punches: { start: number; end: number }[], type: string, hype: number[], fps = 30) {
  const z: string[] = [];
  const shake: string[] = [];
  const ramp = type === "smooth" ? 14 : 5;
  const amt = type === "smooth" ? 0.09 : type === "whip" ? 0.2 : 0.13;
  for (const p of punches) {
    const f1 = Math.max(0, Math.round(p.start * fps));
    const f2 = Math.max(f1 + 10, Math.round(p.end * fps));
    const win =
      type === "whip"
        ? `max(0,min(1,(in-${f1})/2))*exp(-max(0,in-${f1})/10)`
        : `max(0,min(1,min((in-${f1})/${ramp},(${f2}-in)/${ramp})))`;
    z.push(`${amt}*${win}`);
    if (type === "shake") shake.push(win);
  }
  for (const h of hype) {
    const f1 = Math.max(0, Math.round(h * fps));
    const win = `max(0,min(1,min((in-${f1})/3,(${f1 + 26}-in)/6)))`;
    z.push(`0.17*${win}`);
    shake.push(win);
  }
  return { z, shake };
}

const between = (spans: { start: number; end: number }[]) =>
  spans.map((s) => `between(t\\,${s.start.toFixed(3)}\\,${s.end.toFixed(3)})`).join("+");

export async function applyPostEffects(opts: PostFxOptions): Promise<PostFxResult> {
  const W = opts.aspectRatio === "16:9" ? 1920 : 1080;
  const H = opts.aspectRatio === "16:9" ? 1080 : opts.aspectRatio === "1:1" ? 1080 : 1920;
  const style: ClipStyle = opts.style || { ...DEFAULT_CLIP_STYLE, sfx: false, voiceEnhance: false, pushIn: false };
  const notes: string[] = [];
  const temp: string[] = [];
  const fxDir = path.join(process.cwd(), "data", "postfx");
  fs.mkdirSync(fxDir, { recursive: true });
  const stamp = `${Date.now()}-${Math.floor(Math.random() * 10000)}`;
  let basePath = opts.basePath;
  let duration = opts.duration;
  const cutDuration = opts.duration;
  let words = opts.words.map((w) => ({ ...w }));
  let punchesIn = opts.punches;
  let brollIn = opts.broll;
  let transitionsIn = (opts.transitionTimes || []).filter((t) => t > 0.3 && t < opts.duration - 0.3);
  const capOpts: CaptionOptions = { ...(opts.captionOptions || {}) };
  let fitSpans = opts.fitSpans || [];

  // Big moments (loudness peaks) on the clip as cut.
  const wantHype = style.hypeMoments || style.freezeFrame || style.coldOpen;
  let hype = wantHype ? await detectHypeMoments(basePath, duration, 2) : [];
  if (wantHype && !hype.length) notes.push("no stand-out moment found for hype / freeze / cold open");

  // Profanity: masked in the captions, bleeped in the audio.
  let bleeps: { start: number; end: number }[] = [];
  if (style.bleep) {
    for (const w of words) {
      if (isProfane(w.text)) {
        bleeps.push({ start: Math.max(0, w.start - 0.03), end: w.end + 0.03 });
        w.text = maskProfanity(w.text);
      }
    }
  }

  // ---- timeline: pace, voiceover intro, freeze-frame -------------------
  const pace = style.pace && style.pace > 1 ? style.pace : 1;
  const inserts: TimelineInsert[] = [];
  if (opts.voiceover) inserts.push({ at: 0, dur: Number((opts.voiceover.duration + 0.25).toFixed(3)), audio: opts.voiceover.path, desat: false });
  if (style.freezeFrame && hype.length) {
    const scratch = await ensureSfx("scratch");
    inserts.push({ at: Math.min(duration - 0.6, hype[0] + 0.35), dur: 0.9, audio: scratch, desat: true });
  }
  const mapT = (t: number) => {
    let x = t / pace;
    for (const i of inserts) if (t >= i.at - 1e-6) x += i.dur;
    return Number(x.toFixed(3));
  };
  if (pace !== 1 || inserts.length) {
    const prepped = path.join(fxDir, `pre-${stamp}.mp4`);
    await prepassTimeline(basePath, prepped, duration, pace, inserts);
    temp.push(prepped);
    basePath = prepped;
    const ms = <T extends { start: number; end: number }>(s: T): T => ({ ...s, start: mapT(s.start), end: mapT(s.end) });
    duration = mapT(duration);
    words = words.map(ms);
    punchesIn = punchesIn.map(ms);
    brollIn = brollIn.map(ms);
    transitionsIn = transitionsIn.map(mapT);
    bleeps = bleeps.map(ms);
    fitSpans = fitSpans.map(ms);
    hype = hype.map((h) => mapT(h));
    if (capOpts.centerSpans) capOpts.centerSpans = capOpts.centerSpans.map(ms);
    if (capOpts.speakerSpans) capOpts.speakerSpans = capOpts.speakerSpans.map(ms);
    if (capOpts.translations) capOpts.translations = capOpts.translations.map(ms);
    if (capOpts.hook) capOpts.hook = { ...capOpts.hook, until: mapT(capOpts.hook.until ?? 3.2) };
    if (pace !== 1) notes.push(`${pace}x pace`);
    if (opts.voiceover) notes.push("AI voiceover intro");
  }
  if (style.freezeFrame && inserts.some((i) => i.desat)) notes.push("freeze-frame");
  const transitions = transitionsIn.filter((t) => t > 0.3 && t < duration - 0.3);
  const hookUntil = capOpts.hook ? Math.min(capOpts.hook.until ?? 3.2, duration) : 0;

  const broll = shapeBrollCues(brollIn, duration);
  const args: string[] = ["-y", "-i", basePath];
  for (const cue of broll) {
    const win = Math.max(0.6, cue.end - cue.start);
    if (cue.kind === "image") {
      args.push("-loop", "1", "-framerate", "30", "-t", win.toFixed(2), "-i", cue.assetPath);
    } else {
      args.push("-stream_loop", "-1", "-t", (win + 0.25).toFixed(2), "-i", cue.assetPath);
    }
  }
  let nextInput = 1 + broll.length;

  // Music: an uploaded track, a real one from data/music/<mood>/, or generated.
  let musicIdx = -1;
  let beats: number[] | null = null;
  if (opts.musicBed) {
    let bed: string | null = null;
    let bpm: number | null = null;
    if (opts.musicPath) {
      bed = opts.musicPath;
      const m = /(\d{2,3})\s*bpm/i.exec(path.basename(bed));
      bpm = m ? Number(m[1]) : null;
    } else {
      const mood = opts.musicMood && opts.musicMood !== "auto" ? opts.musicMood : "chill";
      const track = (await ensureMoodTrack(mood)) || null;
      bed = track?.path || (await ensureMusicBed());
      bpm = track?.bpm ?? null;
    }
    if (bed) {
      musicIdx = nextInput++;
      if (style.musicStart > 0) args.push("-ss", style.musicStart.toFixed(2));
      args.push("-stream_loop", "-1", "-i", bed);
      beats = beatGrid(bpm, duration);
    }
  }

  // Beat sync: zoom punches land on the beat.
  const punches = punchesIn.map((p) => {
    const s = snapToBeat(p.start, beats, 0.25);
    return { start: s, end: s + (p.end - p.start) };
  });
  const hypeHits = style.hypeMoments ? hype : [];

  // Sound effects (+ bleep tones, hype booms).
  const sfxInputs: { idx: number; at: number; gain: number; len?: number }[] = [];
  const addSfx = async (kind: Parameters<typeof ensureSfx>[0], at: number, gain: number, len?: number) => {
    const file = await ensureSfx(kind);
    if (!file) return;
    sfxInputs.push({ idx: nextInput++, at, gain, len });
    args.push("-i", file);
  };
  if (style.sfx) {
    const kw = keywordSet(capOpts.keywords);
    const plan = planSfx({
      words,
      isKeyword: (w) => kw.has(w.toLowerCase().replace(/[^a-z0-9]/g, "")),
      transitions: style.transition !== "none" ? transitions : [],
      brollStarts: broll.map((b) => b.start),
      hookUntil: capOpts.hook && !opts.voiceover ? Math.min(3.2, duration) : undefined,
      duration,
      beats,
    });
    for (const e of plan) await addSfx(e.kind, e.at, e.gain);
  }
  for (const h of hypeHits) await addSfx("boom", h, 0.55);
  for (const b of bleeps) await addSfx("beep", b.start, 0.32, Math.min(2.4, b.end - b.start));

  // Emoji pops.
  const emojiEvents: { at: number; file: string }[] = [];
  if (style.emoji || hypeHits.length) {
    if (style.emoji) {
      let last = -10;
      for (const w of words) {
        if (emojiEvents.length >= 5) break;
        if (w.start < hookUntil + 0.2 || w.start > duration - 1.5 || w.start - last < 2.8) continue;
        const code = w.text.split(/\s+/).map((tok) => emojiFor(tok)).find((x) => x) || null;
        const file = code ? emojiImage(code) : null;
        if (file) {
          emojiEvents.push({ at: w.start, file });
          last = w.start;
        }
      }
    }
    const fire = emojiImage("1f525");
    for (const h of hypeHits) if (fire && !emojiEvents.some((e) => Math.abs(e.at - h) < 1)) emojiEvents.push({ at: h, file: fire });
  }
  const emojiIdx = emojiEvents.map((e) => {
    args.push("-loop", "1", "-framerate", "30", "-t", "1.3", "-i", e.file);
    return nextInput++;
  });

  const filters: string[] = [];
  // Zoom: punches (by type), hype hits, slow push-in, zoom transitions.
  const totalFrames = Math.max(1, Math.round(duration * 30));
  const zp = zoomParts(punches, style.zoomType, hypeHits);
  const zParts = [...zp.z];
  if (style.pushIn) zParts.push(`0.055*in/${totalFrames}`);
  if (style.transition === "zoom") {
    for (const t of transitions) zParts.push(`0.22*max(0,1-abs(in-${Math.round(t * 30)})/5)`);
  }
  if (zParts.length) {
    const sh = zp.shake.length ? `(${zp.shake.join("+")})` : "";
    const xs = sh ? `+${sh}*14*sin(in*1.9)` : "";
    const ys = sh ? `+${sh}*10*cos(in*2.7)` : "";
    // fps=30 FIRST: zoompan with d=1 emits one frame per input frame and
    // stamps them at its own fps, so a 25fps clip came out 17% short.
    filters.push(
      `[0:v]fps=30,scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},zoompan=z='min(1.35,1+${zParts.join("+")})':x='iw/2-(iw/zoom/2)${xs}':y='ih/2-(ih/zoom/2)${ys}':d=1:s=${W}x${H}:fps=30[base]`
    );
  } else {
    filters.push(`[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=30[base]`);
  }
  let last = "base";

  // Face bubble: on screen-recording shots the webcam corner becomes a round bubble above the screen.
  if (style.faceBubble !== "off" && W === 1080 && H === 1920 && fitSpans.length && opts.sourceAspect && opts.sourceAspect > 1.1) {
    const fh = Math.round(1080 / opts.sourceAspect);
    const y0 = Math.round((1920 - fh) / 2);
    const rw = Math.round(1080 * 0.27);
    const rh = Math.round(fh * 0.36);
    const side = Math.max(40, Math.min(rw, rh));
    const left = style.faceBubble.endsWith("left");
    const top = style.faceBubble.startsWith("top");
    const rx = left ? Math.round((rw - side) / 2) : 1080 - rw + Math.round((rw - side) / 2);
    const ry = top ? y0 + Math.round((rh - side) / 2) : y0 + fh - rh + Math.round((rh - side) / 2);
    const by = Math.max(40, y0 - 420 - 50);
    const en = between(fitSpans);
    filters.push(`[${last}]split[fb0][fbsrc]`);
    filters.push(
      `[fbsrc]crop=${side}:${side}:${rx}:${ry},scale=420:420,format=yuva420p,geq=lum='lum(X,Y)':cb='cb(X,Y)':cr='cr(X,Y)':a='if(lt(hypot(X-210,Y-210),205),255,0)'[bub]`
    );
    filters.push(
      `color=c=white:s=436x436:r=30:d=${duration.toFixed(2)},format=yuva420p,geq=lum=255:cb=128:cr=128:a='if(lt(hypot(X-218,Y-218),217),255,0)'[ring]`
    );
    filters.push(`[fb0][ring]overlay=x=322:y=${by - 8}:enable='${en}'[fb1]`);
    filters.push(`[fb1][bub]overlay=x=330:y=${by}:enable='${en}'[fbv]`);
    last = "fbv";
    notes.push("face bubble");
  } else if (style.faceBubble !== "off") {
    notes.push("face bubble skipped: it needs a wide screen recording in a 9:16 clip");
  }

  broll.forEach((cue, i) => {
    const idx = i + 1;
    const win = Math.max(0.6, cue.end - cue.start);
    const frames = Math.max(10, Math.round(win * 30));
    // Cutaways fade in and out (0.2s) instead of popping.
    const fade = `,format=yuva420p,fade=t=in:st=${cue.start.toFixed(2)}:d=0.2:alpha=1,fade=t=out:st=${Math.max(cue.start, cue.end - 0.2).toFixed(2)}:d=0.2:alpha=1`;
    if (cue.kind === "image") {
      const sw = Math.round(W * 1.25);
      const sh = Math.round(H * 1.25);
      // Ken Burns drift: pre-scaled still, crop window pans slowly across it.
      filters.push(
        `[${idx}:v]scale=${sw}:${sh}:force_original_aspect_ratio=increase,crop=${sw}:${sh},crop=${W}:${H}:x='(in_w-out_w)*(n/${frames})':y='(in_h-out_h)/2',setpts=PTS+${cue.start.toFixed(2)}/TB${fade}[b${i}]`
      );
    } else {
      const sw = Math.round(W * 1.08);
      const sh = Math.round(H * 1.08);
      filters.push(
        `[${idx}:v]scale=${sw}:${sh}:force_original_aspect_ratio=increase,crop=${W}:${H},setpts=PTS+${cue.start.toFixed(2)}/TB${fade}[b${i}]`
      );
    }
    filters.push(`[${last}][b${i}]overlay=0:0:enable='between(t,${cue.start.toFixed(2)},${cue.end.toFixed(2)})'[v${i}]`);
    last = `v${i}`;
  });

  // End card (darkened last seconds + animated text in the captions).
  const brand = style.brand;
  if (style.endCard && duration > 6) {
    const start = Number((duration - 2.2).toFixed(2));
    capOpts.endCard = {
      text: (style.endCardText || "FOLLOW FOR MORE").toUpperCase(),
      sub: brand?.name ? `@${brand.name.replace(/\s+/g, "")}` : undefined,
      start,
      end: duration + 0.5,
    };
  }

  // Colour grade, film look, cut transitions, hype flashes, end-card dim.
  const lookParts = [gradeFilter(style.grade), filmLookFilter(style.filmLook), transitionFilter(style.transition, transitions)];
  if (hypeHits.length) lookParts.push(`drawbox=x=0:y=0:w=iw:h=ih:color=white@0.6:t=fill:enable='${hypeHits.map((h) => `between(t\\,${h.toFixed(3)}\\,${(h + 0.07).toFixed(3)})`).join("+")}'`);
  if (capOpts.endCard) lookParts.push(`drawbox=x=0:y=0:w=iw:h=ih:color=black@0.45:t=fill:enable='gte(t\\,${capOpts.endCard.start.toFixed(2)})'`);
  const look = lookParts.filter(Boolean).join(",");
  if (look) {
    filters.push(`[${last}]${look}[looked]`);
    last = "looked";
  }

  // Emoji pops (bounce up + fade), above the captions.
  const es = Math.round(170 * (Math.min(W, H) / 1080));
  const ey = opts.captionStyle === "kinetic" ? Math.round(H * 0.3) : H > W ? Math.round(H * 0.6) - es : Math.round(H * 0.42) - es;
  emojiEvents.forEach((e, i) => {
    const ex = Math.round(W / 2 - es / 2 + (i % 2 ? 1 : -1) * 150 * (Math.min(W, H) / 1080));
    filters.push(
      `[${emojiIdx[i]}:v]scale=${es}:${es},format=yuva420p,fade=t=in:st=0:d=0.12:alpha=1,fade=t=out:st=1.05:d=0.25:alpha=1,setpts=PTS+${e.at.toFixed(2)}/TB[em${i}]`
    );
    filters.push(
      `[${last}][em${i}]overlay=x=${ex}:y='${ey}-40*max(0\\,1-(t-${e.at.toFixed(2)})*6)':enable='between(t\\,${e.at.toFixed(2)}\\,${(e.at + 1.3).toFixed(2)})'[ev${i}]`
    );
    last = `ev${i}`;
  });

  // Captions (on top of base, B-roll and emoji) + every caption-layer extra.
  if (brand) {
    capOpts.brand = { accent: hexToAss(brand.primary), kw: hexToAss(brand.secondary) };
    if (brand.watermark && brand.name) capOpts.watermark = { text: brand.name, pos: brand.watermarkPos, opacity: brand.watermarkOpacity };
  }
  capOpts.textCase = style.captionCase;
  capOpts.sizeScale = CAPTION_SIZE_SCALE[style.captionSize] || 1;
  capOpts.hookAnim = style.hookAnim;
  capOpts.counters = style.counters;
  if (style.lowerThirdName) capOpts.lowerThird = { name: style.lowerThirdName, title: style.lowerThirdTitle || undefined };
  // Cold open: the teaser is added in front later. Drawings were placed on
  // the finished clip's clock, so they move back by the teaser length.
  const coldOpen = style.coldOpen && hype.length > 0 && duration > 8;
  const teaserLen = coldOpen ? 2 : 0;
  if (style.drawings.length) {
    capOpts.drawings = style.drawings
      .map((d) => ({ ...d, t: d.t - teaserLen }))
      .filter((d) => d.t >= 0 && d.t < duration);
  }
  let assPath: string | null = null;
  const hasCaptionLayer = words.length > 0 || capOpts.endCard || capOpts.lowerThird || capOpts.watermark || capOpts.drawings?.length;
  if (hasCaptionLayer) {
    const playRes =
      opts.aspectRatio === "16:9" ? { x: 1920, y: 1080 } : opts.aspectRatio === "1:1" ? { x: 1080, y: 1080 } : { x: 1080, y: 1920 };
    const marginV =
      opts.captionPositionY !== undefined
        ? Math.max(60, Math.min(playRes.y - 120, Math.round(playRes.y * (1 - opts.captionPositionY / 100))))
        : Math.round(playRes.y * 0.27);
    const assContent = buildKaraokeAss(
      words.map((w) => ({ start: w.start, end: w.end, text: w.text })),
      opts.captionStyle,
      marginV,
      playRes,
      { ...capOpts, customMarginV: opts.captionPositionY !== undefined }
    );
    assPath = path.join(fxDir, `fx-${stamp}.ass`);
    fs.writeFileSync(assPath, assContent, "utf-8");
    filters.push(`[${last}]${subtitlesFilter(assPath)}[vcap]`);
    last = "vcap";
  }

  // Progress bar across the top.
  if (style.progressBar) {
    const hex = (brand?.primary || "#FFC700").slice(1);
    const bh = Math.max(8, Math.round(12 * (Math.min(W, H) / 1080)));
    filters.push(`color=c=0x${hex}:s=${W}x${bh}:r=30:d=${duration.toFixed(3)}[pbar]`);
    filters.push(`[${last}][pbar]overlay=x='-w+w*t/${duration.toFixed(3)}':y=0:shortest=1[vbar]`);
    last = "vbar";
  }
  const finalV = last;

  // ---- audio: voice (+ clean-up, bleeps), ducked music, sound effects ----
  const voiceChain = (style.voiceEnhance ? STUDIO_VOICE_CHAIN : "anull") + (bleeps.length ? `,volume=0:enable='${between(bleeps)}'` : "");
  const hasMusic = musicIdx >= 0;
  const mixIn: string[] = [];
  if (hasMusic) {
    filters.push(`[0:a]${voiceChain},asplit=2[vo][side]`);
    const vol = Math.max(0, Math.min(1, style.musicVolume / 100));
    const fin = style.musicFadeIn > 0 ? `,afade=t=in:st=0:d=${style.musicFadeIn.toFixed(2)}` : "";
    const fout = style.musicFadeOut > 0 ? `,afade=t=out:st=${Math.max(0, duration - style.musicFadeOut).toFixed(2)}:d=${style.musicFadeOut.toFixed(2)}` : "";
    filters.push(`[${musicIdx}:a]atrim=0:${duration.toFixed(2)},asetpts=PTS-STARTPTS,volume=${vol.toFixed(2)}${fin}${fout}[mus]`);
    filters.push(`[mus][side]sidechaincompress=threshold=0.02:ratio=9:attack=30:release=400[ducked]`);
    mixIn.push("[vo]", "[ducked]");
  } else {
    filters.push(`[0:a]${voiceChain}[vo]`);
    mixIn.push("[vo]");
  }
  sfxInputs.forEach((s, i) => {
    const ms = Math.max(0, Math.round(s.at * 1000));
    const trim = s.len ? `atrim=0:${s.len.toFixed(3)},` : "";
    filters.push(`[${s.idx}:a]${trim}adelay=${ms}|${ms},volume=${s.gain.toFixed(2)}[sfx${i}]`);
    mixIn.push(`[sfx${i}]`);
  });
  const loud = style.voiceEnhance ? `,${LOUDNESS_CHAIN}` : "";
  if (mixIn.length > 1) {
    filters.push(`${mixIn.join("")}amix=inputs=${mixIn.length}:duration=first:normalize=0${loud}[aout]`);
  } else {
    filters.push(`[vo]anull${loud}[aout]`);
  }

  const mainOut = coldOpen ? path.join(fxDir, `main-${stamp}.mp4`) : opts.outputPath;
  args.push("-filter_complex", filters.join(";"), "-map", `[${finalV}]`, "-map", "[aout]");
  args.push(
    "-t", duration.toFixed(3),
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart",
    mainOut
  );

  let offset = 0;
  try {
    await execFileP(getFfmpegBinary(), args, { maxBuffer: 64 * 1024 * 1024 });
    if (coldOpen) {
      temp.push(mainOut);
      offset = await addColdOpen(mainOut, opts.outputPath, hype[0], duration, W, H, opts.captionOptions?.font);
      if (offset > 0) notes.push("cold-open teaser");
    }
    console.log(
      `[PostFX] Applied ${broll.length} B-roll, ${punches.length} ${style.zoomType} zoom(s)${beats ? " on the beat" : ""}, hype=${hypeHits.length}, music=${hasMusic}${opts.musicMood ? `(${opts.musicMood})` : ""}, sfx=${sfxInputs.length}, emoji=${emojiEvents.length}, bleeps=${bleeps.length}, grade=${style.grade}, look=${style.filmLook}, transition=${style.transition}x${transitions.length}, pace=${pace}, inserts=${inserts.length}, coldOpen=${offset > 0}, endCard=${Boolean(capOpts.endCard)}, bar=${style.progressBar}, captions=${words.length > 0}`
    );
  } finally {
    if (assPath) {
      try { fs.unlinkSync(assPath); } catch {}
    }
    for (const p of temp) {
      try { fs.unlinkSync(p); } catch {}
    }
    if (opts.voiceover) {
      try { fs.unlinkSync(opts.voiceover.path); } catch {}
    }
  }
  const finalDuration = duration + offset;
  const knots: [number, number][] = [];
  if (pace !== 1 || inserts.length || offset > 0) {
    const sorted = [...inserts].sort((a, b) => a.at - b.at);
    const heldBefore = (a: number) => sorted.filter((i) => i.at < a - 1e-6).reduce((s, i) => s + i.dur, 0);
    if (offset > 0) knots.push([0, 0]);
    if (!sorted.some((i) => i.at < 1e-6)) knots.push([0, offset]);
    for (const i of sorted) {
      const f = Number((offset + i.at / pace + heldBefore(i.at)).toFixed(3));
      knots.push([Number(i.at.toFixed(3)), f], [Number(i.at.toFixed(3)), Number((f + i.dur).toFixed(3))]);
    }
    knots.push([Number(cutDuration.toFixed(3)), Number((offset + mapT(cutDuration)).toFixed(3))]);
  }
  return {
    duration: Number(finalDuration.toFixed(3)),
    mapTime: (t: number) => Number((offset + mapT(t)).toFixed(3)),
    knots,
    hype: hype.map((h) => Number((h + offset).toFixed(2))),
    notes,
  };
}

/** Prepends the big moment as a 2s "wait for it" teaser. Returns the teaser length (0 if it failed). */
async function addColdOpen(main: string, output: string, at: number, duration: number, W: number, H: number, font?: string): Promise<number> {
  const len = 2;
  const a = Math.max(0, Math.min(duration - len - 0.1, at - 0.4));
  const fontName = CAPTION_FONTS[font || "default"] || "Arial";
  const size = Math.round(78 * (Math.min(W, H) / 1080));
  const ass = `[Script Info]
ScriptType: v4.00+
PlayResX: ${W}
PlayResY: ${H}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Tease,${fontName},${size},&H00111111,&H00111111,&H0000D7FF,&H00000000,-1,0,0,0,100,100,0,0,3,${Math.round(18 * (Math.min(W, H) / 1080))},0,8,60,60,${Math.round(H * 0.11)},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 2,0:00:00.00,0:00:02.00,Tease,,0,0,0,,{\\fad(80,120)\\fscx80\\fscy80\\t(0,160,\\fscx100\\fscy100)}WAIT FOR IT...
`;
  const assPath = path.join(process.cwd(), "data", "postfx", `tease-${Date.now()}.ass`);
  fs.writeFileSync(assPath, ass, "utf-8");
  const rewind = await ensureSfx("rewind");
  const AF = "aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo";
  try {
    const args = ["-y", "-i", main, "-i", main];
    if (rewind) args.push("-i", rewind);
    const rwMs = Math.round((len - 0.7) * 1000);
    const f = [
      `[0:v]trim=start=${a.toFixed(3)}:duration=${len},setpts=PTS-STARTPTS,eq=saturation=1.15:contrast=1.05,${subtitlesFilter(assPath)}[tv]`,
      `[0:a]atrim=start=${a.toFixed(3)}:duration=${len},asetpts=PTS-STARTPTS,${AF}[ta0]`,
      rewind ? `[2:a]${AF},adelay=${rwMs}|${rwMs},volume=0.6[rw]` : "",
      rewind ? `[ta0][rw]amix=inputs=2:duration=first:normalize=0,${AF}[ta]` : `[ta0]anull[ta]`,
      `[1:v]setpts=PTS-STARTPTS[mv]`,
      `[1:a]asetpts=PTS-STARTPTS,${AF}[ma]`,
      `[tv][ta][mv][ma]concat=n=2:v=1:a=1[v][a]`,
    ].filter(Boolean);
    args.push(
      "-filter_complex", f.join(";"), "-map", "[v]", "-map", "[a]",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", output
    );
    await execFileP(getFfmpegBinary(), args, { maxBuffer: 64 * 1024 * 1024 });
    return len;
  } catch (e) {
    console.warn("[PostFX] Cold open failed; keeping the clip without it:", e);
    fs.copyFileSync(main, output);
    return 0;
  } finally {
    try { fs.unlinkSync(assPath); } catch {}
  }
}

/**
 * Silence removal: cut `ranges` (seconds relative to the start of
 * `inputPath`) out of an already-rendered clip and join them in ONE
 * frame-exact trim/concat pass. Rendering the whole clip first and cutting
 * afterwards means the tracker, split layout and captions all run over one
 * continuous timeline — tracking each kept piece separately restarted the
 * camera at every join (a short piece could open on an empty background).
 * Range edges snap to the frame grid so audio and video stay the same
 * length across many joins. Returns the joined duration in seconds.
 */
export async function cutKeepRanges(
  inputPath: string,
  outputPath: string,
  ranges: { start: number; end: number }[]
): Promise<number> {
  const { stdout } = await execFileP(getFfprobeBinary(), [
    "-v", "error", "-show_entries", "stream=codec_type,r_frame_rate:format=duration", "-of", "json", inputPath,
  ]);
  const info = JSON.parse(stdout || "{}");
  const streams: { codec_type?: string; r_frame_rate?: string }[] = info.streams || [];
  const v = streams.find((s) => s.codec_type === "video");
  const hasAudio = streams.some((s) => s.codec_type === "audio");
  const [num, den] = String(v?.r_frame_rate || "30/1").split("/").map(Number);
  const fps = num > 0 && den > 0 ? num / den : 30;
  const total = Number(info.format?.duration) || Infinity;

  // Snap to frames, clamp to the file, merge overlaps (filler cuts can
  // leave neighbouring ranges touching), drop slivers.
  const snapped = ranges
    .map((r) => ({
      start: Math.max(0, Math.round(r.start * fps) / fps),
      end: Math.min(total, Math.round(r.end * fps) / fps),
    }))
    .sort((a, b) => a.start - b.start);
  const merged: { start: number; end: number }[] = [];
  for (const r of snapped) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end + 0.5 / fps) last.end = Math.max(last.end, r.end);
    else if (r.end - r.start >= 1.5 / fps) merged.push({ ...r });
  }
  if (merged.length === 0) throw new Error("Silence removal left nothing to keep");

  const f = (n: number) => n.toFixed(6);
  const parts: string[] = [];
  const labels: string[] = [];
  merged.forEach((r, i) => {
    parts.push(`[0:v]trim=start=${f(r.start)}:end=${f(r.end)},setpts=PTS-STARTPTS[v${i}]`);
    labels.push(`[v${i}]`);
    if (hasAudio) {
      parts.push(`[0:a]atrim=start=${f(r.start)}:end=${f(r.end)},asetpts=PTS-STARTPTS[a${i}]`);
      labels.push(`[a${i}]`);
    }
  });
  const fc = `${parts.join(";")};${labels.join("")}concat=n=${merged.length}:v=1:a=${hasAudio ? 1 : 0}[v]${hasAudio ? "[a]" : ""}`;
  const fcPath = path.join(os.tmpdir(), `snipcut-cut-${process.pid}-${Date.now()}.txt`);
  fs.writeFileSync(fcPath, fc, "utf-8");
  try {
    await execFileP(getFfmpegBinary(), [
      "-hide_banner", "-loglevel", "error", "-y", "-i", inputPath,
      "-filter_complex_script", fcPath,
      "-map", "[v]", ...(hasAudio ? ["-map", "[a]"] : []),
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
      ...(hasAudio ? ["-c:a", "aac", "-b:a", "192k"] : []),
      "-movflags", "+faststart", outputPath,
    ], { maxBuffer: 64 * 1024 * 1024 });
  } finally {
    try { fs.unlinkSync(fcPath); } catch {}
  }
  return merged.reduce((s, r) => s + (r.end - r.start), 0);
}
