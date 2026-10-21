import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import path from "path";
import fs from "fs";
import { execFile } from "child_process";
import util from "util";
import { verifyAuthAndRateLimit } from "@/lib/authRateLimit";
import { jobQueue, saveJobRecord, JobRecord, JobOptions } from "@/lib/jobQueue";
import { getFfmpegBinary, getYtDlpBinary, probeVideoFormat, checkZscaleSupported } from "@/lib/videoService";

const execFilePromise = util.promisify(execFile);

export async function POST(req: NextRequest) {
  const authError = verifyAuthAndRateLimit(req);
  if (authError) return authError;

  try {
    const contentType = req.headers.get("content-type") || "";
    const jobId = `job_${crypto.randomUUID()}`;
    let resolvedFilePath = "";
    let fileId = "";
    let options: JobOptions = {
      sourceType: "upload",
      aspectRatio: "9:16",
      reframeMode: "auto-tracker",
      captionStyle: "hormozi",
      maxClipsToRender: 2,
    };

    if (contentType.includes("multipart/form-data")) {
      // 1. Multipart Form Data (File Upload)
      const formData = await req.formData();
      const file = formData.get("file") as File;

      if (!file) {
        return NextResponse.json({ error: "No video file provided" }, { status: 400 });
      }

      const customPrompt = (formData.get("customPrompt") as string) || undefined;
      const aspectRatio = (formData.get("aspectRatio") as any) || "9:16";
      const reframeMode = (formData.get("reframeMode") as any) || "auto-tracker";
      const captionStyle = (formData.get("captionStyle") as any) || "hormozi";

      options = {
        sourceType: "upload",
        fileName: file.name,
        customPrompt,
        aspectRatio,
        reframeMode,
        captionStyle,
        maxClipsToRender: 2,
        groqKey: ((formData.get("groqKey") as string) || "").trim() || undefined,
        openaiKey: ((formData.get("openaiKey") as string) || "").trim() || undefined,
        claudeKey: ((formData.get("claudeKey") as string) || "").trim() || undefined,
        preferredModel: ((formData.get("preferredModel") as string) || "").trim() || undefined,
      };

      const uploadsDir = path.join(process.cwd(), "public", "uploads");
      if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);

      const rawExt = path.extname(file.name).toLowerCase();
      const safeExt = /^\.[a-z0-9]{1,8}$/.test(rawExt) ? rawExt : ".mp4";
      const rawBase = path.basename(file.name, rawExt);
      const safeBaseName = rawBase.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60) || "upload";
      const baseName = `${Date.now()}-${safeBaseName}`;

      const rawPath = path.join(uploadsDir, `raw-${baseName}${safeExt}`);
      fs.writeFileSync(rawPath, buffer);

      const webMp4Filename = `${baseName}.mp4`;
      const webMp4Path = path.join(uploadsDir, webMp4Filename);
      const ffmpegBin = getFfmpegBinary();

      // Probe stream format
      const streamInfo = await probeVideoFormat(rawPath);
      let transcodeNeeded = !streamInfo.isH264Yuv420p8Bit || streamInfo.isHdr || streamInfo.isVfr;

      if (transcodeNeeded) {
        let vfFilter = "scale='min(1920,iw)':-2";
        if (streamInfo.isHdr && checkZscaleSupported()) {
          vfFilter =
            "scale='min(1920,iw)':-2,zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p";
        }
        await execFilePromise(ffmpegBin, [
          "-y",
          "-i", rawPath,
          "-vf", vfFilter,
          "-r", "30",
          "-c:v", "libx264",
          "-preset", "veryfast",
          "-crf", "23",
          "-pix_fmt", "yuv420p",
          "-c:a", "aac",
          "-b:a", "128k",
          "-movflags", "+faststart",
          webMp4Path,
        ]);
        resolvedFilePath = webMp4Path;
        fileId = `uploads/${webMp4Filename}`;
      } else {
        // Fast stream copy
        await execFilePromise(ffmpegBin, [
          "-y",
          "-i", rawPath,
          "-c", "copy",
          "-movflags", "+faststart",
          webMp4Path,
        ]);
        resolvedFilePath = webMp4Path;
        fileId = `uploads/${webMp4Filename}`;
      }
    } else {
      // 2. JSON Payload (Existing fileId or YouTube download)
      const body = await req.json();
      const {
        fileId: inputId,
        filePath: inputPath,
        youtubeUrl,
        customPrompt,
        aspectRatio,
        reframeMode,
        captionStyle,
        cookies,
        proxy,
        groqKey,
        openaiKey,
        claudeKey,
        preferredModel,
      } = body;

      options = {
        sourceType: youtubeUrl ? "youtube" : "upload",
        youtubeUrl,
        customPrompt,
        aspectRatio: aspectRatio || "9:16",
        reframeMode: reframeMode || "auto-tracker",
        captionStyle: captionStyle || "hormozi",
        maxClipsToRender: 2,
        groqKey: (groqKey || "").trim?.() || undefined,
        openaiKey: (openaiKey || "").trim?.() || undefined,
        claudeKey: (claudeKey || "").trim?.() || undefined,
        preferredModel: (preferredModel || "").trim?.() || undefined,
      };

      if (youtubeUrl) {
        const downloadDir = path.join(process.cwd(), "public", "downloads");
        if (!fs.existsSync(downloadDir)) fs.mkdirSync(downloadDir, { recursive: true });

        if (youtubeUrl === "sample" || youtubeUrl.includes("sample-podcast") || youtubeUrl.includes("sample-keynote")) {
          const sampleFiles = ["test_dynamic_pan.mp4", "test_split_screen.mp4", "test_tracked_crop.mp4", "real_speech_2min.mp4"];
          const existingSample = sampleFiles.find((s) => fs.existsSync(path.join(downloadDir, s))) || "test_dynamic_pan.mp4";
          resolvedFilePath = path.join(downloadDir, existingSample);
          fileId = `downloads/${existingSample}`;
        } else {
          const filePrefix = `yt-${Date.now()}`;
          const outTemplate = path.join(downloadDir, `${filePrefix}.%(ext)s`);
          const ytDlp = getYtDlpBinary();
          const ffmpegBin = getFfmpegBinary();

          // Cookie handling for YouTube bot-check bypass
          let cookieArg = "";
          let tempCookiePath: string | null = null;
          const rawCookies = cookies || process.env.YOUTUBE_COOKIES || "";
          const localCookieFile = path.join(process.cwd(), "cookies.txt");

          if (rawCookies && rawCookies.trim().length > 10) {
            const os = require("os");
            tempCookiePath = path.join(os.tmpdir(), `yt-cookies-${Date.now()}.txt`);
            fs.writeFileSync(tempCookiePath, rawCookies.trim(), "utf-8");
            cookieArg = `--cookies "${tempCookiePath}"`;
          } else if (fs.existsSync(localCookieFile)) {
            cookieArg = `--cookies "${localCookieFile}"`;
          }

          // Proxy handling
          let proxyArg = "";
          const activeProxy = proxy || process.env.YOUTUBE_PROXY || process.env.HTTP_PROXY || "";
          if (activeProxy && activeProxy.trim().length > 5) {
            proxyArg = `--proxy "${activeProxy.trim()}"`;
          }

        // Resolution before codec: an avc1-only preference grabs 360p on older
        // uploads even when 1080p VP9 exists (verified on a real MIT lecture).
        // The render pipeline re-encodes to H.264 anyway, so source codec is secondary.
        const preferredFormat =
          "bestvideo[vcodec^=avc1][height<=1080]+bestaudio[ext=m4a]/bestvideo[height>=720][height<=1080]+bestaudio/bestvideo[vcodec^=avc1][height<=1080]+bestaudio/bestvideo[height<=1080]+bestaudio/best[height<=1080]/best";

        const cmd = `"${ytDlp}" --js-runtimes node --ffmpeg-location "${ffmpegBin}" ${cookieArg} ${proxyArg} --extractor-args "youtube:player_client=android,ios,web" -f "${preferredFormat}" --no-warnings --ignore-errors --merge-output-format mp4 -o "${outTemplate}" "${youtubeUrl}"`;

        try {
          const { exec } = require("child_process");
          const execP = util.promisify(exec);
          // Long videos at 1080p can take several minutes to download + merge;
          // 180s was killing healthy downloads mid-flight (verified: 196MB .part at kill time)
          await execP(cmd, { timeout: 900000, maxBuffer: 64 * 1024 * 1024 });
        } finally {
          if (tempCookiePath && fs.existsSync(tempCookiePath)) {
            try { fs.unlinkSync(tempCookiePath); } catch {}
          }
        }

        const targetMp4 = path.join(downloadDir, `${filePrefix}.mp4`);
        if (fs.existsSync(targetMp4)) {
          resolvedFilePath = targetMp4;
          fileId = `downloads/${filePrefix}.mp4`;
        } else {
          const files = fs.readdirSync(downloadDir);
          const found = files.find((f) => f.startsWith(filePrefix));
          if (!found) throw new Error("Failed to download YouTube video");
          resolvedFilePath = path.join(downloadDir, found);
          fileId = `downloads/${found}`;
        }
      }
    } else if (inputId || inputPath) {
        fileId = inputId || inputPath;
        resolvedFilePath = path.isAbsolute(fileId)
          ? fileId
          : path.join(process.cwd(), "public", fileId.replace(/^\/+/, ""));
      } else {
        return NextResponse.json(
          { error: "Must provide either file upload, fileId, or youtubeUrl" },
          { status: 400 }
        );
      }
    }

    const jobRecord: JobRecord = {
      id: jobId,
      status: "uploaded",
      progress: 5,
      stageMessage: "Video received and ready for AI processing",
      error: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      options,
      output: {
        fileId,
        filePath: resolvedFilePath,
      },
      stageTimestamps: {
        uploaded: { start: Date.now(), end: Date.now() },
      },
    };

    saveJobRecord(jobRecord);

    // Enqueue job in worker queue (concurrency 1)
    jobQueue.enqueue(jobId);

    console.log(`[Stage: Jobs API] Created and enqueued job ${jobId}`);

    return NextResponse.json(
      {
        success: true,
        jobId: jobRecord.id,
        status: jobRecord.status,
        progress: jobRecord.progress,
        stageMessage: jobRecord.stageMessage,
      },
      { status: 201 }
    );
  } catch (err: any) {
    console.error("[Stage: Jobs API] Error creating job:", err);
    return NextResponse.json(
      { error: err.message || "Failed to create processing job" },
      { status: 500 }
    );
  }
}
