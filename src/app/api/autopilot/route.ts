import { NextRequest, NextResponse } from "next/server";
import { verifyAuthAndRateLimit } from "@/lib/authRateLimit";
import { loadState, normalizeSettings, updateState, addLog } from "@/lib/autopilot/store";
import { youtubeApiKey } from "@/lib/autopilot/trendHunter";
import { oauthConfigured, youtubeConnection } from "@/lib/autopilot/youtube";
import { redirectUriFor } from "@/lib/autopilot/urls";

/** GET -> Autopilot state for the page.  PUT { settings } -> saved settings. */
export async function GET(req: NextRequest) {
  const authError = verifyAuthAndRateLimit(req);
  if (authError) return authError;
  const st = loadState();
  return NextResponse.json({
    settings: st.settings,
    items: st.items.slice(-60).reverse(),
    posts: st.posts.slice(-120).reverse(),
    log: st.log.slice(-80).reverse(),
    paused: st.paused || null,
    lastHuntAt: st.lastHuntAt || null,
    youtube: youtubeConnection(),
    setup: {
      youtubeApiKey: Boolean(youtubeApiKey()),
      googleOauth: oauthConfigured(),
      redirectUri: redirectUriFor(req),
      groq: Boolean((process.env.GROQ_API_KEY || "").trim()),
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
  });
}

export async function PUT(req: NextRequest) {
  const authError = verifyAuthAndRateLimit(req);
  if (authError) return authError;
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  const st = updateState((s) => {
    const wasEnabled = s.settings.enabled;
    s.settings = normalizeSettings(body?.settings || {}, s.settings);
    if (s.settings.enabled !== wasEnabled) addLog(s, "info", s.settings.enabled ? "Autopilot turned on." : "Autopilot turned off.");
  });
  return NextResponse.json({ settings: st.settings });
}
