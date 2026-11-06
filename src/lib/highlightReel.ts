import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import util from "util";
import { getFfmpegBinary, subtitlesFilter, CAPTION_FONTS } from "./videoService";
import { probeDuration } from "./clipStyle";

const execFileP = util.promisify(execFile);

export interface ReelSource {
  /** Finished clip file (captions, effects and all). */
  path: string;
  /** Its big moment (seconds into the clip), when the effects pass found one. */
  hype?: number;
}

/**
 * Highlight reel: the best few seconds of each finished clip, stitched into
 * one 30-60s video with quick slide transitions and a "BEST MOMENTS" title.
 * All clips of a job share one size, so they join cleanly.
 */
export async function buildHighlightReel(
  sources: ReelSource[],
  output: string,
  opts: { W: number; H: number; title?: string; font?: string }
): Promise<{ duration: number; parts: number } | null> {
  const usable: { path: string; start: number; len: number }[] = [];
  const parts = sources.slice(0, 6);
  if (parts.length < 2) return null;
  const segLen = Math.max(5, Math.min(11, 56 / parts.length));
  for (const s of parts) {
    const d = await probeDuration(s.path);
    if (d < 3) continue;
    const len = Math.min(segLen, d);
    // Around the big moment when known, else after the opening hook.
    const centre = s.hype !== undefined ? s.hype : Math.min(d * 0.35, 6);
    const start = Math.max(0, Math.min(d - len, centre - len * 0.35));
    usable.push({ path: s.path, start, len });
  }
  if (usable.length < 2) return null;

  const { W, H } = opts;
  const T = 0.4; // transition length
  const AF = "aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo";
  const args = ["-hide_banner", "-loglevel", "error", "-y"];
  for (const u of usable) args.push("-ss", u.start.toFixed(3), "-t", u.len.toFixed(3), "-i", u.path);

  const f: string[] = [];
  usable.forEach((_, i) => {
    f.push(`[${i}:v]fps=30,scale=${W}:${H}:force_original_aspect_ratio=increase,crop=${W}:${H},setsar=1,format=yuv420p,settb=AVTB[v${i}]`);
    f.push(`[${i}:a]${AF},asetpts=PTS-STARTPTS[a${i}]`);
  });
  const kinds = ["slideleft", "smoothup", "slideright", "circleopen", "fadeblack"];
  let vLast = "v0";
  let aLast = "a0";
  let acc = usable[0].len;
  for (let i = 1; i < usable.length; i++) {
    const off = Math.max(0.1, acc - T);
    f.push(`[${vLast}][v${i}]xfade=transition=${kinds[(i - 1) % kinds.length]}:duration=${T}:offset=${off.toFixed(3)}[vx${i}]`);
    f.push(`[${aLast}][a${i}]acrossfade=d=${T}[ax${i}]`);
    vLast = `vx${i}`;
    aLast = `ax${i}`;
    acc = acc + usable[i].len - T;
  }

  // Title card over the opening.
  const fontName = CAPTION_FONTS[opts.font || "anton"] || CAPTION_FONTS.anton || "Arial";
  const sc = Math.min(W, H) / 1080;
  const title = (opts.title || "BEST MOMENTS").replace(/[{}\\\r\n]/g, " ").toUpperCase().slice(0, 40);
  const ass = `[Script Info]
ScriptType: v4.00+
PlayResX: ${W}
PlayResY: ${H}
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Reel,${fontName},${Math.round(96 * sc)},&H00111111,&H00111111,&H0000D7FF,&H00000000,-1,0,0,0,100,100,2,0,3,${Math.round(22 * sc)},0,5,40,40,0,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
Dialogue: 9,0:00:00.00,0:00:01.80,Reel,,0,0,0,,{\\an5\\pos(${Math.round(W / 2)},${Math.round(H * 0.42)})\\fad(80,220)\\fscx60\\fscy60\\t(0,200,\\fscx106\\fscy106)\\t(200,320,\\fscx100\\fscy100)}${title}
`;
  const assPath = path.join(path.dirname(output), `reel-title-${Date.now()}.ass`);
  fs.writeFileSync(assPath, ass, "utf-8");
  f.push(`[${vLast}]${subtitlesFilter(assPath)}[vout]`);
  args.push(
    "-filter_complex", f.join(";"), "-map", "[vout]", "-map", `[${aLast}]`,
    "-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", output
  );
  try {
    await execFileP(getFfmpegBinary(), args, { maxBuffer: 64 * 1024 * 1024 });
  } finally {
    try { fs.unlinkSync(assPath); } catch {}
  }
  if (!fs.existsSync(output)) return null;
  return { duration: Number((await probeDuration(output)).toFixed(2)), parts: usable.length };
}
