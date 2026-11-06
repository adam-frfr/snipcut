import { NextRequest, NextResponse } from "next/server";
import { verifyAccessToken } from "./lib/authRateLimit";

/**
 * Uploads and rendered clips live under public/, which Next serves as
 * plain static files: anyone with a file name could download a user's
 * video without the access key (seen live). The app itself only reads
 * media through /api/media, so these paths are closed to everyone
 * without the key. Pages and the rest of the UI stay open.
 */
const PRIVATE_PREFIXES = ["/uploads", "/rendered_clips", "/downloads"];

export function proxy(req: NextRequest) {
  const p = req.nextUrl.pathname;
  if (!PRIVATE_PREFIXES.some((pre) => p === pre || p.startsWith(pre + "/"))) return NextResponse.next();
  const denied = verifyAccessToken(req);
  if (denied) return new NextResponse("Not found", { status: 404 });
  return NextResponse.next();
}

export const config = {
  matcher: ["/uploads/:path*", "/rendered_clips/:path*", "/downloads/:path*"],
};
