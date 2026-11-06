import { NextRequest, NextResponse } from "next/server";
import { verifyAuthAndRateLimit } from "@/lib/authRateLimit";
import { authUrl, oauthConfigured } from "@/lib/autopilot/youtube";
import { publicOrigin, redirectUriFor } from "@/lib/autopilot/urls";

/** Opens Google's consent screen for the YouTube channel. */
export async function GET(req: NextRequest) {
  const authError = verifyAuthAndRateLimit(req);
  if (authError) return authError;
  if (!oauthConfigured()) {
    return NextResponse.redirect(`${publicOrigin(req)}/autopilot?yt=${encodeURIComponent("Google sign-in isn't set up on the server yet (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET).")}`);
  }
  return NextResponse.redirect(authUrl(redirectUriFor(req)));
}
