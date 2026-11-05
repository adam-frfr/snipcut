import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import path from "path";
import fs from "fs";
import { verifyAuthAndRateLimit } from "@/lib/authRateLimit";
import { jobQueue, saveJobRecord, JobRecord, JobOptions, listRecentProjects, retentionHours } from "@/lib/jobQueue";
import { normalizeCookiesToNetscape } from "@/lib/youtubeCookies";
import { normalizeYoutubeUrl, normalizeProxy } from "@/lib/mediaPrep";


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
      maxClipsToRender: Number(process.env.MAX_CLIPS_TO_RENDER) || 6,
    };

    if (contentType.includes("multipart/form-data")) {
      // Whole-file multipart uploads were buffered in RAM (OOM on large
      // files). The dashboard uses the streaming /api/upload-chunk route.
      return NextResponse.json(
        { error: "Upload files through /api/upload-chunk; /api/jobs accepts JSON only." },
        { status: 415 }
      );
    } else {
      // 2. JSON Payload (Existing fileId or YouTube download)
      let body: any;
      try {
        body = await req.json();
      } catch {
        return NextResponse.json(
          { error: "Request body was cut off or invalid — please retry." },
          { status: 400 }
        );
      }
      const {
        fileId: inputId,
        filePath: inputPath,
        youtubeUrl,
        customPrompt,
        aspectRatio,
        reframeMode,
        captionStyle,
        removeSilences,
        cookies,
        proxy,
        groqKey,
        openaiKey,
        claudeKey,
        preferredModel,
        broll,
        musicBed,
        hookTitle,
        keywordHighlights,
        pexelsKey,
        pixabayKey,
      } = body;

      if (youtubeUrl !== undefined && youtubeUrl !== null && typeof youtubeUrl !== "string") {
        return NextResponse.json({ error: "youtubeUrl must be a string" }, { status: 400 });
      }

      options = {
        sourceType: youtubeUrl ? "youtube" : "upload",
        youtubeUrl,
        customPrompt,
        aspectRatio: aspectRatio || "9:16",
        reframeMode: reframeMode || "auto-tracker",
        captionStyle: captionStyle || "hormozi",
        removeSilences: removeSilences === true,
        maxClipsToRender: Number(process.env.MAX_CLIPS_TO_RENDER) || 6,
        groqKey: (groqKey || "").trim?.() || undefined,
        openaiKey: (openaiKey || "").trim?.() || undefined,
        claudeKey: (claudeKey || "").trim?.() || undefined,
        preferredModel: (preferredModel || "").trim?.() || undefined,
        broll: broll === true,
        musicBed: musicBed === true,
        hookTitle: hookTitle !== false,
        keywordHighlights: keywordHighlights !== false,
        pexelsKey: (pexelsKey || "").trim?.() || undefined,
        pixabayKey: (pixabayKey || "").trim?.() || undefined,
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
          const safeYoutubeUrl = normalizeYoutubeUrl(youtubeUrl);
          if (!safeYoutubeUrl) {
            return NextResponse.json(
              { error: "Please paste a valid YouTube link (youtube.com or youtu.be)." },
              { status: 400 }
            );
          }
          // The download itself runs in the job worker (it can take
          // minutes; a reverse proxy would cut this request off first).
          options.youtubeUrl = safeYoutubeUrl;
          options.proxy = normalizeProxy(proxy) || undefined;
          // Cookies pasted with this request: normalize now into a per-job
          // file under data/ (never served); the worker deletes it after
          // the download. Without one it uses the server jar / env.
          if (typeof cookies === "string" && cookies.trim().length > 10) {
            const normalized = normalizeCookiesToNetscape(cookies);
            if (normalized) {
              const dir = path.join(process.cwd(), "data", "job-cookies");
              fs.mkdirSync(dir, { recursive: true });
              const cookieFile = path.join(dir, `${jobId}.txt`);
              fs.writeFileSync(cookieFile, normalized.content, "utf-8");
              options.cookieFile = cookieFile;
            }
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

    // A raw upload from /api/upload ("uploads/raw-...") still needs converting:
    // hand it to the worker's preparation stage instead of processing it as-is.
    let rawUploadPath: string | undefined;
    let rawBaseName: string | undefined;
    const rawMatch = /^uploads\/(raw-([^/\\]+?))(\.[a-z0-9]{1,8})?$/i.exec(fileId.replace(/^\/+/, ""));
    if (rawMatch) {
      rawUploadPath = path.join(process.cwd(), "public", "uploads", rawMatch[1] + (rawMatch[3] || ""));
      rawBaseName = rawMatch[2];
      fileId = "";
      resolvedFilePath = "";
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
      // Empty until the worker downloads (YouTube) or converts (raw upload).
      output: {
        fileId: fileId || undefined,
        filePath: resolvedFilePath || undefined,
        rawUploadPath,
        rawBaseName,
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

/** Recent finished projects (clips still on disk), newest first. */
export async function GET(req: NextRequest) {
  const authError = verifyAuthAndRateLimit(req);
  if (authError) return authError;
  return NextResponse.json({ success: true, projects: listRecentProjects(12), retentionHours: retentionHours() });
}
