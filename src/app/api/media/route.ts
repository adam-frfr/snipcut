import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const fileParam = searchParams.get("file");

    if (!fileParam) {
      return new NextResponse("File parameter is required", { status: 400 });
    }

    // Resolve file path safely
    let targetPath = fileParam;
    if (!path.isAbsolute(targetPath)) {
      const cleanRelative = targetPath.replace(/^\/+/, "");
      targetPath = path.join(process.cwd(), "public", cleanRelative);
    }

    const resolved = path.resolve(targetPath);
    const allowedRoot = path.resolve(process.cwd(), "public");
    const allowedRootWithSep = allowedRoot.endsWith(path.sep) ? allowedRoot : allowedRoot + path.sep;

    // Strict path traversal defense: Target must be strictly inside public/
    if (resolved !== allowedRoot && !resolved.startsWith(allowedRootWithSep)) {
      return new NextResponse("Access denied: path traversal forbidden", { status: 403 });
    }

    if (!fs.existsSync(resolved)) {
      return new NextResponse("Video file not found", { status: 404 });
    }

    const stat = fs.statSync(resolved);
    const fileSize = stat.size;
    const rangeHeader = req.headers.get("range");

    // Determine MIME type
    const ext = path.extname(resolved).toLowerCase();
    let contentType = "video/mp4";
    if (ext === ".webm") contentType = "video/webm";
    else if (ext === ".mov") contentType = "video/quicktime";
    else if (ext === ".m4v") contentType = "video/x-m4v";
    else if (ext === ".ogg") contentType = "video/ogg";
    else if (ext === ".mp3") contentType = "audio/mpeg";

    if (rangeHeader && rangeHeader.startsWith("bytes=")) {
      const rawRange = rangeHeader.replace("bytes=", "").trim();
      let start: number;
      let end: number;

      if (rawRange.startsWith("-")) {
        // Suffix range: bytes=-500 (request last 500 bytes)
        const suffixLength = parseInt(rawRange.slice(1), 10);
        if (isNaN(suffixLength) || suffixLength <= 0) {
          return new NextResponse("Invalid range format", {
            status: 416,
            headers: { "Content-Range": `bytes */${fileSize}` },
          });
        }
        start = Math.max(0, fileSize - suffixLength);
        end = fileSize - 1;
      } else if (rawRange.endsWith("-")) {
        // Prefix range: bytes=1000- (from 1000 to end)
        start = parseInt(rawRange.slice(0, -1), 10);
        end = fileSize - 1;
      } else {
        // Explicit range: bytes=0-1000
        const parts = rawRange.split("-");
        start = parseInt(parts[0], 10);
        end = parseInt(parts[1], 10);
      }

      // Validate range boundaries
      if (
        isNaN(start) ||
        isNaN(end) ||
        start < 0 ||
        start > end ||
        start >= fileSize
      ) {
        return new NextResponse("Requested range not satisfiable", {
          status: 416,
          headers: {
            "Content-Range": `bytes */${fileSize}`,
          },
        });
      }

      // Clamp end to file boundaries
      end = Math.min(end, fileSize - 1);
      const chunkSize = end - start + 1;
      const fileStream = fs.createReadStream(resolved, { start, end });

      const stream = new ReadableStream({
        start(controller) {
          fileStream.on("data", (chunk) => controller.enqueue(chunk));
          fileStream.on("end", () => controller.close());
          fileStream.on("error", (err) => controller.error(err));
        },
      });

      return new NextResponse(stream, {
        status: 206,
        headers: {
          "Content-Range": `bytes ${start}-${end}/${fileSize}`,
          "Accept-Ranges": "bytes",
          "Content-Length": chunkSize.toString(),
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=3600",
        },
      });
    } else {
      // Full file stream
      const fileStream = fs.createReadStream(resolved);
      const stream = new ReadableStream({
        start(controller) {
          fileStream.on("data", (chunk) => controller.enqueue(chunk));
          fileStream.on("end", () => controller.close());
          fileStream.on("error", (err) => controller.error(err));
        },
      });

      return new NextResponse(stream, {
        status: 200,
        headers: {
          "Content-Length": fileSize.toString(),
          "Content-Type": contentType,
          "Accept-Ranges": "bytes",
          "Cache-Control": "public, max-age=3600",
        },
      });
    }
  } catch (err: any) {
    console.error("Media streaming error:", err);
    return new NextResponse(err?.message || "Internal streaming error", { status: 500 });
  }
}
