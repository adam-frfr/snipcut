import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const rateLimitMap = new Map<string, RateLimitRecord>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute window
const MAX_REQUESTS_PER_WINDOW = 60; // 60 requests per minute per IP

/**
 * Determines client IP safely behind Render's reverse proxy:
 * - Checks `Render-Proxy-Client-IP` first (Render's trusted client IP header)
 * - Checks `CF-Connecting-IP` (if Cloudflare proxy is in front)
 * - For `X-Forwarded-For`, uses the rightmost trusted proxy hop rather than
 *   the leftmost entry (which can be arbitrarily spoofed by a client sending `X-Forwarded-For: evil-ip`).
 */
function getClientIp(req: NextRequest): string {
  const renderIp = req.headers.get("render-proxy-client-ip");
  if (renderIp) {
    return renderIp.trim();
  }

  const cfIp = req.headers.get("cf-connecting-ip");
  if (cfIp) {
    return cfIp.trim();
  }

  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const ips = forwarded.split(",").map((s) => s.trim()).filter(Boolean);
    // Rightmost hop is appended by the immediate trusted reverse proxy
    if (ips.length > 0) {
      return ips[ips.length - 1];
    }
  }

  return req.headers.get("x-real-ip") || "127.0.0.1";
}

/**
 * Constant-time string comparison using SHA-256 digests and crypto.timingSafeEqual
 * to eliminate timing-attack vulnerabilities.
 */
function constantTimeTokenCompare(provided: string, expected: string): boolean {
  if (!provided || !expected) return false;
  const hashA = crypto.createHash("sha256").update(provided).digest();
  const hashB = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(hashA, hashB);
}

/**
 * Validates APP_ACCESS_TOKEN shared secret and enforces per-IP sliding rate limit.
 * Rules:
 * 1. Constant-time token comparison.
 * 2. In production (NODE_ENV=production), if APP_ACCESS_TOKEN is unset, FAILS CLOSED (401).
 * 3. Supports Bearer token, x-app-access-token header, or app_access_token cookie.
 * 4. Rate limit: > 60 req/min per IP returns 429.
 */
export function verifyAuthAndRateLimit(req: NextRequest): NextResponse | null {
  const clientIp = getClientIp(req);

  // 1. Per-IP Sliding Rate Limit
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
      { error: "Too many requests. Rate limit is 60 requests per minute." },
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

  // Fail closed in production if token is unset
  if (!requiredToken) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json(
        { error: "Unauthorized: APP_ACCESS_TOKEN must be configured on the server in production mode" },
        { status: 401 }
      );
    }
    // In local development without APP_ACCESS_TOKEN, permit open access
    return null;
  }

  const authHeader = req.headers.get("authorization") || "";
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  const customHeader = req.headers.get("x-app-access-token") || "";
  const cookieToken = req.cookies.get("app_access_token")?.value || "";

  const providedToken = (bearerMatch ? bearerMatch[1] : authHeader) || customHeader || cookieToken;

  if (!providedToken || !constantTimeTokenCompare(providedToken.trim(), requiredToken)) {
    return NextResponse.json(
      { error: "Unauthorized: Invalid or missing access token" },
      { status: 401 }
    );
  }

  return null;
}
