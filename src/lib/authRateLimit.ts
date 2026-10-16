import { NextRequest, NextResponse } from "next/server";

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const rateLimitMap = new Map<string, RateLimitRecord>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute window
const MAX_REQUESTS_PER_WINDOW = 60; // 60 requests per minute per IP

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0].trim();
  }
  return req.headers.get("x-real-ip") || "127.0.0.1";
}

/**
 * Validates APP_ACCESS_TOKEN shared secret (if configured in env)
 * and enforces a basic per-IP sliding rate limit.
 * Returns null if allowed, or a NextResponse (401 or 429) if blocked.
 */
export function verifyAuthAndRateLimit(req: NextRequest): NextResponse | null {
  const clientIp = getClientIp(req);

  // 1. Per-IP Rate Limit
  const now = Date.now();
  let record = rateLimitMap.get(clientIp);
  if (!record || now > record.resetAt) {
    record = { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS };
    rateLimitMap.set(clientIp, record);
  } else {
    record.count++;
  }

  // Periodic cleanup
  if (rateLimitMap.size > 5000) {
    for (const [ip, rec] of rateLimitMap.entries()) {
      if (now > rec.resetAt) {
        rateLimitMap.delete(ip);
      }
    }
  }

  if (record.count > MAX_REQUESTS_PER_WINDOW) {
    const retryAfter = Math.ceil((record.resetAt - now) / 1000);
    return NextResponse.json(
      { error: "Too many requests. Please wait before making more requests." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.max(1, retryAfter)),
        },
      }
    );
  }

  // 2. Shared-Secret Access Gate (APP_ACCESS_TOKEN)
  const requiredToken = (process.env.APP_ACCESS_TOKEN || "").trim();
  if (requiredToken) {
    const authHeader = req.headers.get("authorization") || "";
    const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
    const customHeader = req.headers.get("x-app-access-token") || "";
    const cookieToken = req.cookies.get("app_access_token")?.value || "";

    const providedToken = (bearerMatch ? bearerMatch[1] : authHeader) || customHeader || cookieToken;

    if (!providedToken || providedToken.trim() !== requiredToken) {
      return NextResponse.json(
        { error: "Unauthorized: Invalid or missing access token" },
        { status: 401 }
      );
    }
  }

  return null;
}
