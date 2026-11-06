import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { Readable } from "stream";
import { verifyAuthAndRateLimit } from "@/lib/authRateLimit";
import { CLIP_DIR } from "@/lib/autopilot/store";

/** GET ?file=p_xxx.mp4|.jpg -> an Autopilot clip or poster (needs the access key; supports Range). */
export async function GET(req: NextRequest) {
  const authError = verifyAuthAndRateLimit(req);
  if (authError) return authError;
  const name = req.nextUrl.searchParams.get("file") || "";
  if (!/^p_[a-f0-9]{12}\.(mp4|jpg)$/.test(name)) return new NextResponse("Bad file", { status: 400 });
  const file = path.join(CLIP_DIR(), name);
  if (!fs.existsSync(file)) return new NextResponse("Not found", { status: 404 });
  const size = fs.statSync(file).size;
  const type = name.endsWith(".jpg") ? "image/jpeg" : "video/mp4";
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get("range") || "");
  const headers: Record<string, string> = { "Content-Type": type, "Accept-Ranges": "bytes", "Cache-Control": "private, max-age=3600" };
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    let end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (!(start <= end) || start >= size) {
      return new NextResponse("Range not satisfiable", { status: 416, headers: { "Content-Range": `bytes */${size}` } });
    }
    start = Math.max(0, start);
    end = Math.max(start, end);
    const stream = Readable.toWeb(fs.createReadStream(file, { start, end })) as unknown as ReadableStream;
    return new NextResponse(stream, {
      status: 206,
      headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${size}`, "Content-Length": String(end - start + 1) },
    });
  }
  const stream = Readable.toWeb(fs.createReadStream(file)) as unknown as ReadableStream;
  return new NextResponse(stream, { status: 200, headers: { ...headers, "Content-Length": String(size) } });
}
