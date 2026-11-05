import { NextRequest, NextResponse } from "next/server";
import { verifyAuthAndRateLimit } from "@/lib/authRateLimit";
import { getJobRecord, saveJobRecord } from "@/lib/jobQueue";
import { normalizeClipStyle } from "@/lib/clipStyleOptions";
import { CAPTION_FONTS } from "@/lib/videoService";

/**
 * Save an editor re-render into its project, so reopening the project (on
 * any device) shows the edited clip instead of the original.
 * POST { index, clip: { ...editable fields } }
 */
const MEDIA_URL = /^\/api\/media\?file=rendered_clips\/[A-Za-z0-9._-]+$/;
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const str = (v: unknown, max = 500) => (typeof v === "string" ? v.slice(0, max) : undefined);
const url = (v: unknown) => (typeof v === "string" && MEDIA_URL.test(v) ? v : undefined);

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authError = verifyAuthAndRateLimit(req);
  if (authError) return authError;
  const { id } = await params;
  const job = getJobRecord(id);
  if (!job || !job.output) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const index = Number(body?.index);
  const count = job.output.curatedClips?.length || 0;
  if (!Number.isInteger(index) || index < 0 || index >= count) {
    return NextResponse.json({ error: "Invalid clip index" }, { status: 400 });
  }
  const c = body?.clip || {};
  const words = Array.isArray(c.sourceWords)
    ? c.sourceWords.slice(0, 6000).flatMap((w: any) => {
        const start = num(w?.start);
        const end = num(w?.end);
        const text = str(w?.text, 80);
        return start === undefined || end === undefined || text === undefined
          ? []
          : [{ start, end, text, ...(w?.deleted === true ? { deleted: true } : {}) }];
      })
    : undefined;
  const ranges = Array.isArray(c.keepRanges)
    ? c.keepRanges.slice(0, 500).flatMap((r: any) => {
        const start = num(r?.start);
        const end = num(r?.end);
        return start === undefined || end === undefined ? [] : [{ start, end }];
      })
    : undefined;
  const fx = c.fx && typeof c.fx === "object"
    ? Object.fromEntries(
        ["removeSilences", "broll", "musicBed", "hookTitle", "keywordHighlights"].map((k) => [k, c.fx[k] === true])
      )
    : undefined;
  if (fx && c.fx.clipStyle && typeof c.fx.clipStyle === "object") (fx as any).clipStyle = normalizeClipStyle(c.fx.clipStyle);
  if (fx && typeof c.fx.captionFont === "string" && CAPTION_FONTS[c.fx.captionFont]) (fx as any).captionFont = c.fx.captionFont;
  const edited = Object.fromEntries(
    Object.entries({
      startTime: num(c.startTime),
      endTime: num(c.endTime),
      duration: num(c.duration),
      videoUrl: url(c.videoUrl),
      renderedVideoUrl: url(c.renderedVideoUrl),
      previewUrl: url(c.previewUrl),
      posterUrl: url(c.posterUrl),
      fileSize: num(c.fileSize),
      previewFileSize: num(c.previewFileSize),
      hookHeadline: str(c.hookHeadline, 300),
      title: str(c.title, 200),
      description: str(c.description, 2000),
      captionStyle: str(c.captionStyle, 20),
      aspectRatio: ["9:16", "1:1", "16:9"].includes(c.aspectRatio) ? c.aspectRatio : undefined,
      keepRanges: ranges,
      timeKnots: Array.isArray(c.timeKnots)
        ? c.timeKnots
            .slice(0, 20)
            .filter((k: any) => Array.isArray(k) && k.length === 2 && k.every((v: any) => typeof v === "number" && Number.isFinite(v)))
        : undefined,
      sourceWords: words,
      fx,
    }).filter(([, v]) => v !== undefined)
  );
  if (!edited.renderedVideoUrl) return NextResponse.json({ error: "Edited clip has no rendered video" }, { status: 400 });

  // Re-read right before writing: the job worker may have saved meanwhile.
  const fresh = getJobRecord(id) || job;
  fresh.output = fresh.output || {};
  fresh.output.editedClips = { ...(fresh.output.editedClips || {}), [String(index)]: { ...edited, editedAt: Date.now() } };
  saveJobRecord(fresh);
  return NextResponse.json({ success: true });
}
