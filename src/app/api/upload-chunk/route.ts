import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import path from "path";
import fs from "fs";
import { execFile } from "child_process";
import util from "util";
import { verifyAuthAndRateLimit } from "@/lib/authRateLimit";
import { jobQueue, saveJobRecord, JobRecord, JobOptions } from "@/lib/jobQueue";
import { getFfmpegBinary, probeVideoFormat, checkZscaleSupported } from "@/lib/videoService";

const execFilePromise = util.promisify(execFile);

/**
 * Chunked upload endpoint.
 *
 * Why this exists: a single all-or-nothing multipart POST of a 10MB+ video
 * dies whenever the connection hiccups mid-body (observed in production as
 * ECONNRESET in the jobs API on slower home uplinks, while fast datacenter
 * uploads succeeded). The client therefore sends the file in 2MB pieces —
 * each small, fast, and individually retryable — and this route assembles
 * them and creates the job exactly like the multipart branch of /api/jobs.
 *
 * POST multipart/form-data { uploadId, index, chunk }  -> store one part
 * POST application/json    { action: "finalize", uploadId, totalChunks,
 *                            fileName, ...jobOptions }  -> assemble + job
 */

const CHUNK_ROOT = path.join(process.cwd(), "data", "chunk-uploads");
const MAX_CHUNKS = 1024; // 2MB client chunks -> up to ~2GB files

function partsDirFor(uploadId: string): string | null {
  if (!/^[a-zA-Z0-9-]{8,64}$/.test(uploadId)) return null;
  return path.join(CHUNK_ROOT, uploadId);
}

export async function POST(req: NextRequest) {
  const authError = verifyAuthAndRateLimit(req);
  if (authError) return authError;

  const contentType = req.headers.get("content-type") || "";

  try {
    // ---- One chunk ------------------------------------------------------
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const uploadId = String(formData.get("uploadId") || "");
      const index = Number(formData.get("index"));
      const chunk = formData.get("chunk") as File | null;

      const dir = partsDirFor(uploadId);
      if (!dir) return NextResponse.json({ error: "Invalid uploadId" }, { status: 400 });
      if (!chunk) return NextResponse.json({ error: "No chunk provided" }, { status: 400 });
      if (!Number.isInteger(index) || index < 0 || index >= MAX_CHUNKS) {
        return NextResponse.json({ error: "Invalid chunk index" }, { status: 400 });
      }

      fs.mkdirSync(dir, { recursive: true });
      const buffer = Buffer.from(await chunk.arrayBuffer());
      fs.writeFileSync(path.join(dir, `${index}.part`), buffer);
      return NextResponse.json({ success: true, index, received: buffer.length });
    }

    // ---- Finalize -------------------------------------------------------
    const body = await req.json();
    if (body?.action !== "finalize") {
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
    }

    const uploadId = String(body.uploadId || "");
    const totalChunks = Number(body.totalChunks);
    const fileName = String(body.fileName || "upload.mp4");
    const dir = partsDirFor(uploadId);
    if (!dir) return NextResponse.json({ error: "Invalid uploadId" }, { status: 400 });
    if (!Number.isInteger(totalChunks) || totalChunks < 1 || totalChunks > MAX_CHUNKS) {
      return NextResponse.json({ error: "Invalid totalChunks" }, { status: 400 });
    }

    const partPaths: string[] = [];
    for (let i = 0; i < totalChunks; i++) {
      const p = path.join(dir, `${i}.part`);
      if (!fs.existsSync(p)) {
        return NextResponse.json({ error: `Missing chunk ${i} — please retry the upload` }, { status: 400 });
      }
      partPaths.push(p);
    }

    // Assemble into the uploads dir under the same naming scheme /api/jobs uses
    const uploadsDir = path.join(process.cwd(), "public", "uploads");
    fs.mkdirSync(uploadsDir, { recursive: true });

    const rawExt = path.extname(fileName).toLowerCase();
    const safeExt = /^\.[a-z0-9]{1,8}$/.test(rawExt) ? rawExt : ".mp4";
    const rawBase = path.basename(fileName, rawExt);
    const safeBaseName = rawBase.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 60) || "upload";
    const baseName = `${Date.now()}-${safeBaseName}`;
    const rawPath = path.join(uploadsDir, `raw-${baseName}${safeExt}`);

    const out = fs.createWriteStream(rawPath);
    for (const p of partPaths) {
      const data = fs.readFileSync(p);
      await new Promise<void>((resolve, reject) => out.write(data, (e) => (e ? reject(e) : resolve())));
    }
    await new Promise<void>((resolve, reject) => out.end((e?: Error | null) => (e ? reject(e) : resolve())));
    fs.rmSync(dir, { recursive: true, force: true });

    // Probe + normalize to a web-playable MP4 (mirrors /api/jobs multipart)
    const webMp4Filename = `${baseName}.mp4`;
    const webMp4Path = path.join(uploadsDir, webMp4Filename);
    const ffmpegBin = getFfmpegBinary();
    const streamInfo = await probeVideoFormat(rawPath);
    const transcodeNeeded = !streamInfo.isH264Yuv420p8Bit || streamInfo.isHdr || streamInfo.isVfr;

    if (transcodeNeeded) {
      let vfFilter = "scale='min(1920,iw)':-2";
      if (streamInfo.isHdr && checkZscaleSupported()) {
        vfFilter =
          "scale='min(1920,iw)':-2,zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p";
      }
      await execFilePromise(ffmpegBin, [
        "-y", "-i", rawPath, "-vf", vfFilter, "-r", "30",
        "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
        "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k",
        "-movflags", "+faststart", webMp4Path,
      ]);
    } else {
      await execFilePromise(ffmpegBin, ["-y", "-i", rawPath, "-c", "copy", "-movflags", "+faststart", webMp4Path]);
    }

    const options: JobOptions = {
      sourceType: "upload",
      fileName,
      customPrompt: body.customPrompt || undefined,
      aspectRatio: body.aspectRatio || "9:16",
      reframeMode: body.reframeMode || "auto-tracker",
      captionStyle: body.captionStyle || "hormozi",
      removeSilences: body.removeSilences === true,
      maxClipsToRender: 2,
      groqKey: (body.groqKey || "").trim?.() || undefined,
      openaiKey: (body.openaiKey || "").trim?.() || undefined,
      claudeKey: (body.claudeKey || "").trim?.() || undefined,
      preferredModel: (body.preferredModel || "").trim?.() || undefined,
    };

    const jobId = `job_${crypto.randomUUID()}`;
    const jobRecord: JobRecord = {
      id: jobId,
      status: "uploaded",
      progress: 5,
      stageMessage: "Video received and ready for AI processing",
      error: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      options,
      output: { fileId: `uploads/${webMp4Filename}`, filePath: webMp4Path },
      stageTimestamps: { uploaded: { start: Date.now(), end: Date.now() } },
    };

    saveJobRecord(jobRecord);
    jobQueue.enqueue(jobId);
    console.log(`[Stage: UploadChunk] Assembled ${totalChunks} chunks and enqueued job ${jobId}`);

    return NextResponse.json(
      { success: true, jobId, status: jobRecord.status, progress: jobRecord.progress, stageMessage: jobRecord.stageMessage },
      { status: 201 }
    );
  } catch (err: any) {
    console.error("[Stage: UploadChunk] Error:", err);
    return NextResponse.json({ error: err.message || "Chunked upload failed" }, { status: 500 });
  }
}
