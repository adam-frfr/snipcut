import { NextRequest, NextResponse } from "next/server";
import { renderVideoClip, generatePreviewClip } from "@/lib/videoService";
import path from "path";
import os from "os";
import { verifyAuthAndRateLimit } from "@/lib/authRateLimit";

export async function POST(req: NextRequest) {
  const authError = verifyAuthAndRateLimit(req);
  if (authError) return authError;

  const renderStartTime = Date.now();
  try {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Request body was cut off or invalid — please retry." },
        { status: 400 }
      );
    }
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
    } = body;

    if (!inputPath || startTime === undefined || !duration) {
      return NextResponse.json(
        { error: "inputPath, startTime, and duration are required" },
        { status: 400 }
      );
    }

    const outputDir = path.join(process.cwd(), "public", "rendered_clips");
    const outputFilename = `clip-${Date.now()}.mp4`;
    const outputPath = path.join(outputDir, outputFilename);

    console.log(
      `[Stage: Render Clip API] Rendering clip from ${startTime}s (${duration}s) -> ${outputFilename}`
    );

    const renderResult = await renderVideoClip({
      inputPath,
      outputPath,
      startTime: Number(Number(startTime).toFixed(2)),
      duration: Number(Number(duration).toFixed(2)),
      aspectRatio: aspectRatio || "9:16",
      reframeMode: reframeMode || "auto-tracker",
      splitScreen: Boolean(splitScreen),
      splitScreenOptions,
      captionPositionY,
      transcript,
      headline,
      captionStyle,
    });

    // Lightweight preview rendition for smooth in-browser playback (never fatal)
    const previewName = await generatePreviewClip(outputPath).catch(() => null);

    const elapsedMs = Date.now() - renderStartTime;
    return NextResponse.json({
      success: true,
      downloadUrl: `/api/media?file=rendered_clips/${outputFilename}`,
      previewDownloadUrl: previewName
        ? `/api/media?file=rendered_clips/${previewName}`
        : undefined,
      filename: outputFilename,
      tracking: renderResult.tracking,
      timingMs: elapsedMs,
    });
  } catch (error: any) {
    console.error("[Stage: Render Clip API] FFmpeg Render Error:", error);
    return NextResponse.json(
      { error: error?.message || "FFmpeg video rendering failed" },
      { status: 500 }
    );
  }
}
