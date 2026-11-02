import { NextRequest, NextResponse } from "next/server";
import { verifyAuthAndRateLimit } from "@/lib/authRateLimit";

/**
 * Passcode verification probe. The access token used to be accepted by
 * the UI on faith — the prompt stored whatever was typed without ever
 * asking the server — so any junk "password" appeared to log you in
 * (the page and local clips load without the API). Now the prompt and
 * the settings modal call this first: it runs the same strict check
 * every other API route uses (constant-time compare against the
 * server-only APP_ACCESS_TOKEN env var, fails closed in production)
 * and returns 200 only for the real passcode.
 */
export async function GET(req: NextRequest) {
  const authError = verifyAuthAndRateLimit(req);
  if (authError) return authError;
  return NextResponse.json({ ok: true });
}
