import { NextRequest, NextResponse } from "next/server";
import { generatePreviewClip, generatePosterImage, CAPTION_FONTS } from "@/lib/videoService";
import { normalizeClipStyle } from "@/lib/clipStyle";
import { produceClip } from "@/lib/clipProducer";
import path from "path";
import fs from "fs";
import { verifyAuthAndRateLimit } from "@/lib/authRateLimit";
import crypto from "crypto";

async function performRender(
  body: any
): Promise<{ status: number; payload: any }> {
  const renderStartTime = Date.now();
  try {
    const {
      inputPath,
      startTime,
      duration,
      aspectRatio,
      splitScreen,
      splitScreenOptions,
      captionPositionY,
      reframeMode,
      transcript,
      headline,
      captionStyle,
      broll,
      music,
      removeSilences,
      hookTitle,
      keywords,
      clipStyle,
      captionFont,
      pexelsKey,
      pixabayKey,
      unsplashKey,
      groqKey,
      openaiKey,
      claudeKey,
    } = body;

    if (!inputPath || startTime === undefined || !duration) {
      return { status: 400, payload: { error: "inputPath, startTime, and duration are required" } };
    }

    // Non-numeric values would otherwise flow into ffmpeg as NaN and fail
    // with an opaque 500.
    if (
      typeof startTime !== "number" || !Number.isFinite(startTime) || startTime < 0 ||
      typeof duration !== "number" || !Number.isFinite(duration) || duration <= 0
    ) {
      return { status: 400, payload: { error: "startTime and duration must be valid numbers" } };
    }

    const outputDir = path.join(process.cwd(), "public", "rendered_clips");
    const outputFilename = `clip-${Date.now()}.mp4`;
    const outputPath = path.join(outputDir, outputFilename);

    const start2 = Number(Number(startTime).toFixed(2));
    const dur2 = Number(Number(duration).toFixed(2));
    console.log(`[Stage: Render Clip API] Rendering clip from ${start2}s (${dur2}s) -> ${outputFilename}`);

    // Source-absolute words; `deleted` words (editor) are cut from the
    // video and captions, edited text is burned as typed.
    const absWords = Array.isArray(transcript)
      ? transcript
          .map((w: any) => ({
            text: String(w?.text ?? w?.word ?? ""),
            start: Number(w?.start),
            end: Number(w?.end),
            deleted: w?.deleted === true,
          }))
          .filter((w: any) => w.text.trim() && Number.isFinite(w.start) && Number.isFinite(w.end))
      : [];

    // Same engine as job renders (dashboard downloads and editor re-renders
    // used to skip B-roll / zooms / music / silence removal).
    const produced = await produceClip({
      inputPath,
      outputPath,
      startTime: start2,
      endTime: start2 + dur2,
      words: absWords,
      aspectRatio: aspectRatio || "9:16",
      reframeMode: reframeMode || "auto-tracker",
      splitScreen: Boolean(splitScreen),
      splitScreenOptions,
      captionPositionY: typeof captionPositionY === "number" ? captionPositionY : undefined,
      captionStyle: captionStyle || "hormozi",
      headline: typeof headline === "string" ? headline : undefined,
      hookTitle: hookTitle === true,
      keywords: Array.isArray(keywords) ? keywords.map(String).slice(0, 30) : null,
      removeSilences: removeSilences === true,
      broll: broll === true,
      musicBed: music === true,
      keys: { groqKey, openaiKey, claudeKey, pexelsKey, pixabayKey, unsplashKey },
      style: normalizeClipStyle(clipStyle),
      captionFont: typeof captionFont === "string" && CAPTION_FONTS[captionFont] ? captionFont : undefined,
    });

    // Lightweight preview rendition for smooth in-browser playback (never fatal)
    const previewName = await generatePreviewClip(outputPath).catch(() => null);
    const posterName = await generatePosterImage(outputPath).catch(() => null);
    // Exact byte sizes so the dashboard's downloader can show real
    // progress/ETA (the hosting proxy strips Content-Length, so the
    // browser's own download bar cannot).
    const fileSize = (() => { try { return fs.statSync(outputPath).size; } catch { return undefined; } })();
    const previewFileSize = (() => {
      try {
        return previewName ? fs.statSync(path.join(path.dirname(outputPath), previewName)).size : undefined;
      } catch { return undefined; }
    })();

    const elapsedMs = Date.now() - renderStartTime;
    return { status: 200, payload: {
      success: true,
      downloadUrl: `/api/media?file=rendered_clips/${outputFilename}`,
      previewDownloadUrl: previewName
        ? `/api/media?file=rendered_clips/${previewName}`
        : undefined,
      posterUrl: posterName
        ? `/api/media?file=rendered_clips/${posterName}`
        : undefined,
      fileSize,
      previewFileSize,
      fxApplied: Boolean(produced.fxSummary),
      fxSummary: produced.fxSummary,
      filename: outputFilename,
      tracking: produced.tracking,
      duration: produced.duration,
      keepRanges: produced.keepRanges,
      timeKnots: produced.timeKnots,
      fillersRemoved: produced.fillersRemoved,
      deletedRemoved: produced.deletedRemoved,
      timingMs: elapsedMs,
    } };
  } catch (error: any) {
    console.error("[Stage: Render Clip API] FFmpeg Render Error:", error);
    return { status: 500, payload: { error: error?.message || "FFmpeg video rendering failed" } };
  }
}

