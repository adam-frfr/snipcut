import fs from "fs";
import path from "path";
import dns from "dns";
import net from "net";
import http from "http";
import https from "https";
import { safeUploadName } from "./mediaPrep";

/**
 * "Import from a direct video link": the server downloads a video file from
 * a plain https link (a file host, a downloader site's file link, cloud
 * storage...) instead of the user uploading it. It never touches YouTube,
 * so YouTube's datacenter bot check doesn't apply.
 *
 * The server fetches a URL someone typed, so it is locked down:
 *  - http(s) only, standard ports;
 *  - every address the host resolves to is checked AT CONNECT TIME
 *    (custom lookup, so DNS rebinding can't swap in a private address);
 *    private, loopback, link-local, CGNAT and metadata ranges are refused;
 *  - redirects are followed by hand (max 5), each one checked the same way;
 *  - web pages (text/html) are refused; size cap (DIRECT_IMPORT_MAX_MB,
 *    default 2300 MB) and time limit (30 min) enforced while streaming.
 */

const MAX_REDIRECTS = 5;
const TOTAL_TIMEOUT_MS = 30 * 60 * 1000;
const IDLE_TIMEOUT_MS = 60 * 1000;
const ALLOWED_PORTS = new Set(["", "80", "443", "8080", "8443"]);
const maxBytes = () => Math.max(1, Number(process.env.DIRECT_IMPORT_MAX_MB) || 2300) * 1024 * 1024;
const allowPrivate = () => process.env.DIRECT_IMPORT_ALLOW_PRIVATE === "1"; // tests only

const YOUTUBE_HOST = /(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com)$/i;

/** True for addresses the server must never be pointed at. */
export function isPrivateAddress(ip: string): boolean {
  let a = ip.trim().toLowerCase();
  if (a.startsWith("::ffff:")) a = a.slice(7); // IPv4-mapped IPv6
  if (net.isIPv4(a)) {
    const [p0, p1] = a.split(".").map(Number);
    return (
      p0 === 0 || p0 === 10 || p0 === 127 ||
      (p0 === 100 && p1 >= 64 && p1 <= 127) || // CGNAT
      (p0 === 169 && p1 === 254) || // link-local / cloud metadata
      (p0 === 172 && p1 >= 16 && p1 <= 31) ||
      (p0 === 192 && p1 === 168) ||
      (p0 === 192 && p1 === 0) ||
      (p0 === 198 && (p1 === 18 || p1 === 19)) ||
      p0 >= 224 // multicast / reserved
    );
  }
  if (net.isIPv6(a)) {
    return (
      a === "::" || a === "::1" ||
      a.startsWith("fc") || a.startsWith("fd") || // unique local
      /^fe[89ab]/.test(a) || // link-local
      a.startsWith("ff") // multicast
    );
  }
  return true; // not an IP at all: refuse
}

/** A plain http(s) link to something that isn't YouTube, or null. */
export function normalizeDirectUrl(raw: string): string | null {
  try {
    const u = new URL(String(raw || "").trim());
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (u.username || u.password) return null;
    if (!ALLOWED_PORTS.has(u.port)) return null;
    if (YOUTUBE_HOST.test(u.hostname)) return null;
    if (net.isIP(u.hostname.replace(/^\[|\]$/g, "")) && isPrivateAddress(u.hostname.replace(/^\[|\]$/g, "")) && !allowPrivate()) return null;
    return u.toString();
  } catch {
    return null;
  }
}

/** dns.lookup that refuses private addresses (runs when the socket connects). */
function safeLookup(hostname: string, options: any, cb: any) {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses: any) => {
    if (err) return cb(err);
    const list = (Array.isArray(addresses) ? addresses : [{ address: addresses, family: options?.family || 4 }]) as { address: string; family: number }[];
    const bad = !allowPrivate() && list.find((x) => isPrivateAddress(x.address));
    if (bad || !list.length) {
      const e: any = new Error("That link points to a private or local address.");
      e.code = "EPRIVATE";
      return cb(e);
    }
    if (options?.all) return cb(null, list);
    return cb(null, list[0].address, list[0].family);
  });
}

const EXT_BY_TYPE: Record<string, string> = {
  "video/mp4": ".mp4", "video/quicktime": ".mov", "video/webm": ".webm", "video/x-matroska": ".mkv",
  "video/x-m4v": ".m4v", "audio/mpeg": ".mp3", "audio/mp4": ".m4a", "audio/x-m4a": ".m4a", "audio/wav": ".wav", "audio/x-wav": ".wav",
};

