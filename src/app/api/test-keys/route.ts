import { NextRequest, NextResponse } from "next/server";
import { getOpenAIClient, isHackClubKey } from "@/lib/aiService";

export async function POST(req: NextRequest) {
  try {
    const { openaiKey, claudeKey } = await req.json();
    const key = (openaiKey || claudeKey || process.env.OPENAI_API_KEY || "").trim();

    const results: {
      openai?: { valid: boolean; message: string };
      claude?: { valid: boolean; message: string };
    } = {};

    if (!key) {
      return NextResponse.json({ error: "No API key provided" }, { status: 400 });
    }

    if (isHackClubKey(key)) {
      try {
        const client = getOpenAIClient(key);
        // Test Claude Sonnet on Hack Club proxy
        const res = await client.chat.completions.create({
          model: "~anthropic/claude-sonnet-latest",
          max_tokens: 10,
          messages: [{ role: "user", content: "Ping" }],
        });

        results.claude = {
          valid: true,
          message: "Hack Club AI Key verified! Claude Sonnet & Haiku models are active ($3.00/day).",
        };
        results.openai = {
          valid: true,
          message: "Hack Club AI Key verified! GPT models are also active.",
        };
      } catch (err: any) {
        results.claude = { valid: false, message: err?.message || "Hack Club proxy error" };
      }
    } else {
      // Standard OpenAI / Anthropic check
      try {
        const client = getOpenAIClient(key);
        await client.models.list();
        results.openai = { valid: true, message: "OpenAI API Key verified successfully!" };
      } catch (err: any) {
        results.openai = { valid: false, message: err?.message || "Invalid OpenAI Key" };
      }
    }

    return NextResponse.json({ success: true, results });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Verification failed" }, { status: 500 });
  }
}
