import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  // Reading from request ensures dynamic execution per request
  const _clientIp = req.headers.get("x-forwarded-for");
  const hasGroq = Boolean(process.env.GROQ_API_KEY);
  const hasOpenai = Boolean(process.env.OPENAI_API_KEY);
  const hasClaude = Boolean(process.env.ANTHROPIC_API_KEY || process.env.HACKCLUB_API_KEY);

  return NextResponse.json({
    requiresAuth: Boolean(process.env.APP_ACCESS_TOKEN),
    hasKey: hasGroq || hasOpenai || hasClaude,
    hasGroqKey: hasGroq,
    hasOpenaiKey: hasOpenai,
    hasClaudeKey: hasClaude,
    // The server itself can source B-roll (stock key or AI images);
    // otherwise each user brings a Pexels / Pixabay / OpenAI key.
    hasBrollSource: Boolean(
      process.env.PEXELS_API_KEY || process.env.PIXABAY_API_KEY || hasOpenai || process.env.BROLL_ALLOW_WIKIMEDIA === "1"
    ),
    preferredModel: "~anthropic/claude-sonnet-latest",
  });
}
