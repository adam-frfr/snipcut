import type { NextRequest } from "next/server";

/** Public origin of the site (PUBLIC_BASE_URL, else the request's host behind the proxy). */
export function publicOrigin(req: NextRequest): string {
  const env = (process.env.PUBLIC_BASE_URL || "").trim().replace(/\/+$/, "");
  if (env) return env;
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || req.nextUrl.host;
  const proto = (req.headers.get("x-forwarded-proto") || req.nextUrl.protocol.replace(":", "") || "https").split(",")[0].trim();
  return `${proto}://${host}`;
}

export const redirectUriFor = (req: NextRequest) => `${publicOrigin(req)}/api/autopilot/youtube/callback`;
