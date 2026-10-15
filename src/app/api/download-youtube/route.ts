import { NextRequest, NextResponse } from "next/server";
import { exec } from "child_process";
import path from "path";
import fs from "fs";
import util from "util";

const execPromise = util.promisify(exec);

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();

    if (!url) {
      return NextResponse.json({ error: "YouTube URL is required" }, { status: 400 });
    }

    const downloadDir = path.join(process.cwd(), "public", "downloads");
    if (!fs.existsSync(downloadDir)) {
      fs.mkdirSync(downloadDir, { recursive: true });
    }

    const outputTemplate = path.join(downloadDir, `yt-%(id)s.%(ext)s`);

    // Download optimal format (1080p / 720p with audio)
    const cmd = `yt-dlp -f "bestvideo[ext=mp4][height<=1080]+bestaudio[ext=m4a]/best[ext=mp4]/best" --merge-output-format mp4 -o "${outputTemplate}" "${url}"`;

    await execPromise(cmd, { timeout: 120000 });

    // Find the downloaded file
    const files = fs.readdirSync(downloadDir);
    const downloadedFile = files[files.length - 1];
    const fullPath = path.join(downloadDir, downloadedFile);

    return NextResponse.json({
      success: true,
      filePath: fullPath,
      fileUrl: `/downloads/${downloadedFile}`,
      fileName: downloadedFile,
    });
  } catch (err: any) {
    console.error("YouTube download error:", err);
    return NextResponse.json(
      { error: err?.message || "Failed to download YouTube video" },
      { status: 500 }
    );
  }
}
