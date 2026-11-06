import { NextRequest, NextResponse } from "next/server";
import { verifyAuthAndRateLimit } from "@/lib/authRateLimit";
import { finishAuth } from "@/lib/autopilot/youtube";
import { publicOrigin } from "@/lib/autopilot/urls";
import { updateState, addLog } from "@/lib/autopilot/store";

/** Google sends the browser back here after the consent screen. */
export async function GET(req: NextRequest) {
  const authError = verifyAuthAndRateLimit(req);
  if (authError) return authError;
  const back = (msg: string) => NextResponse.redirect(`${publicOrigin(req)}/autopilot?yt=${encodeURIComponent(msg)}`);
  const err = req.nextUrl.searchParams.get("error");
  if (err) return back(err === "access_denied" ? "You cancelled the Google sign-in." : `Google said: ${err}`);
  const code = req.nextUrl.searchParams.get("code") || "";
  const state = req.nextUrl.searchParams.get("state") || "";
  if (!code) return back("Google didn't send a sign-in code. Try again.");
  try {
    const { channelTitle } = await finishAuth(code, state);
    updateState((s) => {
      addLog(s, "info", `YouTube connected${channelTitle ? `: ${channelTitle}` : ""}.`);
      s.uploadFailStreak = 0;
    });
    return back("ok");
  } catch (e: any) {
    return back(String(e?.message || e));
  }
}
