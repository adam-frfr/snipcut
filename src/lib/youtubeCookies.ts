import fs from "fs";
import path from "path";
import os from "os";

/**
 * YouTube cookie handling for yt-dlp.
 *
 * yt-dlp's --cookies flag only understands Netscape-format cookie files, but
 * users paste cookies in whatever shape their browser/tool gave them:
 *   1. Netscape format (from "Get cookies.txt LOCALLY" style extensions)
 *   2. JSON array (from Cookie-Editor style extensions)
 *   3. A raw "name=value; name=value" Cookie header string (devtools copy)
 * Before this module existed the pasted text was written to disk verbatim,
 * so formats 2 and 3 were silently ignored by yt-dlp and YouTube's
 * "Sign in to confirm you're not a bot" wall killed every download.
 */

const NETSCAPE_HEADER = "# Netscape HTTP Cookie File\n# Converted by OpusClip Studio\n";

function netscapeLine(domain: string, name: string, value: string, opts?: { secure?: boolean; expiry?: number; path?: string }): string {
  const d = domain.startsWith(".") ? domain : `.${domain.replace(/^\./, "")}`;
  const expiry = opts?.expiry && opts.expiry > 0 ? Math.floor(opts.expiry) : Math.floor(Date.now() / 1000) + 365 * 24 * 3600;
  return [d, "TRUE", opts?.path || "/", opts?.secure === false ? "FALSE" : "TRUE", String(expiry), name, value].join("\t");
}

/** Normalize any supported cookie paste into Netscape format. Returns null when nothing usable is found. */
export function normalizeCookiesToNetscape(raw: string): { content: string; count: number } | null {
  if (!raw || raw.trim().length < 8) return null;
  const text = raw.trim();

  // Format 2: JSON array of cookie objects (Cookie-Editor export)
  if (text.startsWith("[")) {
    try {
      const arr = JSON.parse(text);
      if (Array.isArray(arr)) {
        const lines: string[] = [];
        for (const c of arr) {
          if (!c || typeof c.name !== "string" || typeof c.value !== "string") continue;
          const domain = typeof c.domain === "string" ? c.domain : ".youtube.com";
          if (!/youtube\.com|google\.com/.test(domain)) continue;
          lines.push(
            netscapeLine(domain, c.name, c.value, {
              secure: c.secure !== false,
              expiry: typeof c.expirationDate === "number" ? c.expirationDate : undefined,
              path: typeof c.path === "string" ? c.path : "/",
            })
          );
        }
        if (lines.length > 0) return { content: NETSCAPE_HEADER + lines.join("\n") + "\n", count: lines.length };
      }
    } catch {
      /* fall through to other formats */
    }
  }

  // Format 1: already Netscape (tab-separated lines mentioning a domain)
  if (text.includes("\t") && /(youtube|google)\.com/.test(text)) {
    const lines = text
      .split(/\r?\n/)
      .filter((l) => l.trim().length > 0 && !l.startsWith("#"))
      .filter((l) => l.split("\t").length >= 7);
    if (lines.length > 0) {
      return { content: NETSCAPE_HEADER + lines.join("\n") + "\n", count: lines.length };
    }
  }

  // Format 3: raw Cookie header string "a=b; c=d; ..." (possibly with a leading "cookie:" label)
  const headerText = text.replace(/^cookie\s*:\s*/i, "");
  if (headerText.includes("=") && !headerText.includes("\n")) {
    const pairs = headerText
      .split(";")
      .map((p) => p.trim())
      .filter((p) => p.includes("=") && !p.startsWith("="));
    const lines: string[] = [];
    for (const pair of pairs) {
      const eq = pair.indexOf("=");
      const name = pair.slice(0, eq).trim();
      const value = pair.slice(eq + 1).trim();
      if (!name || /[\s;]/.test(name)) continue;
      lines.push(netscapeLine(".youtube.com", name, value));
    }
    if (lines.length > 0) return { content: NETSCAPE_HEADER + lines.join("\n") + "\n", count: lines.length };
  }

  return null;
}

/** Persistent server-side cookie jar: data/cookies.txt inside the app directory. */
export function serverCookieJarPath(): string {
  return path.join(process.cwd(), "data", "cookies.txt");
}

export function getServerCookieJar(): { filePath: string; count: number; savedAt: string } | null {
  const jar = serverCookieJarPath();
  if (!fs.existsSync(jar)) return null;
  try {
    const content = fs.readFileSync(jar, "utf-8");
    const count = content.split("\n").filter((l) => l.includes("\t") && !l.startsWith("#")).length;
    if (count === 0) return null;
    return { filePath: jar, count, savedAt: fs.statSync(jar).mtime.toISOString() };
  } catch {
    return null;
  }
}

export function saveServerCookieJar(raw: string): { count: number } | null {
  const normalized = normalizeCookiesToNetscape(raw);
  if (!normalized) return null;
  const jar = serverCookieJarPath();
  fs.mkdirSync(path.dirname(jar), { recursive: true });
  fs.writeFileSync(jar, normalized.content, "utf-8");
  return { count: normalized.count };
}

/**
 * Resolve the --cookies argument for a yt-dlp invocation.
 * Priority: cookies supplied with the request (normalized to a temp file)
 *           -> persistent server jar
 *           -> YOUTUBE_COOKIES env (normalized to a temp file)
 *           -> legacy ./cookies.txt dropped next to the app
 * Returns the CLI fragment plus an optional temp file the caller must delete.
 */
export function resolveCookieArg(requestCookies?: string): { arg: string; tempFile: string | null } {
  const fromRequest = (requestCookies || "").trim();
  const fromEnv = (process.env.YOUTUBE_COOKIES || "").trim();

  for (const candidate of [fromRequest, fromEnv]) {
    if (candidate.length > 10) {
      const normalized = normalizeCookiesToNetscape(candidate);
      if (normalized) {
        const tempFile = path.join(os.tmpdir(), `yt-cookies-${Date.now()}.txt`);
        fs.writeFileSync(tempFile, normalized.content, "utf-8");
        return { arg: `--cookies "${tempFile}"`, tempFile };
      }
    }
  }

  const jar = getServerCookieJar();
  if (jar) return { arg: `--cookies "${jar.filePath}"`, tempFile: null };

  const legacy = path.join(process.cwd(), "cookies.txt");
  if (fs.existsSync(legacy)) return { arg: `--cookies "${legacy}"`, tempFile: null };

  return { arg: "", tempFile: null };
}

/** Turn raw yt-dlp failures into messages a human can act on. */
export function friendlyDownloadError(rawError: string): string {
  const e = rawError || "";
  if (/not a bot|Sign in to confirm/i.test(e)) {
    return "YouTube blocked this download with its bot check. Add fresh YouTube cookies in Settings (API Keys → YouTube Cookies) and use the Test button to verify them, then try again.";
  }
  if (/Video unavailable|Private video|This video is no longer available/i.test(e)) {
    return "YouTube says this video is unavailable or private. Check the link and try a different video.";
  }
  if (/age/i.test(e) && /confirm/i.test(e)) {
    return "This video is age-restricted. Add YouTube cookies from a signed-in account in Settings, then try again.";
  }
  if (/HTTP Error 429|Too Many Requests/i.test(e)) {
    return "YouTube is rate-limiting downloads right now. Wait a few minutes and try again.";
  }
  if (/timed out|ETIMEDOUT|ENOTFOUND|ECONNREFUSED/i.test(e)) {
    return "The download timed out reaching YouTube. Check the link and try again.";
  }
  return "Failed to download the video. Check the link is a valid public video URL and try again.";
}
