import { NextRequest, NextResponse } from "next/server";
import { analyzeTranscriptForViralClips } from "@/lib/aiService";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { transcriptText, customPrompt, model, openaiKey, claudeKey } = body;

    if (!transcriptText) {
      return NextResponse.json(
        { error: "Transcript text is required for AI clip analysis" },
        { status: 400 }
      );
    }

    const clips = await analyzeTranscriptForViralClips({
      transcriptText,
      customPrompt,
      model,
      openaiKey,
      claudeKey,
    });

    return NextResponse.json({ success: true, clips });
  } catch (error: any) {
    console.error("AI Analysis Error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to analyze transcript" },
      { status: 500 }
    );
  }
}
