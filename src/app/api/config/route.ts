import { NextResponse } from "next/server";

export async function GET() {
  const hasGroq = Boolean(process.env.GROQ_API_KEY);
  const hasOpenai = Boolean(process.env.OPENAI_API_KEY);
  const hasClaude = Boolean(process.env.ANTHROPIC_API_KEY || process.env.HACKCLUB_API_KEY);

  return NextResponse.json({
    hasKey: hasGroq || hasOpenai || hasClaude,
    hasGroqKey: hasGroq,
    hasOpenaiKey: hasOpenai,
    hasClaudeKey: hasClaude,
    preferredModel: "~anthropic/claude-sonnet-latest",
  });
}