function fileNameFor(u: URL, contentType: string, disposition: string): string {
  const fromDisp = /filename\*?=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition || "")?.[1];
  let name = "";
  try { name = decodeURIComponent(fromDisp || path.basename(u.pathname) || ""); } catch { name = fromDisp || ""; }
  const ext = path.extname(name).toLowerCase();
  if (!/^\.(mp4|mov|webm|mkv|m4v|avi|mp3|m4a|wav|aac|ogg)$/.test(ext)) {
    const t = contentType.split(";")[0].trim().toLowerCase();
    name = `${path.basename(name, ext) || "video"}${EXT_BY_TYPE[t] || ".mp4"}`;
  }
  return name;
}

function request(url: URL, signal: AbortSignal): Promise<http.IncomingMessage> {
  return new Promise((resolve, reject) => {
    const mod = url.protocol === "https:" ? https : http;
    const req = mod.get(
      url,
      {
        lookup: safeLookup as any,
        headers: { "User-Agent": "Mozilla/5.0 (SnipcutStudio import)", Accept: "video/*,audio/*,application/octet-stream;q=0.9,*/*;q=0.5" },
        signal,
      },
      resolve
    );
    req.setTimeout(IDLE_TIMEOUT_MS, () => req.destroy(new Error("The link stopped responding.")));
    req.on("error", reject);
  });
}

/**
 * Download `rawUrl` into `uploadsDir` as "raw-<name>" (the same naming the
 * chunked upload uses). Returns the path and base name for normalizeUploadedVideo.
 */
export async function downloadDirectVideo(rawUrl: string, uploadsDir: string): Promise<{ rawPath: string; baseName: string; bytes: number }> {
  const start = normalizeDirectUrl(rawUrl);
  if (!start) throw new Error("That isn't a direct video link we can download (use a plain https link to the file).");
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TOTAL_TIMEOUT_MS);
  try {
    let url = new URL(start);
    let res: http.IncomingMessage | null = null;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      try {
        res = await request(url, ctl.signal);
      } catch (e: any) {
        if (e?.code === "EPRIVATE") throw new Error(e.message);
        throw new Error(`Couldn't reach that link (${e?.code || e?.message || "network error"}).`);
      }
      const code = res.statusCode || 0;
      if (code >= 300 && code < 400 && res.headers.location) {
        res.resume();
        const next = normalizeDirectUrl(new URL(res.headers.location, url).toString());
        if (!next) throw new Error("The link redirects somewhere we can't download from.");
        url = new URL(next);
        res = null;
        continue;
      }
      break;
    }
    if (!res) throw new Error("Too many redirects.");
    const code = res.statusCode || 0;
    if (code < 200 || code >= 300) {
      res.resume();
      throw new Error(`The link answered with an error (HTTP ${code}). It may have expired: get a fresh link.`);
    }
    const type = String(res.headers["content-type"] || "").toLowerCase();
    if (/text\/html|application\/xhtml|application\/json/.test(type)) {
      res.resume();
      throw new Error("That link opens a web page, not a video file. Use the download link of the file itself.");
    }
    const declared = Number(res.headers["content-length"] || 0);
    if (declared > maxBytes()) {
      res.resume();
      throw new Error(`That file is too big (max ${Math.round(maxBytes() / 1048576)} MB).`);
    }
    fs.mkdirSync(uploadsDir, { recursive: true });
    const { baseName, ext } = safeUploadName(fileNameFor(url, type, String(res.headers["content-disposition"] || "")));
    const rawPath = path.join(uploadsDir, `raw-${baseName}${ext}`);
    const out = fs.createWriteStream(rawPath);
    let bytes = 0;
    try {
      await new Promise<void>((resolve, reject) => {
        res!.on("data", (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > maxBytes()) res!.destroy(new Error(`That file is too big (max ${Math.round(maxBytes() / 1048576)} MB).`));
        });
        res!.on("error", reject);
        out.on("error", reject);
        out.on("finish", () => resolve());
        res!.pipe(out);
      });
    } catch (e: any) {
      out.destroy();
      try { fs.unlinkSync(rawPath); } catch {}
      throw new Error(ctl.signal.aborted ? "The download took too long (30 min limit)." : e?.message || "The download failed.");
    }
    if (bytes < 1024) {
      try { fs.unlinkSync(rawPath); } catch {}
      throw new Error("The link gave an empty file.");
    }
    return { rawPath, baseName, bytes };
  } finally {
    clearTimeout(timer);
  }
}
