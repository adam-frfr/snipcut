import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import util from "util";
import { getFfmpegBinary, getYtDlpBinary, probeVideoFormat, checkZscaleSupported } from "./videoService";
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

  const args = [
    "--js-runtimes", "node",
    "--ffmpeg-location", getFfmpegBinary(),
    ...cookieArgs,
    ...proxyArgs,
    "--extractor-args", "youtube:player_client=android,ios,web",
    "-f", preferredFormat,
    "--no-warnings", "--ignore-errors", "--no-playlist",
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
    throw new Error(friendlyDownloadError(`${dlErr?.stderr || ""} ${dlErr?.message || ""}`));
  } finally {
    if (tempCookie) {
      try { fs.unlinkSync(tempCookie); } catch {}
    }
  }

  const target = path.join(downloadDir, `${filePrefix}.mp4`);
  if (fs.existsSync(target)) return { filePath: target, fileId: `downloads/${filePrefix}.mp4` };
  const found = fs
    .readdirSync(downloadDir)
    .find((f) => f.startsWith(filePrefix) && /\.(mp4|mkv|webm|mov)$/i.test(f));
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
  const webMp4Filename = `${baseName}.mp4`;
  const webMp4Path = path.join(uploadsDir, webMp4Filename);
  const ffmpegBin = getFfmpegBinary();
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
