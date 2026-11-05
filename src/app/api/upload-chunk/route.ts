import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import path from "path";
import fs from "fs";
import { verifyAuthAndRateLimit } from "@/lib/authRateLimit";
import { jobQueue, saveJobRecord, JobRecord, JobOptions } from "@/lib/jobQueue";
import { safeUploadName } from "@/lib/mediaPrep";
import { normalizeClipStyle } from "@/lib/clipStyle";
import { CAPTION_FONTS } from "@/lib/videoService";

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
const MAX_CHUNK_REQUEST_BYTES = 8 * 1024 * 1024; // 2MB chunk + multipart overhead, with headroom

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
      // formData() buffers the whole body in memory, so refuse anything far
      // larger than a 2MB client chunk before parsing it.
      const declaredLen = Number(req.headers.get("content-length") || 0);
      if (!declaredLen || declaredLen > MAX_CHUNK_REQUEST_BYTES) {
        return NextResponse.json({ error: "Chunk too large (or missing Content-Length)" }, { status: 413 });
      }
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
    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Request body was cut off or invalid — please retry." },
        { status: 400 }
      );
    }
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

    const { baseName, ext: safeExt } = safeUploadName(fileName);
    const rawPath = path.join(uploadsDir, `raw-${baseName}${safeExt}`);

    const out = fs.createWriteStream(rawPath);
    for (const p of partPaths) {
      const data = fs.readFileSync(p);
      await new Promise<void>((resolve, reject) => out.write(data, (e) => (e ? reject(e) : resolve())));
    }
    await new Promise<void>((resolve, reject) => out.end((e?: Error | null) => (e ? reject(e) : resolve())));
    // Conversion to a web-ready MP4 (probe, HEVC/HDR transcode) happens in
    // the job worker: on a long phone video it can take minutes, and a
    // reverse proxy would cut this request off long before it finished.

    const options: JobOptions = {
      sourceType: "upload",
      fileName,
      customPrompt: body.customPrompt || undefined,
      aspectRatio: body.aspectRatio || "9:16",
      reframeMode: body.reframeMode || "auto-tracker",
      captionStyle: body.captionStyle || "hormozi",
      removeSilences: body.removeSilences === true,
      maxClipsToRender: Number(process.env.MAX_CLIPS_TO_RENDER) || 6,
      groqKey: (body.groqKey || "").trim?.() || undefined,
      openaiKey: (body.openaiKey || "").trim?.() || undefined,
      claudeKey: (body.claudeKey || "").trim?.() || undefined,
      preferredModel: (body.preferredModel || "").trim?.() || undefined,
      broll: body.broll === true,
      musicBed: body.musicBed === true,
      hookTitle: body.hookTitle !== false,
      keywordHighlights: body.keywordHighlights !== false,
      clipStyle: normalizeClipStyle(body.clipStyle),
      captionFont: typeof body.captionFont === "string" && CAPTION_FONTS[body.captionFont] ? body.captionFont : undefined,
      pexelsKey: (body.pexelsKey || "").trim?.() || undefined,
      pixabayKey: (body.pixabayKey || "").trim?.() || undefined,
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
      output: { rawUploadPath: rawPath, rawBaseName: baseName },
      stageTimestamps: { uploaded: { start: Date.now(), end: Date.now() } },
    };

    saveJobRecord(jobRecord);
    jobQueue.enqueue(jobId);
    fs.rmSync(dir, { recursive: true, force: true });
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