// ---------------------------------------------------------------------------
// Async render registry.
//
// Manual renders run 30-60s+ synchronously, which dies behind proxies
// with short response waits — the Cloudflare Worker front door cut
// them at ~30s with a 502 while the render itself finished fine on the
// server. POST now validates, starts the render detached and returns
// a renderId immediately; clients poll GET until the result lands
// (the same pattern job processing already uses). Identical in-flight
// requests share one render, and a completed result is replayed for
// 10 minutes so a re-click is instant.
// ---------------------------------------------------------------------------
type RenderEntry = {
  status: "rendering" | "completed" | "failed";
  startedAt: number;
  payload?: any;
  error?: string;
};
const renderRegistry = new Map<string, RenderEntry>();
const RENDER_KEEP_MS = 10 * 60 * 1000;
const RENDER_MAX_AGE_MS = 30 * 60 * 1000;

function sweepRenders() {
  const now = Date.now();
  for (const [k, v] of renderRegistry) {
    if (now - v.startedAt > RENDER_MAX_AGE_MS) renderRegistry.delete(k);
  }
}

function renderKeyFor(body: any): string {
  // Everything that changes the output (API keys and cookies excluded).
  const { groqKey, openaiKey, claudeKey, pexelsKey, pixabayKey, unsplashKey, ...rest } = body || {};
  void groqKey; void openaiKey; void claudeKey; void pexelsKey; void pixabayKey; void unsplashKey;
  const sortKeys = (v: any): any =>
    Array.isArray(v)
      ? v.map(sortKeys)
      : v && typeof v === "object"
        ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])]))
        : v;
  const stable = JSON.stringify(sortKeys(rest));
  return "r_" + crypto.createHash("sha256").update(stable).digest("hex").slice(0, 32);
}

export async function POST(req: NextRequest) {
  const authError = verifyAuthAndRateLimit(req);
  if (authError) return authError;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Request body was cut off or invalid — please retry." },
      { status: 400 }
    );
  }

  if (!body?.inputPath || body.startTime === undefined || !body.duration) {
    return NextResponse.json(
      { error: "inputPath, startTime, and duration are required" },
      { status: 400 }
    );
  }
  if (
    typeof body.startTime !== "number" || !Number.isFinite(body.startTime) || body.startTime < 0 ||
    typeof body.duration !== "number" || !Number.isFinite(body.duration) || body.duration <= 0
  ) {
    return NextResponse.json(
      { error: "startTime and duration must be valid numbers" },
      { status: 400 }
    );
  }

  sweepRenders();
  const key = renderKeyFor(body);
  const existing = renderRegistry.get(key);
  if (existing?.status === "completed" && Date.now() - existing.startedAt < RENDER_KEEP_MS) {
    return NextResponse.json({ ...existing.payload, status: "completed", renderId: key });
  }
  if (existing?.status === "rendering") {
    return NextResponse.json({ status: "rendering", renderId: key }, { status: 202 });
  }

  const entry: RenderEntry = { status: "rendering", startedAt: Date.now() };
  renderRegistry.set(key, entry);
  performRender(body)
    .then(({ status, payload }) => {
      if (status === 200 && payload?.success) {
        entry.status = "completed";
        entry.payload = payload;
      } else {
        entry.status = "failed";
        entry.error = payload?.error || "Render failed";
      }
    })
    .catch((err: any) => {
      entry.status = "failed";
      entry.error = err?.message || "Render failed";
    });

  return NextResponse.json({ status: "rendering", renderId: key }, { status: 202 });
}

export async function GET(req: NextRequest) {
  const authError = verifyAuthAndRateLimit(req);
  if (authError) return authError;

  const id = req.nextUrl.searchParams.get("id") || "";
  sweepRenders();
  const entry = renderRegistry.get(id);
  if (!entry) {
    return NextResponse.json(
      { error: "Unknown or expired render id — please start the render again." },
      { status: 404 }
    );
  }
  if (entry.status === "rendering") {
    return NextResponse.json({
      status: "rendering",
      renderId: id,
      elapsedMs: Date.now() - entry.startedAt,
    });
  }
  if (entry.status === "failed") {
    return NextResponse.json({ status: "failed", renderId: id, error: entry.error || "Render failed" });
  }
  return NextResponse.json({ ...entry.payload, status: "completed", renderId: id });
}
