import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import util from "util";
import { getFfmpegBinary, getFfprobeBinary, getYtDlpBinary, probeVideoFormat, checkZscaleSupported } from "./videoService";
import { resolveCookieArg, friendlyDownloadError } from "./youtubeCookies";

/**
 * Slow media preparation that runs inside the job worker, NOT inside an
 * HTTP request: a YouTube download or a full HEVC/HDR transcode can take
 * many minutes, and every reverse proxy in front of a VPS (nginx, Caddy,
 * Cloudflare) cuts a request off after ~60-100s — the user saw an error
 * while the server kept working.
 */

const execFilePromise = util.promisify(execFile);

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
]);

/**
 * Only real YouTube links reach yt-dlp. A value starting with "-" would be
 * parsed as a yt-dlp option (e.g. --exec / --config-location), and any other
 * host would let the server be pointed at internal URLs.
 */
export function normalizeYoutubeUrl(raw: string): string | null {
  try {
    const u = new URL(String(raw || "").trim());
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (!YOUTUBE_HOSTS.has(u.hostname.toLowerCase())) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** Accept only a plain proxy URL (http/https/socks) so it can't smuggle options. */
export function normalizeProxy(raw: unknown): string | null {
  if (typeof raw !== "string" || raw.trim().length <= 5) return null;
  try {
    const u = new URL(raw.trim());
    return /^(https?|socks5h?|socks4a?):$/.test(u.protocol) ? u.toString() : null;
  } catch {
    return null;
  }
}

/** Sanitized "<timestamp>-<name>" base and extension for a user-supplied file name. */
/**
 * Audio-only uploads are wrapped in a still picture and saved as
 * "<name>.audio.mp4". safeUploadName() turns every "." in a user's file
 * name into "_", so a real video can never end up with this suffix (the
 * old "-audio.mp4" marker matched videos named like "interview-audio.mp4").
 */
export const AUDIO_ONLY_SUFFIX = ".audio.mp4";
export const isAudioOnlySource = (p: string) => String(p || "").toLowerCase().endsWith(AUDIO_ONLY_SUFFIX);

export function safeUploadName(fileName: string): { baseName: string; ext: string } {
  const rawExt = path.extname(fileName).toLowerCase();
  const ext = /^\.[a-z0-9]{1,8}$/.test(rawExt) ? rawExt : ".mp4";
  const rawBase = path.basename(fileName, rawExt);
  const safeBase = rawBase.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60) || "upload";
  return { baseName: `${Date.now()}-${safeBase}`, ext };
}

/**
 * Download a YouTube video into public/downloads with yt-dlp.
 * `cookieFile` is a Netscape cookie file to use (else the server jar / env).
 */
export async function downloadYoutubeVideo(opts: {
  url: string;
  cookieFile?: string;
  proxy?: string;
}): Promise<{ filePath: string; fileId: string }> {
  const url = normalizeYoutubeUrl(opts.url);
  if (!url) throw new Error("Please paste a valid YouTube link (youtube.com or youtu.be).");

  const downloadDir = path.join(process.cwd(), "public", "downloads");
  fs.mkdirSync(downloadDir, { recursive: true });
  const filePrefix = `yt-${Date.now()}`;
  const outTemplate = path.join(downloadDir, `${filePrefix}.%(ext)s`);

  let cookieArgs: string[] = [];
  let tempCookie: string | null = null;
  if (opts.cookieFile && fs.existsSync(opts.cookieFile)) {
    cookieArgs = ["--cookies", opts.cookieFile];
  } else {
    const { arg, tempFile } = resolveCookieArg("");
    tempCookie = tempFile;
    const p = arg.match(/"([^"]+)"/)?.[1];
    if (p) cookieArgs = ["--cookies", p];
  }

  const activeProxy = normalizeProxy(opts.proxy || process.env.YOUTUBE_PROXY || process.env.HTTP_PROXY || "");
  const proxyArgs = activeProxy ? ["--proxy", activeProxy] : [];

  // Resolution before codec: an avc1-only preference grabs 360p on older
  // uploads even when 1080p VP9 exists. The render pipeline re-encodes to
  // H.264 anyway, so source codec is secondary.
  const preferredFormat =
    "bestvideo[vcodec^=avc1][height<=1080]+bestaudio[ext=m4a]/bestvideo[height>=720][height<=1080]+bestaudio/bestvideo[vcodec^=avc1][height<=1080]+bestaudio/bestvideo[height<=1080]+bestaudio/best[height<=1080]/best";

  // Player clients: yt-dlp's DEFAULT set first. Forcing
  // "android,ios,web" (the old behaviour) only exposes YouTube's 360p
  // progressive format now, so every clip came from a 360p source even when
  // 1080p existed (verified: default -> 137+140 1920x1080, forced -> 18
  // 640x360). The forced set is kept as a fallback for when the default
  // clients hit a bot check.
  const clientStrategies: string[][] = [[], ["--extractor-args", "youtube:player_client=android,ios,web"]];
  // Only a FINISHED file counts. yt-dlp downloads video and audio as
  // separate "<name>.f137.mp4" / ".f140.m4a" pieces and merges them; if the
  // merge fails or is interrupted, the video-only piece is left behind, and
  // treating it as the download gave clips with no sound.
  const isFinished = (f: string) =>
    f.startsWith(filePrefix) &&
    /\.(mp4|mkv|webm|mov)$/i.test(f) &&
    !/\.f\d+[a-z0-9-]*\.\w+$/i.test(f) &&
    !/\.part$|\.temp\./i.test(f);
  const hasOutput = () => fs.readdirSync(downloadDir).some(isFinished);
  const cleanupPieces = () => {
    for (const f of fs.readdirSync(downloadDir)) {
      if (f.startsWith(filePrefix) && !isFinished(f)) {
        try { fs.unlinkSync(path.join(downloadDir, f)); } catch {}
      }
    }
  };

  let lastErr = "";
  try {
    for (const clientArgs of clientStrategies) {
      const args = [
        "--js-runtimes", "node",
        "--ffmpeg-location", getFfmpegBinary(),
        ...cookieArgs,
        ...proxyArgs,
        ...clientArgs,
        "-f", preferredFormat,
        "--no-warnings", "--no-playlist",
        "--merge-output-format", "mp4",
        "-o", outTemplate,
        // "--" ends option parsing: the URL can never be read as a flag.
        "--",
        url,
      ];
      try {
        // Long 1080p videos can take several minutes to download + merge.
        await execFilePromise(getYtDlpBinary(), args, { timeout: 900000, maxBuffer: 64 * 1024 * 1024 });
      } catch (dlErr: any) {
        lastErr = `${dlErr?.stderr || ""} ${dlErr?.message || ""}`;
        console.warn(`[Stage: YouTube] Download attempt failed (${clientArgs.length ? clientArgs[1] : "default clients"}): ${lastErr.slice(0, 300)}`);
      }
      if (hasOutput()) break;
    }
  } finally {
    cleanupPieces();
    if (tempCookie) {
      try { fs.unlinkSync(tempCookie); } catch {}
    }
  }
  if (!hasOutput()) throw new Error(friendlyDownloadError(lastErr));

  const target = path.join(downloadDir, `${filePrefix}.mp4`);
  if (fs.existsSync(target)) return { filePath: target, fileId: `downloads/${filePrefix}.mp4` };
  const found = fs.readdirSync(downloadDir).find(isFinished);
  if (!found) throw new Error("Failed to download YouTube video");
  return { filePath: path.join(downloadDir, found), fileId: `downloads/${found}` };
}

