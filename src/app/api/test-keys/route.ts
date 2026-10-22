import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { getOpenAIClient, isHackClubKey } from "@/lib/aiService";
import { verifyAuthAndRateLimit } from "@/lib/authRateLimit";

export async function POST(req: NextRequest) {
  const authError = verifyAuthAndRateLimit(req);
  if (authError) return authError;
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
    const { openaiKey, claudeKey, groqKey } = body;
    const errMsg = (err: unknown, fallback: string) =>
      err instanceof Error ? err.message : fallback;

    const results: {
      openai?: { valid: boolean; message: string };
      claude?: { valid: boolean; message: string };
      groq?: { valid: boolean; message: string };
    } = {};

    const activeOpenai = (openaiKey || "").trim();
    const activeClaude = (claudeKey || "").trim();
    const activeGroq = (groqKey || process.env.GROQ_API_KEY || "").trim();

    if (!activeOpenai && !activeClaude && !activeGroq) {
      return NextResponse.json({ error: "No API key provided" }, { status: 400 });
    }

    // Hack Club proxy key (can arrive in either field) covers OpenAI + Claude
    const hackclubKey = [activeOpenai, activeClaude].find((k) => k && isHackClubKey(k));
    if (hackclubKey) {
      try {
        const client = getOpenAIClient(hackclubKey);
        await client.chat.completions.create({
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
      } catch (err) {
        results.claude = { valid: false, message: errMsg(err, "Hack Club proxy error") };
      }
    } else {
      if (activeOpenai) {
        try {
          const client = getOpenAIClient(activeOpenai);
          await client.models.list();
          results.openai = { valid: true, message: "OpenAI API Key verified successfully!" };
        } catch (err) {
          results.openai = { valid: false, message: errMsg(err, "Invalid OpenAI Key") };
        }
      }

      if (activeClaude) {
        try {
          const anthropic = new Anthropic({ apiKey: activeClaude });
          await anthropic.messages.create({
            model: "claude-3-5-haiku-20241022",
            max_tokens: 1,
            messages: [{ role: "user", content: "Ping" }],
          });
          results.claude = { valid: true, message: "Anthropic Claude API Key verified successfully!" };
        } catch (err) {
          results.claude = { valid: false, message: errMsg(err, "Invalid Anthropic Key") };
        }
      }
    }

    if (activeGroq) {
      try {
        const groq = new OpenAI({
          apiKey: activeGroq,
          baseURL: "https://api.groq.com/openai/v1",
        });
        await groq.models.list();
        results.groq = { valid: true, message: "Groq API Key verified! Whisper transcription + Llama curation are active." };
      } catch (err) {
        results.groq = { valid: false, message: errMsg(err, "Invalid Groq Key") };
      }
    }

    return NextResponse.json({ success: true, results });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Verification failed" }, { status: 500 });
  }
}
