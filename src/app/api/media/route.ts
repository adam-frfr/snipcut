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
      // Clean leading slashes
      const cleanRelative = targetPath.replace(/^\/+/, "");
      // Try under public/ first
      const publicPath = path.join(process.cwd(), "public", cleanRelative);
      if (fs.existsSync(publicPath)) {
        targetPath = publicPath;
      } else {
        targetPath = path.join(process.cwd(), cleanRelative);
      }
    }

    if (!fs.existsSync(targetPath)) {
      return new NextResponse("Video file not found", { status: 404 });
    }

    const stat = fs.statSync(targetPath);
    const fileSize = stat.size;
    const range = req.headers.get("range");

    // Determine MIME type
    const ext = path.extname(targetPath).toLowerCase();
    let contentType = "video/mp4";
    if (ext === ".webm") contentType = "video/webm";
    else if (ext === ".mov") contentType = "video/quicktime";
    else if (ext === ".m4v") contentType = "video/x-m4v";
    else if (ext === ".ogg") contentType = "video/ogg";

    if (range) {
      // Parse Range header e.g. "bytes=0-1000"
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (start >= fileSize || end >= fileSize) {
        return new NextResponse("Requested range not satisfiable", {
          status: 416,
          headers: {
            "Content-Range": `bytes */${fileSize}`,
          },
        });
      }

      const chunkSize = end - start + 1;
      const fileStream = fs.createReadStream(targetPath, { start, end });

      // Convert Node readable stream to Web ReadableStream
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
      const fileStream = fs.createReadStream(targetPath);
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