/**
 * Turn an uploaded file into a web-playable H.264/yuv420p/CFR MP4 next to it
 * (stream copy when it already is one, transcode + HDR tone-map otherwise),
 * then delete the raw upload.
 */
export async function normalizeUploadedVideo(rawPath: string, baseName: string): Promise<{ filePath: string; fileId: string }> {
  const uploadsDir = path.dirname(rawPath);
  const ffmpegBin = getFfmpegBinary();

  // Audio-only (podcast MP3 / WAV / M4A): wrap it in a still dark picture so
  // the whole pipeline works; AUDIO_ONLY_SUFFIX tells the renderer to make
  // audiogram clips (waveform + backdrop) from it.
  if (!(await hasVideoStream(rawPath))) {
    const audioName = `${baseName}${AUDIO_ONLY_SUFFIX}`;
    const audioPath = path.join(uploadsDir, audioName);
    await execFilePromise(ffmpegBin, [
      "-hide_banner", "-loglevel", "error", "-y",
      "-f", "lavfi", "-i", "color=c=0x111116:s=1280x720:r=30",
      "-i", rawPath,
      "-map", "0:v", "-map", "1:a:0", "-shortest",
      "-c:v", "libx264", "-preset", "veryfast", "-tune", "stillimage", "-crf", "30", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", audioPath,
    ], { maxBuffer: 64 * 1024 * 1024 });
    if (!fs.existsSync(audioPath)) throw new Error("Could not read the uploaded audio file.");
    if (path.resolve(rawPath) !== path.resolve(audioPath)) {
      try { fs.unlinkSync(rawPath); } catch {}
    }
    return { filePath: audioPath, fileId: `uploads/${audioName}` };
  }

  const webMp4Filename = `${baseName}.mp4`;
  const webMp4Path = path.join(uploadsDir, webMp4Filename);
  const streamInfo = await probeVideoFormat(rawPath);
  const transcodeNeeded = !streamInfo.isH264Yuv420p8Bit || streamInfo.isHdr || streamInfo.isVfr;

  if (transcodeNeeded) {
    let vfFilter = "scale='min(1920,iw)':-2";
    if (streamInfo.isHdr && checkZscaleSupported()) {
      vfFilter =
        "scale='min(1920,iw)':-2,zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p";
    }
    await execFilePromise(ffmpegBin, [
      "-hide_banner", "-loglevel", "error", "-y", "-i", rawPath,
      "-vf", vfFilter, "-r", "30",
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", webMp4Path,
    ], { maxBuffer: 64 * 1024 * 1024 });
  } else {
    await execFilePromise(ffmpegBin, [
      "-hide_banner", "-loglevel", "error", "-y", "-i", rawPath,
      "-c", "copy", "-movflags", "+faststart", webMp4Path,
    ], { maxBuffer: 64 * 1024 * 1024 });
  }

  if (!fs.existsSync(webMp4Path)) throw new Error("Could not convert the uploaded video to MP4.");
  if (path.resolve(rawPath) !== path.resolve(webMp4Path)) {
    try { fs.unlinkSync(rawPath); } catch {}
  }
  return { filePath: webMp4Path, fileId: `uploads/${webMp4Filename}` };
}

/** True when the file has a real picture (not audio only / cover art only). */
async function hasVideoStream(file: string): Promise<boolean> {
  try {
    const res: any = await execFilePromise(getFfprobeBinary(), [
      "-v", "error", "-show_entries", "stream=codec_type:stream_disposition=attached_pic", "-of", "json", file,
    ], { maxBuffer: 4 * 1024 * 1024, timeout: 30000 });
    const info = JSON.parse(String(res.stdout || "{}"));
    return (info.streams || []).some((s: any) => s.codec_type === "video" && !(s.disposition && s.disposition.attached_pic));
  } catch {
    return true; // can't tell: treat as video (the old behaviour)
  }
}
