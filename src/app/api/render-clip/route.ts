import { NextRequest, NextResponse } from "next/server";
import { renderVideoClip } from "@/lib/videoService";
import path from "path";
import os from "os";

export async function POST(req: NextRequest) {
  try {
    const {
      inputPath,
      startTime,
      duration,
      aspectRatio,
      splitScreen,
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

    await renderVideoClip({
      inputPath,
      outputPath,
      startTime: Number(startTime),
      duration: Number(duration),
      aspectRatio: aspectRatio || "9:16",
      splitScreen: Boolean(splitScreen),
      transcript,
      headline,
      captionStyle,
    });

    return NextResponse.json({
      success: true,
      downloadUrl: `/rendered_clips/${outputFilename}`,
      filename: outputFilename,
    });
  } catch (error: any) {
    console.error("FFmpeg Render Error:", error);
    return NextResponse.json(
      { error: error?.message || "FFmpeg video rendering failed" },
      { status: 500 }
    );
  }
}
