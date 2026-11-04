import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { execFile } from "child_process";
import util from "util";
import { getFfmpegBinary, probeVideoFormat, checkZscaleSupported } from "@/lib/videoService";
import { verifyAuthAndRateLimit } from "@/lib/authRateLimit";

import { Readable, Transform } from "stream";
import { pipeline } from "stream/promises";
import type { ReadableStream as NodeReadableStream } from "stream/web";

const execFilePromise = util.promisify(execFile);
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

    const webMp4Filename = `${baseName}.mp4`;
    const webMp4Path = path.join(uploadsDir, webMp4Filename);

    const ffmpegBin = getFfmpegBinary();

    // Probe the file stream: Remux only if ffprobe says H.264, 8-bit, yuv420p, not HDR. Anything else: transcode.
    const probeStartTime = Date.now();
    const streamInfo = await probeVideoFormat(rawPath);
    console.log(
      `[Stage: Upload Probe] ffprobe result in ${Date.now() - probeStartTime}ms: codec=${streamInfo.codecName}, pix_fmt=${streamInfo.pixFmt}, bits=${streamInfo.bitsPerRawSample || "8"}, transfer=${streamInfo.colorTransfer || "unknown"}, isHdr=${streamInfo.isHdr}, isVfr=${streamInfo.isVfr}, isH264Yuv420p8Bit=${streamInfo.isH264Yuv420p8Bit}`
    );

    try {
      // Determine filters for transcode path: CFR + HDR tone mapping if HDR detected
      let vfFilter = "scale='min(1920,iw)':-2";
      if (streamInfo.isHdr) {
        const zscaleAvailable = checkZscaleSupported();
        if (zscaleAvailable) {
          console.log(
            `[Stage: Upload Media Prep] HDR detected (transfer=${streamInfo.colorTransfer}). Applying zscale tone-mapping to SDR...`
          );
          vfFilter = "scale='min(1920,iw)':-2,zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p";
        } else {
          console.warn(
            `[Stage: Upload Media Prep] HDR detected (transfer=${streamInfo.colorTransfer}), but zscale is unavailable in ffmpeg. Using standard SDR conversion.`
          );
          vfFilter = "scale='min(1920,iw)':-2";
        }
      }

      // Safe argument arrays for execFile
      const transcodeArgs = [
        "-y",
        "-i", rawPath,
        "-c:v", "libx264",
        "-preset", "veryfast",
        "-crf", "23",
        "-fps_mode", "cfr",
        "-r", "30",
        "-vf", vfFilter,
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "128k",
        "-movflags", "+faststart",
        webMp4Path,
      ];

      const remuxArgs = [
        "-y",
        "-i", rawPath,
        "-c", "copy",
        "-movflags", "+faststart",
        webMp4Path,
      ];

      if (streamInfo.isH264Yuv420p8Bit && !streamInfo.isHdr) {
        console.log(
          `[Stage: Upload Media Prep] Video is already H.264 8-bit yuv420p SDR. Attempting copy remux with -c copy -movflags +faststart...`
        );
        try {
          const prepStartTime = Date.now();
          await execFilePromise(ffmpegBin, remuxArgs, { timeout: 180000 });
          console.log(
            `[Stage: Upload Media Prep] Copy remux succeeded in ${Date.now() - prepStartTime}ms -> ${webMp4Path}`
          );
        } catch (remuxErr: any) {
          console.warn(
            `[Stage: Upload Media Prep] Copy remux failed (${remuxErr.message}). Falling back to full transcode...`
          );
          const transcodeStartTime = Date.now();
          await execFilePromise(ffmpegBin, transcodeArgs, { timeout: 180000 });
          console.log(
            `[Stage: Upload Media Prep] Transcode fallback completed in ${Date.now() - transcodeStartTime}ms -> ${webMp4Path}`
          );
        }
      } else {
        console.log(
          `[Stage: Upload Media Prep] Video is ${streamInfo.codecName} (${streamInfo.pixFmt}, transfer=${streamInfo.colorTransfer || "standard"}). Transcoding to CFR 30fps H.264 8-bit yuv420p SDR...`
        );
        const prepStartTime = Date.now();
        try {
          await execFilePromise(ffmpegBin, transcodeArgs, { timeout: 180000 });
        } catch (transcodeErr: any) {
          if (streamInfo.isHdr && vfFilter.includes("zscale")) {
            console.warn(
              `[Stage: Upload Media Prep] Tone-mapping filter failed (${transcodeErr.message}). Retrying with plain conversion...`
            );
            const fallbackArgs = [...transcodeArgs];
            const vfIdx = fallbackArgs.indexOf("-vf");
            if (vfIdx !== -1) {
              fallbackArgs[vfIdx + 1] = "scale='min(1920,iw)':-2";
            }
            await execFilePromise(ffmpegBin, fallbackArgs, { timeout: 180000 });
          } else {
            throw transcodeErr;
          }
        }
        console.log(
          `[Stage: Upload Media Prep] Transcode completed in ${Date.now() - prepStartTime}ms -> ${webMp4Path}`
        );
      }

      // Clean up raw temp file
      if (fs.existsSync(rawPath) && fs.existsSync(webMp4Path)) {
        try {
          fs.unlinkSync(rawPath);
        } catch (e) {}
      }

      const totalElapsed = Date.now() - uploadStartTime;
      const safeRelative = `uploads/${webMp4Filename}`;
      const cleanFileName = fileName.toLowerCase().endsWith(".mp4") ? fileName : `${fileName}.mp4`;

      return NextResponse.json({
        success: true,
        fileId: safeRelative,
        fileUrl: `/api/media?file=${encodeURIComponent(safeRelative)}`,
        fileName: cleanFileName,
        sizeBytes: fs.statSync(/*turbopackIgnore: true*/ webMp4Path).size,
        streamInfo,
        timingMs: totalElapsed,
      });
    } catch (ffmpegErr) {
      console.warn("Media prep fallback to raw file:", ffmpegErr);
      const safeRelativeRaw = `uploads/${path.basename(rawPath)}`;
      return NextResponse.json({
        success: true,
        fileId: safeRelativeRaw,
        fileUrl: `/api/media?file=${encodeURIComponent(safeRelativeRaw)}`,
        fileName: fileName,
        sizeBytes: bytesWritten,
        streamInfo,
        timingMs: Date.now() - uploadStartTime,
      });
    }
  } catch (err: any) {
    console.error("Upload error:", err);
    return NextResponse.json({ error: err?.message || "File upload failed" }, { status: 500 });
  }
}
