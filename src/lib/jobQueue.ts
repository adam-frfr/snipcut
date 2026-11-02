import fs from "fs";
import path from "path";
import crypto from "crypto";
import { transcribeAudioFile } from "./transcriptionService";
import { analyzeTranscriptForViralClips, CuratedClipResult } from "./aiService";
import { snapAndValidateClips, SnappedClipResult } from "./wordSnapping";
import { renderVideoClip, resolveSafeFilePath, extractAudioForWhisper } from "./videoService";

export type JobStatus =
  | "uploaded"
  | "transcribing"
  | "analyzing"
  | "reframing"
  | "rendering"
  | "done"
  | "failed";

export interface RenderedClipItem {
  clipId: string;
  title: string;
  startTime: number;
  endTime: number;
  duration: number;
  downloadUrl: string;
  filename: string;
  viralityScore: number;
  hookHeadline: string;
  trackingSummary?: string;
}

export interface JobOutput {
  fileId?: string;
  filePath?: string;
  sourceSha256?: string;
  transcription?: {
    text: string;
    words: any[];
    segments: any[];
    duration: number;
    provider: string;
  };
  curatedClips?: SnappedClipResult[];
  renderedClips?: RenderedClipItem[];
}

export interface JobOptions {
  sourceType: "upload" | "youtube";
  youtubeUrl?: string;
  fileName?: string;
  customPrompt?: string;
  aspectRatio?: "9:16" | "1:1" | "16:9";
  reframeMode?: "auto-tracker" | "split-screen" | "blurred-fit" | "center";
  captionStyle?: "hormozi" | "neon" | "beast" | "clean";
  maxClipsToRender?: number; // default 2
  retentionHours?: number; // default 24h
}

export interface JobRecord {
  id: string;
  status: JobStatus;
  progress: number;
  stageMessage: string;
  error: string | null;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  options: JobOptions;
  output: JobOutput;
  stageTimestamps: Record<string, { start: number; end?: number }>;
}

const JOBS_DIR = path.join(process.cwd(), "data", "jobs");
const CACHE_DIR = path.join(process.cwd(), "data", "cache");
const TRANSCRIPTS_CACHE_DIR = path.join(CACHE_DIR, "transcripts");
const CLIPS_CACHE_DIR = path.join(CACHE_DIR, "clips");
const RENDERS_CACHE_DIR = path.join(CACHE_DIR, "renders");

// Ensure directories exist
for (const dir of [JOBS_DIR, TRANSCRIPTS_CACHE_DIR, CLIPS_CACHE_DIR, RENDERS_CACHE_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/**
 * Computes sha256 checksum of a file on disk
 */
export async function computeFileSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const stream = fs.createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", (err) => reject(err));
  });
}

/**
 * Persist job state to data/jobs/<id>.json
 */
