import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { exec } from "child_process";
import util from "util";
import { getFfmpegBinary } from "@/lib/videoService";

const execPromise = util.promisify(exec);

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No video file provided" }, { status: 400 });
    }

    const uploadsDir = path.join(process.cwd(), "public", "uploads");
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const baseName = `${Date.now()}-${file.name.replace(/\.[^/.]+$/, "").replace(/[^a-zA-Z0-9_-]/g, "_")}`;
    const rawPath = path.join(uploadsDir, `raw-${baseName}${path.extname(file.name)}`);
    fs.writeFileSync(rawPath, buffer);

    const webMp4Filename = `${baseName}.mp4`;
    const webMp4Path = path.join(uploadsDir, webMp4Filename);

    const ffmpegBin = getFfmpegBinary();

    // Transcode/remux uploaded phone/gallery video to web-standard 8-bit H.264 yuv420p with faststart
    try {
      const transcodeCmd = `"${ffmpegBin}" -y -i "${rawPath}" -c:v libx264 -preset ultrafast -crf 23 -pix_fmt yuv420p -vf "scale='min(1920,iw)':-2" -c:a aac -b:a 128k -movflags +faststart "${webMp4Path}"`;
      await execPromise(transcodeCmd, { timeout: 180000 });

      // Clean up raw temp file
      if (fs.existsSync(rawPath) && fs.existsSync(webMp4Path)) {
        try {
          fs.unlinkSync(rawPath);
        } catch (e) {}
      }

      return NextResponse.json({
        success: true,
        filePath: webMp4Path,
        fileUrl: `/api/media?file=uploads/${webMp4Filename}`,
        fileName: `${file.name}.mp4`,
        sizeBytes: fs.statSync(webMp4Path).size,
      });
    } catch (ffmpegErr) {
      console.warn("Fast transcode fallback to raw upload:", ffmpegErr);
      return NextResponse.json({
        success: true,
        filePath: rawPath,
        fileUrl: `/api/media?file=uploads/${path.basename(rawPath)}`,
        fileName: file.name,
        sizeBytes: file.size,
      });
    }
  } catch (err: any) {
    console.error("Upload error:", err);
    return NextResponse.json({ error: err?.message || "File upload failed" }, { status: 500 });
  }
}
