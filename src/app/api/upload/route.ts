import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { verifyAuthAndRateLimit } from "@/lib/authRateLimit";

import { Readable, Transform } from "stream";
import { pipeline } from "stream/promises";
import type { ReadableStream as NodeReadableStream } from "stream/web";

const MAX_UPLOAD_BYTES = 2_300_000_000;

export async function POST(req: NextRequest) {
  const authError = verifyAuthAndRateLimit(req);
  if (authError) return authError;

  const uploadStartTime = Date.now();
  try {
    // The body is the raw file bytes (Content-Type: application/octet-stream),
    // streamed straight to disk. Buffering a multipart body in memory let a
    // single 2 GB upload exhaust the server's RAM (512 MB on Render free).
    const declaredLen = Number(req.headers.get("content-length") || 0);
    if (declaredLen > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: "That file is over the 2 GB upload limit. Trim it or compress it and try again." },
        { status: 413 }
      );
    }
    if ((req.headers.get("content-type") || "").includes("multipart/form-data")) {
      return NextResponse.json(
        { error: "Send the file as the raw request body (application/octet-stream) with an x-file-name header." },
        { status: 415 }
      );
    }
    if (!req.body) {
      return NextResponse.json({ error: "No video file provided" }, { status: 400 });
    }

    let fileName = "upload.mp4";
    try {
      fileName = decodeURIComponent(req.headers.get("x-file-name") || "") || fileName;
    } catch {}

    const uploadsDir = path.join(process.cwd(), "public", "uploads");
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    // Sanitize the stored filename strictly
    const rawExt = path.extname(fileName).toLowerCase();
    const safeExt = /^\.[a-z0-9]{1,8}$/.test(rawExt) ? rawExt : ".mp4";
    const rawBase = path.basename(fileName, rawExt);
    const safeBaseName = rawBase.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60) || "upload";
    const timestamp = Date.now();
    const baseName = `${timestamp}-${safeBaseName}`;

    const rawPath = path.join(uploadsDir, `raw-${baseName}${safeExt}`);

    // Stream to disk, enforcing the size cap even when Content-Length lies.
    let bytesWritten = 0;
    const limiter = new Transform({
      transform(chunk, _enc, cb) {
        bytesWritten += chunk.length;
        if (bytesWritten > MAX_UPLOAD_BYTES) cb(new Error("UPLOAD_TOO_LARGE"));
        else cb(null, chunk);
      },
    });
    try {
      await pipeline(
        Readable.fromWeb(req.body as unknown as NodeReadableStream),
        limiter,
        fs.createWriteStream(rawPath)
      );
    } catch (streamErr) {
      try { fs.unlinkSync(rawPath); } catch {}
      if (streamErr instanceof Error && streamErr.message === "UPLOAD_TOO_LARGE") {
        return NextResponse.json(
          { error: "That file is over the 2 GB upload limit. Trim it or compress it and try again." },
          { status: 413 }
        );
      }
      throw streamErr;
    }
    if (bytesWritten === 0) {
      try { fs.unlinkSync(rawPath); } catch {}
      return NextResponse.json({ error: "No video file provided" }, { status: 400 });
    }

    console.log(
      `[Stage: Upload] Received "${fileName}" (${(bytesWritten / (1024 * 1024)).toFixed(2)} MB) written to ${rawPath}`
    );

    // No conversion here: probing + HEVC/HDR transcoding a long phone video
    // can take many minutes (it used to be killed after 180s), and a reverse
    // proxy would cut this request off first. The job created from this
    // fileId converts it in the background worker.
    const safeRelativeRaw = `uploads/${path.basename(rawPath)}`;
    return NextResponse.json({
      success: true,
      fileId: safeRelativeRaw,
      fileUrl: `/api/media?file=${encodeURIComponent(safeRelativeRaw)}`,
      fileName,
      sizeBytes: bytesWritten,
      timingMs: Date.now() - uploadStartTime,
    });
  } catch (err: any) {
    console.error("Upload error:", err);
    return NextResponse.json({ error: err?.message || "File upload failed" }, { status: 500 });
  }
}
