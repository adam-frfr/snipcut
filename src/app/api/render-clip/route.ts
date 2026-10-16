import { NextRequest, NextResponse } from "next/server";
import { renderVideoClip } from "@/lib/videoService";
import path from "path";
import os from "os";

export async function POST(req: NextRequest) {
  const renderStartTime = Date.now();
  try {
    const {
      inputPath,
      startTime,
      duration,
      aspectRatio,
      splitScreen,
      reframeMode,
      transcript,
      headline,
      captionStyle,
    } = await req.json();

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
      startTime: Number(startTime),
      duration: Number(duration),
      aspectRatio: aspectRatio || "9:16",
      reframeMode: reframeMode || "auto-tracker",
      splitScreen: Boolean(splitScreen),
      transcript,
      headline,
      captionStyle,
    });

    const elapsedMs = Date.now() - renderStartTime;
    return NextResponse.json({
      success: true,
      downloadUrl: `/api/media?file=rendered_clips/${outputFilename}`,
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
