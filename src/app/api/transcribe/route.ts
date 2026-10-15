import { NextRequest, NextResponse } from "next/server";
import { getOpenAIClient } from "@/lib/aiService";
import { extractAudioForWhisper } from "@/lib/videoService";
import fs from "fs";
import path from "path";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { filePath, openaiKey } = body;

    if (!filePath || !fs.existsSync(filePath)) {
      return NextResponse.json(
        { error: "Valid filePath on the server is required for transcription" },
        { status: 400 }
      );
    }

    const openai = getOpenAIClient(openaiKey);

    let audioPath = filePath;

    // If it's a video file (.mp4, .mov, .mkv, .webm), extract compressed audio first
    const ext = path.extname(filePath).toLowerCase();
    if ([".mp4", ".mov", ".mkv", ".webm", ".avi"].includes(ext)) {
      const audioOutputDir = path.join(process.cwd(), "public", "extracted_audio");
      const audioFilename = `audio-${Date.now()}.mp3`;
      audioPath = path.join(audioOutputDir, audioFilename);
      await extractAudioForWhisper(filePath, audioPath);
    }

    // Call OpenAI Whisper API with word timestamps enabled
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(audioPath),
      model: "whisper-1",
      response_format: "verbose_json",
      timestamp_granularities: ["word", "segment"],
    });

    return NextResponse.json({
      success: true,
      text: transcription.text,
      words: (transcription as any).words || [],
      segments: (transcription as any).segments || [],
      duration: transcription.duration,
      audioPath,
    });
  } catch (err: any) {
    console.error("Transcription error:", err);
    return NextResponse.json(
      { error: err?.message || "Audio transcription failed" },
      { status: 500 }
    );
  }
}
