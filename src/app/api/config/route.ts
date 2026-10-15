import { NextResponse } from "next/server";

export async function GET() {
  const serverKey = process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || "";
  return NextResponse.json({
    hasKey: Boolean(serverKey),
    apiKey: serverKey,
    preferredModel: "~anthropic/claude-sonnet-latest",
  });
}
