import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import path from "path";
import fs from "fs";
import os from "os";
import { spawn, execFile } from "child_process";
import util from "util";
import {
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
  const pal = palettes[captionStyle] || palettes.hormozi;
  // Font size is authored against a 1920px-tall canvas; scale it to the
  // actual PlayRes so 16:9 / 1:1 renders don't get oversized captions.
  // Sizes are authored for a 1080px-wide 9:16 frame. Scale by the SHORT
  // side so 16:9 and 1:1 captions are as readable as 9:16 ones (scaling by
  // height/1920 shrank 16:9 captions to 56% — unreadable on a phone).
  const captionScale = Math.min(playRes.x, playRes.y) / 1080;
  const fontBoost = CAPTION_FONT_SCALE[options.font || ""] || 1;
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
      hookEvents.push(
        `Dialogue: 1,${formatAssTime(0)},${formatAssTime(until)},Hook,,0,0,0,,{${hookFs !== hookSize ? `\\fs${hookFs}` : ""}\\fad(120,220)\\fscx88\\fscy88\\t(0,160,1,\\fscx100\\fscy100)}${lines.join("\\N")}`
      );
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
Style: Hook,Arial,${hookSize},&H00111111,&H00111111,&H00FFFFFF,&H00000000,-1,0,0,0,100,100,0,0,3,${Math.max(6, Math.round(20 * captionScale))},0,8,80,80,${Math.round(playRes.y * 0.11)},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;
  const finish = (evts: string[]) => header + [...preventCaptionOverlaps(evts), ...hookEvents].join("\n") + "\n";

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
          const txt = escapeAssText(pw.text.toUpperCase());
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
              return `{\\c&H00111111&\\3c${pal.accent}\\bord${Math.round(16 * captionScale)}\\shad0}${txt}{\\r}`;
            case "bounce": {
              const shake = kw ? "\\t(130,170,\\frz5)\\t(170,210,\\frz-5)\\t(210,250,\\frz0)" : "";
              return `{\\c${pal.accent}\\fscx135\\fscy135\\t(0,110,\\fscx92\\fscy92)\\t(110,190,\\fscx100\\fscy100)${shake}}${txt}{\\r}`;
            }
            case "typewriter":
              return `{\\c${pal.accent}\\fad(60,0)}${txt}{\\r}`;
            case "glow":
              // White letters, strong coloured glow — readable, not a blur.
              return `{\\c&H00FFFFFF&\\3c${pal.accent}\\bord7\\blur10\\fscx112\\fscy112\\t(0,120,\\fscx100\\fscy100)}${txt}{\\r}`;
            default:
              return `{\\c${pal.accent}\\fscx112\\fscy112\\t(0,100,\\fscx100\\fscy100)}${txt}{\\r}`;
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
          const txt = escapeAssText(pw.text.toUpperCase());
          if (j === i) {
            return `{\\c${pal.accent}\\fs${Math.round(snipcutFont * fit * 1.16)}\\fscx116\\fscy116\\t(0,90,1,\\fscx100\\fscy100)}${txt}{\\r}`;
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
        const txt = escapeAssText(w.text.toUpperCase());
        if (i === emph && chunk.length > 1) {
          const col = isKeyword(w.text) ? pal.kw : pal.accent;
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
        const txt = escapeAss(pw.text.toUpperCase());
        if (captionStyle === "clean") {
          return j === i ? `{\\b1}${txt}{\\b0}` : txt;
        }
        if (j === i) return `{\\c${pal.accent}\\fs${Math.round(fontSize * 1.12)}}${txt}{\\r}`;
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
          "[0:v]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,gblur=sigma=24,setsar=1[bg];" +
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

export async function applyPostEffects(opts: PostFxOptions): Promise<void> {
  const W = opts.aspectRatio === "16:9" ? 1920 : 1080;
  const H = opts.aspectRatio === "16:9" ? 1080 : opts.aspectRatio === "1:1" ? 1080 : 1920;
  const style: ClipStyle = opts.style || { ...DEFAULT_CLIP_STYLE, sfx: false, voiceEnhance: false, pushIn: false };
  const transitions = (opts.transitionTimes || []).filter((t) => t > 0.3 && t < opts.duration - 0.3);

  const broll = shapeBrollCues(opts.broll, opts.duration);

  const args: string[] = ["-y", "-i", opts.basePath];
  for (const cue of broll) {
    const win = Math.max(0.6, cue.end - cue.start);
    if (cue.kind === "image") {
      args.push("-loop", "1", "-framerate", "30", "-t", win.toFixed(2), "-i", cue.assetPath);
    } else {
      args.push("-stream_loop", "-1", "-t", (win + 0.25).toFixed(2), "-i", cue.assetPath);
    }
  }
  let nextInput = 1 + broll.length;

  // Music: the clip's mood track (generated, or a real one from data/music/<mood>/).
  let musicIdx = -1;
  let beats: number[] | null = null;
  if (opts.musicBed) {
    const mood = opts.musicMood && opts.musicMood !== "auto" ? opts.musicMood : "chill";
    const track = (await ensureMoodTrack(mood)) || null;
    const bed = track?.path || (await ensureMusicBed());
    if (bed) {
      musicIdx = nextInput++;
      args.push("-stream_loop", "-1", "-i", bed);
      beats = beatGrid(track?.bpm, opts.duration);
    }
  }

  // Beat sync: zoom punches land on the beat.
  const punches = opts.punches.map((p) => {
    const s = snapToBeat(p.start, beats, 0.25);
    return { start: s, end: s + (p.end - p.start) };
  });

  // Sound effects.
  const sfxInputs: { idx: number; at: number; gain: number }[] = [];
  if (style.sfx) {
    const kw = keywordSet(opts.captionOptions?.keywords);
    const plan = planSfx({
      words: opts.words,
      isKeyword: (w) => kw.has(w.toLowerCase().replace(/[^a-z0-9]/g, "")),
      transitions: style.transition !== "none" ? transitions : [],
      brollStarts: broll.map((b) => b.start),
      hookUntil: opts.captionOptions?.hook ? Math.min(3.2, opts.duration) : undefined,
      duration: opts.duration,
      beats,
    });
    for (const e of plan) {
      const file = await ensureSfx(e.kind);
      if (!file) continue;
      sfxInputs.push({ idx: nextInput++, at: e.at, gain: e.gain });
      args.push("-i", file);
    }
  }

  const filters: string[] = [];
  // Zoom: punch-ins, a slow push-in across the clip, and zoom transitions.
  const totalFrames = Math.max(1, Math.round(opts.duration * 30));
  const zoomParts: string[] = [];
  if (punches.length) zoomParts.push(punchZoomExpr(punches).replace(/^min\(1\.16,1\+/, "").replace(/\)$/, ""));
  if (style.pushIn) zoomParts.push(`0.055*in/${totalFrames}`);
  if (style.transition === "zoom") {
    for (const t of transitions) {
      const f = Math.round(t * 30);
      zoomParts.push(`0.22*max(0,1-abs(in-${f})/5)`);
    }
  }
  if (zoomParts.length) {
    // fps=30 FIRST: zoompan with d=1 emits one frame per input frame and
    // stamps them at its own fps, so a 25fps clip came out 17% short
    // (picture ended 6s before the sound on a 37s clip).
    filters.push(
      `[0:v]fps=30,scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},zoompan=z='min(1.3,1+${zoomParts.join("+")})':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=${W}x${H}:fps=30[base]`
    );
  } else {
    filters.push(`[0:v]scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},fps=30[base]`);
  }

  let last = "base";
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
    filters.push(
      `[${last}][b${i}]overlay=0:0:enable='between(t,${cue.start.toFixed(2)},${cue.end.toFixed(2)})'[v${i}]`
    );
    last = `v${i}`;
  });

  // Colour grade + cut transitions on the whole picture (B-roll included).
  const look = [gradeFilter(style.grade), transitionFilter(style.transition, transitions)].filter(Boolean).join(",");
  if (look) {
    filters.push(`[${last}]${look}[looked]`);
    last = "looked";
  }

  // Captions last so they sit on top of base AND B-roll.
  let finalV = last;
  let assPath: string | null = null;
  if (opts.words.length > 0) {
    const playRes =
      opts.aspectRatio === "16:9" ? { x: 1920, y: 1080 } : opts.aspectRatio === "1:1" ? { x: 1080, y: 1080 } : { x: 1080, y: 1920 };
    const marginV =
      opts.captionPositionY !== undefined
        ? Math.max(60, Math.min(playRes.y - 120, Math.round(playRes.y * (1 - opts.captionPositionY / 100))))
        : Math.round(playRes.y * 0.27);
    const assContent = buildKaraokeAss(
      opts.words.map((w) => ({ start: w.start, end: w.end, text: w.text })),
      opts.captionStyle,
      marginV,
      playRes,
      { ...(opts.captionOptions || {}), customMarginV: opts.captionPositionY !== undefined }
    );
    const fxDir = path.join(process.cwd(), "data", "postfx");
    fs.mkdirSync(fxDir, { recursive: true });
    assPath = path.join(fxDir, `fx-${Date.now()}-${Math.floor(Math.random() * 10000)}.ass`);
    fs.writeFileSync(assPath, assContent, "utf-8");
    filters.push(`[${last}]${subtitlesFilter(assPath)}[vfinal]`);
    finalV = "vfinal";
  }

  // ---- audio: voice (+ studio clean-up), ducked music, sound effects ----
  const voiceChain = style.voiceEnhance ? STUDIO_VOICE_CHAIN : "anull";
  const hasMusic = musicIdx >= 0;
  const mixIn: string[] = [];
  if (hasMusic) {
    filters.push(`[0:a]${voiceChain},asplit=2[vo][side]`);
    filters.push(
      `[${musicIdx}:a]atrim=0:${opts.duration.toFixed(2)},asetpts=PTS-STARTPTS,volume=0.55,afade=t=in:st=0:d=0.8,afade=t=out:st=${Math.max(0, opts.duration - 1.2).toFixed(2)}:d=1.2[mus]`
    );
    filters.push(`[mus][side]sidechaincompress=threshold=0.02:ratio=9:attack=30:release=400[ducked]`);
    mixIn.push("[vo]", "[ducked]");
  } else {
    filters.push(`[0:a]${voiceChain}[vo]`);
    mixIn.push("[vo]");
  }
  sfxInputs.forEach((s, i) => {
    const ms = Math.max(0, Math.round(s.at * 1000));
    filters.push(`[${s.idx}:a]adelay=${ms}|${ms},volume=${s.gain.toFixed(2)}[sfx${i}]`);
    mixIn.push(`[sfx${i}]`);
  });
  const loud = style.voiceEnhance ? `,${LOUDNESS_CHAIN}` : "";
  if (mixIn.length > 1) {
    filters.push(`${mixIn.join("")}amix=inputs=${mixIn.length}:duration=first:normalize=0${loud}[aout]`);
  } else {
    filters.push(`[vo]anull${loud}[aout]`);
  }

  args.push("-filter_complex", filters.join(";"), "-map", `[${finalV}]`, "-map", "[aout]");
  args.push(
    "-t", opts.duration.toFixed(3),
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
    "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart",
    opts.outputPath
  );

  try {
    await execFileP(getFfmpegBinary(), args, { maxBuffer: 64 * 1024 * 1024 });
    console.log(
      `[PostFX] Applied ${broll.length} B-roll cue(s), ${punches.length} punch zoom(s)${beats ? " on the beat" : ""}, music=${hasMusic}${opts.musicMood ? `(${opts.musicMood})` : ""}, sfx=${sfxInputs.length}, grade=${style.grade}, transition=${style.transition}x${transitions.length}, voice=${style.voiceEnhance}, pushIn=${style.pushIn}, captions=${opts.words.length > 0}`
    );
  } finally {
    if (assPath) {
      try { fs.unlinkSync(assPath); } catch {}
    }
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
