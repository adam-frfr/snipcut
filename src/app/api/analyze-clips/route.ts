import { NextRequest, NextResponse } from "next/server";
import { analyzeTranscriptForViralClips } from "@/lib/aiService";
import { snapAndValidateClips } from "@/lib/wordSnapping";
import fs from "fs";
import path from "path";

export async function POST(req: NextRequest) {
  const analysisStartTime = Date.now();
  try {
    const body = await req.json();
    const { transcriptText, words, duration, customPrompt, model, openaiKey, claudeKey } = body;

    if (!transcriptText) {
      return NextResponse.json(
        { error: "Transcript text is required for AI clip analysis" },
        { status: 400 }
      );
    }

    console.log(
      `[Stage: AI Clip Curation] Starting clip curation with model: ${model || "default"} on transcript length ${transcriptText.length} chars...`
    );

    // 1. LLM Viral Curation
    const llmStartTime = Date.now();
    const rawClips = await analyzeTranscriptForViralClips({
      transcriptText,
      words,
      customPrompt,
      model,
      openaiKey,
      claudeKey,
    });
    const llmElapsed = Date.now() - llmStartTime;
    console.log(
      `[Stage: AI Clip Curation] LLM extracted ${rawClips.length} candidate clips in ${llmElapsed}ms`
    );

    // 2. Word-Boundary Snapping & Constraints Validation
    const snapStartTime = Date.now();
    const snappedClips = snapAndValidateClips(rawClips, words || [], {
      totalDuration: duration,
      minDuration: 5.0,
      maxDuration: 90.0,
      allowOverlap: false,
    });
    const snapElapsed = Date.now() - snapStartTime;
    console.log(
      `[Stage: AI Clip Curation] Word boundary snapping and validation finished in ${snapElapsed}ms. Final clips: ${snappedClips.length}`
    );

    // 3. Save Intermediate Clips JSON
    const debugDir = path.join(process.cwd(), "public", "uploads", "debug");
    if (!fs.existsSync(debugDir)) {
      fs.mkdirSync(debugDir, { recursive: true });
    }

    const debugFile = path.join(debugDir, `clips-${Date.now()}.json`);
    fs.writeFileSync(
      debugFile,
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          model: model || "claude-sonnet-latest",
          customPrompt: customPrompt || "",
          transcriptSnippet: transcriptText.slice(0, 500) + (transcriptText.length > 500 ? "..." : ""),
          timing: {
            llmMs: llmElapsed,
            snapMs: snapElapsed,
            totalMs: Date.now() - analysisStartTime,
          },
          rawClipsCount: rawClips.length,
          snappedClipsCount: snappedClips.length,
          rawClips,
          snappedClips,
        },
        null,
        2
      ),
      "utf-8"
    );

    console.log(`[Stage: AI Clip Curation] Saved intermediate clips JSON to: ${debugFile}`);

    return NextResponse.json({
      success: true,
      clips: snappedClips,
      debugFile: `/api/media?file=uploads/debug/${path.basename(debugFile)}`,
      timingMs: Date.now() - analysisStartTime,
    });
  } catch (error: any) {
    console.error("[Stage: AI Clip Curation] Analysis error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to analyze transcript" },
      { status: 500 }
    );
  }
}
