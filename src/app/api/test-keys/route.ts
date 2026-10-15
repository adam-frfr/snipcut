import { NextRequest, NextResponse } from "next/server";
import { getOpenAIClient, getAnthropicClient } from "@/lib/aiService";

export async function POST(req: NextRequest) {
  try {
    const { openaiKey, claudeKey } = await req.json();

    const results: {
      openai?: { valid: boolean; message: string };
      claude?: { valid: boolean; message: string };
    } = {};

    // Test OpenAI Key if provided
    if (openaiKey) {
      try {
        const openai = getOpenAIClient(openaiKey);
        await openai.models.list();
        results.openai = { valid: true, message: "OpenAI API Key verified successfully! (Whisper & GPT-4o-mini ready)" };
      } catch (err: any) {
        results.openai = { valid: false, message: err?.message || "Invalid OpenAI API Key" };
      }
    }

    // Test Claude Key if provided
    if (claudeKey) {
      try {
        const anthropic = getAnthropicClient(claudeKey);
        await anthropic.messages.create({
          model: "claude-3-5-haiku-20241022",
          max_tokens: 10,
          messages: [{ role: "user", content: "Ping" }],
        });
        results.claude = { valid: true, message: "Claude API Key verified successfully! (Haiku & Sonnet ready)" };
      } catch (err: any) {
        results.claude = { valid: false, message: err?.message || "Invalid Claude API Key" };
      }
    }

    return NextResponse.json({ success: true, results });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Verification failed" }, { status: 500 });
  }
}
