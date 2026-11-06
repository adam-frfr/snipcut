import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import util from "util";
import { verifyAuthAndRateLimit } from "@/lib/authRateLimit";
import { getFfmpegBinary, subtitlesFilter, wrapTitle, stripEmoji, CAPTION_FONTS } from "@/lib/videoService";
import { detectHypeMoments, probeDuration, hexToAss } from "@/lib/clipStyle";

const execFileP = util.promisify(execFile);
const CLIP_URL = /^\/api\/media\?file=rendered_clips\/([A-Za-z0-9._-]+\.mp4)$/;

/**
 * Thumbnail maker: the clip's best frame (its big moment, at a point where
 * no caption is on screen) with the headline in big outlined letters.
 * POST { videoUrl, headline, words?: [{start,end}], font?, accent? } -> { url }
 */
export async function POST(req: NextRequest) {
  const authError = verifyAuthAndRateLimit(req);
  if (authError) return authError;
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const m = CLIP_URL.exec(String(body?.videoUrl || ""));
  if (!m) return NextResponse.json({ error: "Render the clip first, then make its thumbnail." }, { status: 400 });
  const clipDir = path.join(process.cwd(), "public", "rendered_clips");
  const clipPath = path.join(clipDir, m[1]);
  if (!fs.existsSync(clipPath)) return NextResponse.json({ error: "Clip file not found — render it again." }, { status: 404 });

  const headline = stripEmoji(String(body?.headline || "")).replace(/[{}\\]/g, "").trim().slice(0, 90) || "WATCH THIS";
  const font = typeof body?.font === "string" && CAPTION_FONTS[body.font] ? CAPTION_FONTS[body.font] : CAPTION_FONTS.anton || "Arial";
  const accent = typeof body?.accent === "string" && /^#[0-9a-fA-F]{6}$/.test(body.accent) ? hexToAss(body.accent) : "&H0000D7FF";

  try {
    const duration = await probeDuration(clipPath);
    if (duration <= 0) throw new Error("unreadable clip");
    // Frame: near the loudest moment, inside a pause (no caption burned in),
    // clear of the hook title (start) and end card (end).
    const words: { start: number; end: number }[] = Array.isArray(body?.words)
      ? body.words.map((w: any) => ({ start: Number(w?.start), end: Number(w?.end) })).filter((w: any) => Number.isFinite(w.start) && Number.isFinite(w.end))
      : [];
    const lo = Math.min(3.6, duration * 0.3);
    const hi = Math.max(lo + 0.1, duration - 2.6);
    const gaps: number[] = [];
    for (let i = 0; i + 1 < words.length; i++) {
      if (words[i + 1].start - words[i].end >= 0.2) gaps.push((words[i].end + words[i + 1].start) / 2);
    }
    const target = (await detectHypeMoments(clipPath, duration, 1))[0] ?? duration * 0.4;
    const pool = gaps.filter((g) => g > lo && g < hi);
    const at = pool.length ? pool.reduce((b, g) => (Math.abs(g - target) < Math.abs(b - target) ? g : b), pool[0]) : Math.min(hi, Math.max(lo, target));

    const probe: any = await execFileP(getFfmpegBinary(), ["-hide_banner", "-i", clipPath], { timeout: 30000 }).catch((e: any) => e);
    const dim = /,\s*(\d{3,5})x(\d{3,5})/.exec(String(probe?.stderr || ""));
    const W = dim ? Number(dim[1]) : 1080;
    const H = dim ? Number(dim[2]) : 1920;
    const scale = Math.min(W, H) / 1080;
    const size = Math.round((H > W ? 128 : 112) * scale);
    const lines = wrapTitle(headline.toUpperCase(), Math.max(8, Math.floor((W - 120) / ((/Anton|Bebas/.test(font) ? 0.44 : 0.58) * size)))).slice(0, 4);
    // The longest word pops in the accent colour.
    const longest = headline.toUpperCase().split(/\s+/).reduce((a, b) => (b.replace(/\W/g, "").length > a.replace(/\W/g, "").length ? b : a), "");
    // Braces and backslashes in a title would be read as ASS override tags.
    const esc = (t: string) => t.replace(/\\/g, "\\\\").replace(/\{/g, "\\{").replace(/\}/g, "\\}");
    const text = lines
      .map((l) => l.split(" ").map((w) => (w === longest ? `{\\c${accent}}${esc(w)}{\\c&H00FFFFFF&}` : esc(w))).join(" "))
      .join("\\N");
    const ass = `[Script Info]
ScriptType: v4.00+
PlayResX: ${W}
PlayResY: ${H}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Thumb,${font},${size},&H00FFFFFF,&H00FFFFFF,&H00000000,&H64000000,-1,0,0,0,100,100,0,0,1,${Math.round(12 * scale)},${Math.round(8 * scale)},8,50,50,${Math.round(H * (H > W ? 0.07 : 0.06))},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 0,0:00:00.00,0:00:10.00,Thumb,,0,0,0,,{\\frz-2}${text}
`;
    const stamp = Date.now();
    const assPath = path.join(process.cwd(), "data", "postfx", `thumb-${stamp}.ass`);
    fs.mkdirSync(path.dirname(assPath), { recursive: true });
    fs.writeFileSync(assPath, ass, "utf-8");
    const outName = `thumb-${m[1].replace(/\.mp4$/, "")}-${stamp}.jpg`;
    const outPath = path.join(clipDir, outName);
    try {
      await execFileP(
        getFfmpegBinary(),
        [
          "-hide_banner", "-loglevel", "error", "-y",
          "-ss", at.toFixed(2), "-i", clipPath, "-frames:v", "1",
          "-vf", `eq=saturation=1.28:contrast=1.1:brightness=0.02,unsharp=5:5:0.6,vignette=PI/5,${subtitlesFilter(assPath)}`,
          "-q:v", "2", outPath,
        ],
        { timeout: 60000 }
      );
    } finally {
      try { fs.unlinkSync(assPath); } catch {}
    }
    if (!fs.existsSync(outPath)) throw new Error("no thumbnail written");
    return NextResponse.json({ url: `/api/media?file=rendered_clips/${outName}`, at: Number(at.toFixed(2)) });
  } catch (e: any) {
    console.error("[Thumbnail] failed:", e);
    return NextResponse.json({ error: "Couldn't make the thumbnail — try again." }, { status: 500 });
  }
}
