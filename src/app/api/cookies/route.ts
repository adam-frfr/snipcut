import { NextRequest, NextResponse } from "next/server";
import { execFile } from "child_process";
import util from "util";
import { verifyAuthAndRateLimit } from "@/lib/authRateLimit";
import { getYtDlpBinary } from "@/lib/videoService";
import { getServerCookieJar, saveServerCookieJar, normalizeCookiesToNetscape, friendlyDownloadError } from "@/lib/youtubeCookies";

const execFilePromise = util.promisify(execFile);

// A stable, public, non-age-restricted video used purely as a cookie probe.
const PROBE_URL = "https://www.youtube.com/watch?v=dQw4w9WgXcQ";

export async function GET(req: NextRequest) {
  const authError = verifyAuthAndRateLimit(req);
  if (authError) return authError;
  const jar = getServerCookieJar();
  return NextResponse.json({
    hasCookies: !!jar,
    cookieCount: jar?.count ?? 0,
    savedAt: jar?.savedAt ?? null,
  });
}

export async function POST(req: NextRequest) {
  const authError = verifyAuthAndRateLimit(req);
  if (authError) return authError;

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Save mode: { cookies: "<pasted in any supported format>" }
  if (typeof body.cookies === "string") {
    const saved = saveServerCookieJar(body.cookies);
    if (!saved) {
      return NextResponse.json(
        {
          error:
            "Couldn't find any usable cookies in that paste. Export from youtube.com while signed in — a cookies.txt file, a Cookie-Editor JSON export, or the raw Cookie header string all work.",
        },
        { status: 400 }
      );
    }
    return NextResponse.json({ success: true, cookieCount: saved.count });
  }

  // Test mode: { action: "test", cookies?: "<optional unsaved paste to test>" }
  if (body.action === "test") {
    let cookieFile: string | null = null;
    let tempFile: string | null = null;
    const fs = await import("fs");
    const path = await import("path");
    const os = await import("os");

    if (typeof body.cookies === "string" && body.cookies.trim().length > 10) {
      const normalized = normalizeCookiesToNetscape(body.cookies);
      if (!normalized) {
        return NextResponse.json({ valid: false, error: "That paste doesn't contain usable cookies." });
      }
      tempFile = path.join(os.tmpdir(), `yt-cookie-test-${Date.now()}.txt`);
      fs.writeFileSync(tempFile, normalized.content, "utf-8");
      cookieFile = tempFile;
    } else {
      const jar = getServerCookieJar();
      if (jar) cookieFile = jar.filePath;
    }

    const args: string[] = ["--no-warnings", "--ignore-errors", "--get-title", "--get-id"];
    if (cookieFile) args.push("--cookies", cookieFile);
    args.push("--extractor-args", "youtube:player_client=web,ios,android", PROBE_URL);

    try {
      const { stdout } = await execFilePromise(getYtDlpBinary(), args, { timeout: 45000 });
      const lines = stdout.trim().split("\n").filter(Boolean);
      return NextResponse.json({ valid: true, title: lines[0] || "OK", usedCookies: !!cookieFile });
    } catch (err: any) {
      const raw = `${err?.stderr || ""} ${err?.message || ""}`;
      return NextResponse.json({ valid: false, error: friendlyDownloadError(raw), usedCookies: !!cookieFile });
    } finally {
      if (tempFile) {
        try {
          fs.unlinkSync(tempFile);
        } catch {}
      }
    }
  }

  return NextResponse.json({ error: "Provide { cookies } to save or { action: 'test' } to test." }, { status: 400 });
}
