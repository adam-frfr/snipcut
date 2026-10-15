import { NextRequest, NextResponse } from "next/server";
import { getOpenAIClient } from "@/lib/aiService";
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

    // Call OpenAI Whisper API with word timestamps enabled
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(filePath),
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
    });
  } catch (err: any) {
    console.error("Transcription error:", err);
    return NextResponse.json(
      { error: err?.message || "Audio transcription failed" },
      { status: 500 }
    );
  }
}