export function saveJobRecord(job: JobRecord): void {
  job.updatedAt = Date.now();
  const filePath = path.join(JOBS_DIR, `${job.id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(job, null, 2), "utf-8");
}

/**
 * Load job state from data/jobs/<id>.json
 */
export function getJobRecord(id: string): JobRecord | null {
  const filePath = path.join(JOBS_DIR, `${id}.json`);
  if (!fs.existsSync(filePath)) return null;
  try {
    const data = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(data) as JobRecord;
  } catch (err) {
    console.warn(`[JobQueue] Failed to parse job ${id}:`, err);
    return null;
  }
}

/**
 * Cleanup: Deletes uploads, downloads, rendered clips, and extracted audio older than retentionHours (default 24h)
 */
export function cleanupExpiredFiles(retentionHours = 24): { deletedFiles: number; freedBytes: number } {
  const maxAgeMs = retentionHours * 3600 * 1000;
  const now = Date.now();
  let deletedFiles = 0;
  let freedBytes = 0;

  const targetDirs = [
    path.join(process.cwd(), "public", "uploads"),
    path.join(process.cwd(), "public", "rendered_clips"),
    path.join(process.cwd(), "public", "downloads"),
    path.join(process.cwd(), "data", "audio"),
  ];

  for (const dir of targetDirs) {
    if (!fs.existsSync(dir)) continue;
    try {
      const entries = fs.readdirSync(dir);
      for (const entry of entries) {
        // Skip .gitkeep or special files
        if (entry.startsWith(".")) continue;
        const fullPath = path.join(dir, entry);
        try {
          const stat = fs.statSync(fullPath);
          if (stat.isFile() && now - stat.mtimeMs > maxAgeMs) {
            freedBytes += stat.size;
            fs.unlinkSync(fullPath);
            deletedFiles++;
          }
        } catch {}
      }
    } catch {}
  }

  if (deletedFiles > 0) {
    console.log(
      `[Stage: Cleanup] Deleted ${deletedFiles} files older than ${retentionHours}h, freeing ${(freedBytes / (1024 * 1024)).toFixed(2)} MB`
    );
  }
  return { deletedFiles, freedBytes };
}

// -------------------------------------------------------------
// In-Process Queue Manager with Concurrency 1
// -------------------------------------------------------------
class JobQueueManager {
  private queue: string[] = [];
  private isProcessing = false;
  private activeJobId: string | null = null;

  constructor() {
    this.recoverInterruptedJobs();
  }

  /**
   * On server startup: Mark any jobs left in running state as failed
   */
  public recoverInterruptedJobs(): number {
    try {
      if (!fs.existsSync(JOBS_DIR)) return 0;
      const files = fs.readdirSync(JOBS_DIR);
      let recoveredCount = 0;

      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        try {
          const filePath = path.join(JOBS_DIR, file);
          const job = JSON.parse(fs.readFileSync(filePath, "utf-8")) as JobRecord;
          const runningStatuses: JobStatus[] = ["transcribing", "analyzing", "reframing", "rendering"];

          if (runningStatuses.includes(job.status)) {
            job.status = "failed";
            job.error = "Server restarted during processing. Click retry to resume from the last completed stage.";
            job.updatedAt = Date.now();
            fs.writeFileSync(filePath, JSON.stringify(job, null, 2), "utf-8");
            recoveredCount++;
          }
        } catch {}
      }

      if (recoveredCount > 0) {
        console.log(`[JobQueue: Recovery] Marked ${recoveredCount} interrupted jobs as failed on startup`);
      }
      return recoveredCount;
    } catch (e) {
      console.warn("[JobQueue: Recovery] Error checking interrupted jobs:", e);
      return 0;
    }
  }

  public enqueue(jobId: string) {
    if (!this.queue.includes(jobId) && this.activeJobId !== jobId) {
      this.queue.push(jobId);
      console.log(`[JobQueue] Enqueued job ${jobId}. Queue length: ${this.queue.length}`);
    }
    this.processNext();
  }

  public getActiveJobId(): string | null {
    return this.activeJobId;
  }

  public getQueueLength(): number {
    return this.queue.length;
  }

  private async processNext() {
    if (this.isProcessing) return;
    if (this.queue.length === 0) return;

    this.isProcessing = true;
    const jobId = this.queue.shift()!;
    this.activeJobId = jobId;

    try {
      await this.runJobPipeline(jobId);
    } catch (err: any) {
      console.error(`[JobQueue] Unexpected error running job ${jobId}:`, err);
    } finally {
      this.activeJobId = null;
      this.isProcessing = false;
      this.processNext();
    }
  }

  private async runJobPipeline(jobId: string) {
    const job = getJobRecord(jobId);
    if (!job) {
      console.error(`[JobQueue] Job ${jobId} not found in storage`);
      return;
    }

    console.log(`[JobQueue] Starting worker execution for job ${jobId} (initial status: ${job.status})`);

    try {
      // -------------------------------------------------------------
      // Stage 1: File Preparation & SHA-256 Hashing
      // -------------------------------------------------------------
      let resolvedVideoPath: string;
      if (job.output.filePath) {
        resolvedVideoPath = resolveSafeFilePath(job.output.filePath);
      } else if (job.output.fileId) {
        resolvedVideoPath = resolveSafeFilePath(job.output.fileId);
      } else {
        throw new Error("No source video file specified in job record");
      }

      if (!fs.existsSync(resolvedVideoPath)) {
        throw new Error(`Video file not found at ${resolvedVideoPath}`);
      }

      if (!job.output.sourceSha256) {
        console.log(`[JobQueue] Computing SHA-256 for: ${path.basename(resolvedVideoPath)}...`);
        job.output.sourceSha256 = await computeFileSha256(resolvedVideoPath);
        saveJobRecord(job);
      }
      const sourceHash = job.output.sourceSha256;

      // -------------------------------------------------------------
      // Stage 2: Transcribing (with Transcript Cache)
      // -------------------------------------------------------------
      if (!job.output.transcription) {
        job.status = "transcribing";
        job.progress = 20;
        job.stageMessage = "Transcribing audio with Whisper AI...";
        job.stageTimestamps.transcribing = { start: Date.now() };
        saveJobRecord(job);

        const transcriptCachePath = path.join(TRANSCRIPTS_CACHE_DIR, `${sourceHash}.json`);

        if (fs.existsSync(transcriptCachePath)) {
          // CACHE HIT
          console.log(`[Cache: Hit] Reusing transcript for sha256:${sourceHash.slice(0, 12)}...`);
          const cachedData = JSON.parse(fs.readFileSync(transcriptCachePath, "utf-8"));
          job.output.transcription = cachedData;
          job.stageMessage = "Reused cached Whisper transcription";
        } else {
          // CACHE MISS
          console.log(`[Cache: Miss] Transcribing new audio for sha256:${sourceHash.slice(0, 12)}...`);

          // Extract audio for transcription
          const audioDir = path.join(process.cwd(), "data", "audio");
          if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir, { recursive: true });
          const audioPath = path.join(audioDir, `job-${job.id}.mp3`);

          try {
            await extractAudioForWhisper(resolvedVideoPath, audioPath);
          } catch (e) {
            console.warn("[JobQueue] Audio extraction fallback, using source file:", e);
          }

          const targetAudio = fs.existsSync(audioPath) ? audioPath : resolvedVideoPath;
          const transcriptResult = await transcribeAudioFile(targetAudio);

          job.output.transcription = transcriptResult;
          // Write to cache
          fs.writeFileSync(transcriptCachePath, JSON.stringify(transcriptResult, null, 2), "utf-8");
          console.log(`[Cache: Stored] Saved transcript to cache for sha256:${sourceHash.slice(0, 12)}`);

          // Clean temporary audio
          if (fs.existsSync(audioPath)) {
            try { fs.unlinkSync(audioPath); } catch {}
          }
        }

        job.stageTimestamps.transcribing.end = Date.now();
        saveJobRecord(job);
      }

      // -------------------------------------------------------------
      // Stage 3: Analyzing & Snapping Clips (with Curation Cache)
      // -------------------------------------------------------------
      const promptText = job.options.customPrompt || "default";
      const promptHash = crypto.createHash("md5").update(promptText).digest("hex").slice(0, 8);
      const clipsCachePath = path.join(CLIPS_CACHE_DIR, `${sourceHash}-${promptHash}.json`);

      if (!job.output.curatedClips || job.output.curatedClips.length === 0) {
        job.status = "analyzing";
        job.progress = 50;
        job.stageMessage = "AI analyzing virality, extracting hooks & snapping word boundaries...";
        job.stageTimestamps.analyzing = { start: Date.now() };
        saveJobRecord(job);

        if (fs.existsSync(clipsCachePath)) {
          // CACHE HIT
          console.log(`[Cache: Hit] Reusing curated clips for sha256:${sourceHash.slice(0, 12)}...`);
          const cachedClips = JSON.parse(fs.readFileSync(clipsCachePath, "utf-8"));
          job.output.curatedClips = cachedClips;
          job.stageMessage = "Reused cached viral clip curation";
        } else {
          // CACHE MISS
          console.log(`[Cache: Miss] Curating new clips with LLM for sha256:${sourceHash.slice(0, 12)}...`);
          const transcription = job.output.transcription!;
          const rawClips = await analyzeTranscriptForViralClips({
            transcriptText: transcription.text,
            words: transcription.words,
            customPrompt: job.options.customPrompt,
          });

          // Precision word boundary snapping & overlap resolution
          const snapped = snapAndValidateClips(rawClips, transcription.words, {
            totalDuration: transcription.duration,
            minDuration: 5.0,
            maxDuration: 90.0,
          });

          job.output.curatedClips = snapped;
          // Write to cache
          fs.writeFileSync(clipsCachePath, JSON.stringify(snapped, null, 2), "utf-8");
          console.log(`[Cache: Stored] Saved ${snapped.length} curated clips to cache`);
        }

        job.stageTimestamps.analyzing.end = Date.now();
        saveJobRecord(job);
      }

      // -------------------------------------------------------------
      // Stage 4: Reframing & Rendering Top Clips (with Render Cache)
      // -------------------------------------------------------------
      const curatedClips = job.output.curatedClips || [];
      const maxClips = job.options.maxClipsToRender ?? 2;
      const clipsToRender = curatedClips.slice(0, maxClips);

      if (!job.output.renderedClips) {
        job.output.renderedClips = [];
      }

      job.status = "rendering";
      job.stageTimestamps.rendering = { start: Date.now() };

      const outputDir = path.join(process.cwd(), "public", "rendered_clips");
      if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

      for (let i = 0; i < clipsToRender.length; i++) {
        const clip = clipsToRender[i];

        // Check if already rendered in this job
        const alreadyRendered = job.output.renderedClips.find(
          (r) => Math.abs(r.startTime - clip.startTime) < 0.1
        );
        if (alreadyRendered) continue;

        job.progress = Math.round(50 + ((i + 1) / clipsToRender.length) * 45);
        job.stageMessage = `Rendering clip #${i + 1} of ${clipsToRender.length}: "${clip.title}"...`;
        saveJobRecord(job);

        const aspectRatio = job.options.aspectRatio || "9:16";
        const reframeMode = job.options.reframeMode || "auto-tracker";
        const captionStyle = job.options.captionStyle || "hormozi";

        // Render cache key: sha256(sourceHash:start:end:mode:captionStyle:aspectRatio)
        const renderKeyRaw = `${sourceHash}:${clip.startTime}:${clip.endTime}:${reframeMode}:${captionStyle}:${aspectRatio}`;
        const renderKey = crypto.createHash("sha256").update(renderKeyRaw).digest("hex");
        const renderCachePath = path.join(RENDERS_CACHE_DIR, `${renderKey}.json`);

        if (fs.existsSync(renderCachePath)) {
          // RENDER CACHE HIT
          try {
            const cachedRender = JSON.parse(fs.readFileSync(renderCachePath, "utf-8"));
            const cachedFilePath = path.join(process.cwd(), "public", "rendered_clips", cachedRender.filename);
            if (fs.existsSync(cachedFilePath)) {
              console.log(`[Cache: Hit] Render reused for clip "${clip.title}" (key: ${renderKey.slice(0, 10)})`);
              job.output.renderedClips.push(cachedRender);
              saveJobRecord(job);
              continue;
            }
          } catch {}
        }

        // RENDER CACHE MISS -> Precision Render
        console.log(`[Cache: Miss] Precision rendering clip "${clip.title}" [${clip.startTime}s - ${clip.endTime}s]...`);
        const outputFilename = `clip-${Date.now()}-${i + 1}.mp4`;
        const outputPath = path.join(outputDir, outputFilename);

        const exactDuration = Number((clip.endTime - clip.startTime).toFixed(2));
        const transcriptWords = (clip.snappedWords || []).map((w: any) => ({
          start: w.start,
          end: w.end,
          text: w.word,
        }));

        const renderRes = await renderVideoClip({
          inputPath: resolvedVideoPath,
          outputPath,
          startTime: clip.startTime,
          duration: exactDuration,
          aspectRatio,
          reframeMode,
          transcript: transcriptWords,
          headline: clip.hookHeadline || clip.title,
          captionStyle,
        });

        const renderedItem: RenderedClipItem = {
          clipId: `clip_${Date.now()}_${i + 1}`,
          title: clip.title,
          startTime: clip.startTime,
          endTime: clip.endTime,
          duration: exactDuration,
          downloadUrl: `/api/media?file=rendered_clips/${outputFilename}`,
          filename: outputFilename,
          viralityScore: clip.viralityScore || 90,
          hookHeadline: clip.hookHeadline || clip.title,
          trackingSummary: renderRes.tracking?.summary,
        };

        job.output.renderedClips.push(renderedItem);

        // Store render cache
        fs.writeFileSync(renderCachePath, JSON.stringify(renderedItem, null, 2), "utf-8");
        console.log(`[Cache: Stored] Cached render output for key: ${renderKey.slice(0, 10)}`);
        saveJobRecord(job);
      }

      job.stageTimestamps.rendering.end = Date.now();

      // -------------------------------------------------------------
      // Stage 5: Done & Periodic Cleanup
      // -------------------------------------------------------------
      job.status = "done";
      job.progress = 100;
      job.stageMessage = `Processing complete. ${job.output.renderedClips.length} viral clips ready!`;
      job.completedAt = Date.now();
      saveJobRecord(job);

      console.log(`[JobQueue] Job ${jobId} successfully completed in ${Date.now() - job.createdAt}ms`);

      // Run automatic 24h cleanup
      cleanupExpiredFiles(job.options.retentionHours ?? 24);
    } catch (err: any) {
      console.error(`[JobQueue] Job ${jobId} failed at stage ${job.status}:`, err.message);
      job.status = "failed";
      job.error = err.message || "An unexpected error occurred during processing";
      saveJobRecord(job);
    }
  }
}

// Global Singleton Queue Instance
const globalForJobQueue = globalThis as unknown as { jobQueueInstance?: JobQueueManager };
export const jobQueue = globalForJobQueue.jobQueueInstance || new JobQueueManager();
if (process.env.NODE_ENV !== "production") {
  globalForJobQueue.jobQueueInstance = jobQueue;
}
