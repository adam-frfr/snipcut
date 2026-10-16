import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { exec } from "child_process";
import util from "util";
import { getFfmpegBinary, probeVideoFormat } from "@/lib/videoService";

const execPromise = util.promisify(exec);

export async function POST(req: NextRequest) {
  const uploadStartTime = Date.now();
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

    console.log(
      `[Stage: Upload] Received "${file.name}" (${(buffer.length / (1024 * 1024)).toFixed(2)} MB) written to ${rawPath}`
    );

    const webMp4Filename = `${baseName}.mp4`;
    const webMp4Path = path.join(uploadsDir, webMp4Filename);

    const ffmpegBin = getFfmpegBinary();

    // Probe the file stream: Remux only if ffprobe says H.264, 8-bit, yuv420p. Anything else: transcode.
    const probeStartTime = Date.now();
    const streamInfo = await probeVideoFormat(rawPath);
    console.log(
      `[Stage: Upload Probe] ffprobe result in ${Date.now() - probeStartTime}ms: codec=${streamInfo.codecName}, pix_fmt=${streamInfo.pixFmt}, bits=${streamInfo.bitsPerRawSample || "8"}, isH264Yuv420p8Bit=${streamInfo.isH264Yuv420p8Bit}`
    );

    try {
      let ffmpegCmd = "";
      if (streamInfo.isH264Yuv420p8Bit) {
        console.log(
          `[Stage: Upload Media Prep] Video is already H.264 8-bit yuv420p. Remuxing with -c copy -movflags +faststart...`
        );
        ffmpegCmd = `"${ffmpegBin}" -y -i "${rawPath}" -c copy -movflags +faststart "${webMp4Path}"`;
      } else {
        console.log(
          `[Stage: Upload Media Prep] Video is ${streamInfo.codecName} (${streamInfo.pixFmt}). Transcoding to standard H.264 8-bit yuv420p with -preset veryfast...`
        );
        ffmpegCmd = `"${ffmpegBin}" -y -i "${rawPath}" -c:v libx264 -preset veryfast -crf 23 -pix_fmt yuv420p -vf "scale='min(1920,iw)':-2" -c:a aac -b:a 128k -movflags +faststart "${webMp4Path}"`;
      }

      const prepStartTime = Date.now();
      await execPromise(ffmpegCmd, { timeout: 180000 });
      console.log(
        `[Stage: Upload Media Prep] Media prep completed in ${Date.now() - prepStartTime}ms -> ${webMp4Path}`
      );

      // Clean up raw temp file
      if (fs.existsSync(rawPath) && fs.existsSync(webMp4Path)) {
        try {
          fs.unlinkSync(rawPath);
        } catch (e) {}
      }

      const totalElapsed = Date.now() - uploadStartTime;
      return NextResponse.json({
        success: true,
        filePath: webMp4Path,
        fileUrl: `/api/media?file=uploads/${webMp4Filename}`,
        fileName: `${file.name}.mp4`,
        sizeBytes: fs.statSync(webMp4Path).size,
        streamInfo,
        timingMs: totalElapsed,
      });
    } catch (ffmpegErr) {
      console.warn("Media prep fallback to raw file:", ffmpegErr);
      return NextResponse.json({
        success: true,
        filePath: rawPath,
        fileUrl: `/api/media?file=uploads/${path.basename(rawPath)}`,
        fileName: file.name,
        sizeBytes: file.size,
        streamInfo,
        timingMs: Date.now() - uploadStartTime,
      });
    }
  } catch (err: any) {
    console.error("Upload error:", err);
    return NextResponse.json({ error: err?.message || "File upload failed" }, { status: 500 });
  }
}
