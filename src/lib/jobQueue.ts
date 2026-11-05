import fs from "fs";
import path from "path";
import crypto from "crypto";
import { transcribeAudioFile } from "./transcriptionService";
import { analyzeTranscriptForViralClips, CuratedClipResult } from "./aiService";
import { snapAndValidateClips, SnappedClipResult } from "./wordSnapping";
import { probeVideoFormat } from "./videoService";
import { produceClip } from "./clipProducer";
import type { CaptionStyleName } from "./videoService";
import { normalizeClipStyle, ClipStyle } from "./clipStyle";
import { acquireJobLock, releaseJobLock } from "./jobLock";
import { resolveSafeFilePath, extractAudioForWhisper, generatePreviewClip, generatePosterImage, generateSourcePoster } from "./videoService";
import { downloadYoutubeVideo, normalizeUploadedVideo } from "./mediaPrep";


// Keep-range logic lives in ./timeline (shared with the editor); re-exported
// here because tests and older callers import it from the job queue.
export { isFillerWord, computeKeepRanges } from "./timeline";

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
  previewDownloadUrl?: string;
  posterUrl?: string;
  fileSize?: number;
  previewFileSize?: number;
  filename: string;
  viralityScore: number;
  hookHeadline: string;
  trackingSummary?: string;
  hookStrength?: number;
  engagementScore?: number;
  trendMatch?: number;
  description?: string;
  /** Kept parts of the source (source seconds) — the editor maps its word
   *  timeline onto the tightened video with these. */
  keepRanges?: { start: number; end: number }[];
  /** Clock changes from speed-up / freeze / intro / teaser (timeline.ts knots). */
  timeKnots?: [number, number][];
}

export interface JobOutput {
  fileId?: string;
  filePath?: string;
  // Set while the source still needs preparing in the worker:
  // an assembled-but-unconverted upload (converted, then deleted) ...
  rawUploadPath?: string;
  rawBaseName?: string;
  sourceSha256?: string;
  sourceWidth?: number;
  sourceHeight?: number;
  transcription?: {
    text: string;
    words: any[];
    segments: any[];
    duration: number;
    provider: string;
  };
  curatedClips?: SnappedClipResult[];
  renderedClips?: RenderedClipItem[];
  /** Editor re-renders saved into the project, by clip index. */
  editedClips?: Record<string, Record<string, unknown> & { editedAt: number }>;
}

export interface JobOptions {
  sourceType: "upload" | "youtube";
  youtubeUrl?: string;
  // ... or a YouTube link still to download (with optional per-job cookie
  // file under data/, deleted after the download, and proxy).
  cookieFile?: string;
  proxy?: string;
  fileName?: string;
  customPrompt?: string;
  aspectRatio?: "9:16" | "1:1" | "16:9";
  reframeMode?: "auto-tracker" | "split-screen" | "blurred-fit" | "center";
  captionStyle?: CaptionStyleName;
  removeSilences?: boolean; // tighten clips by cutting internal pauses > 0.55s
  maxClipsToRender?: number; // default MAX_CLIPS_TO_RENDER or 6 (all clips)
  retentionHours?: number; // default 24h
  // Per-job API keys from the user's own Settings (stored only in the on-disk
  // job record under data/, which is gitignored and never served; stripped
  // from API responses in /api/jobs/[id])
  groqKey?: string;
  openaiKey?: string;
  claudeKey?: string;
  preferredModel?: string;
  // Reference-style post effects (B-roll cutaways / punch zooms / music bed)
  broll?: boolean;
  musicBed?: boolean;
  hookTitle?: boolean; // hook headline card in the upper third (default on)
  keywordHighlights?: boolean; // colour AI key-phrase words in captions (default on)
  clipStyle?: Partial<ClipStyle>; // music mood, sfx, voice, grade, transitions, push-in
  captionFont?: string; // CAPTION_FONTS key
  pexelsKey?: string;
  pixabayKey?: string;
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
const USER_KEY_FIELDS = ["groqKey", "openaiKey", "claudeKey", "pexelsKey", "pixabayKey"] as const;

export function saveJobRecord(job: JobRecord): void {
  job.updatedAt = Date.now();
  // Users' own API keys are needed only while their job runs: never leave
  // them on the server's disk once it has finished or failed (a retry then
  // runs on the built-in key).
  if (job.status === "done" || job.status === "failed") {
    for (const k of USER_KEY_FIELDS) delete job.options[k];
  }
  const filePath = path.join(JOBS_DIR, `${job.id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(job, null, 2), "utf-8");
}

/**
 * Load job state from data/jobs/<id>.json
 */
export function getJobRecord(id: string): JobRecord | null {
  // basename(): a crafted id with ../ segments must not escape JOBS_DIR.
  const filePath = path.join(JOBS_DIR, `${path.basename(id)}.json`);
  if (!fs.existsSync(filePath)) return null;
  try {
    const data = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(data) as JobRecord;
  } catch (err) {
    console.warn(`[JobQueue] Failed to parse job ${id}:`, err);
    return null;
  }
}

export interface ProjectSummary {
  id: string;
  createdAt: number;
  title: string;
  source: string;
  clipCount: number;
  renderedCount: number;
  posterUrl?: string;
}

/**
 * Finished projects whose videos are still on disk (files expire after the
 * retention period), newest first — so clips survive a cleared browser or
 * a switch to another device.
 */
export function listRecentProjects(limit = 12): ProjectSummary[] {
  if (!fs.existsSync(JOBS_DIR)) return [];
  const out: ProjectSummary[] = [];
  for (const file of fs.readdirSync(JOBS_DIR)) {
    if (!file.endsWith(".json")) continue;
    try {
      const job = JSON.parse(fs.readFileSync(path.join(JOBS_DIR, file), "utf-8")) as JobRecord;
      if (job.status !== "done" || !job.output?.curatedClips?.length) continue;
      const src = job.output.filePath;
      if (!src || !fs.existsSync(src)) continue;
      const rendered = (job.output.renderedClips || []).filter((r) =>
        fs.existsSync(path.join(process.cwd(), "public", "rendered_clips", r.filename))
      );
      const first = job.output.curatedClips[0] as { title?: string; posterUrl?: string };
      out.push({
        id: job.id,
        createdAt: job.createdAt,
        title: String(first?.title || "Untitled project"),
        source: job.options.youtubeUrl || path.basename(job.output.fileId || src),
        clipCount: job.output.curatedClips.length,
        renderedCount: rendered.length,
        posterUrl: rendered[0]?.posterUrl || first?.posterUrl,
      });
    } catch {}
  }
  return out.sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
}

/** How long uploads, downloads and rendered clips are kept (FILE_RETENTION_HOURS, default 24h). */
export const retentionHours = () => Math.max(1, Number(process.env.FILE_RETENTION_HOURS) || 24);

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

  // Abandoned chunked-upload dirs (per-upload subdirectories of .part files)
  const chunkRoot = path.join(process.cwd(), "data", "chunk-uploads");
  if (fs.existsSync(chunkRoot)) {
    try {
      for (const entry of fs.readdirSync(chunkRoot)) {
        const fullPath = path.join(chunkRoot, entry);
        try {
          const stat = fs.statSync(fullPath);
          if (stat.isDirectory() && now - stat.mtimeMs > maxAgeMs) {
            fs.rmSync(fullPath, { recursive: true, force: true });
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
      // Jobs that were accepted but still waiting in the (in-memory) queue
      // when the server stopped. Nothing else would ever pick them up, and
      // the retry route refuses "uploaded" jobs, so re-queue them here.
      const pending: { id: string; createdAt: number }[] = [];

      for (const file of files) {
        if (!file.endsWith(".json")) continue;
        try {
          const filePath = path.join(JOBS_DIR, file);
          const job = JSON.parse(fs.readFileSync(filePath, "utf-8")) as JobRecord;
          const runningStatuses: JobStatus[] = ["transcribing", "analyzing", "reframing", "rendering"];

          if (job.status === "uploaded" && !this.queue.includes(job.id) && this.activeJobId !== job.id) {
            pending.push({ id: job.id, createdAt: job.createdAt || 0 });
          } else if (runningStatuses.includes(job.status) && acquireJobLock(job.id)) {
            // Only when no live worker holds it — another copy of this
            // module (or process) may be running the job right now.
            releaseJobLock(job.id);
            job.status = "failed";
            job.error = "Server restarted during processing. Click retry to resume from the last completed stage.";
            saveJobRecord(job);
            recoveredCount++;
          }
        } catch {}
      }

      if (recoveredCount > 0) {
        console.log(`[JobQueue: Recovery] Marked ${recoveredCount} interrupted jobs as failed on startup`);
      }

      if (pending.length > 0) {
        pending.sort((a, b) => a.createdAt - b.createdAt);
        for (const p of pending) this.queue.push(p.id);
        console.log(`[JobQueue: Recovery] Re-queued ${pending.length} job(s) that were waiting when the server stopped`);
        // Defer so the singleton finishes constructing before work starts.
        setTimeout(() => this.processNext(), 0);
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

  public isQueuedOrActive(jobId: string): boolean {
    return this.activeJobId === jobId || this.queue.includes(jobId);
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
    if (!acquireJobLock(jobId)) {
      console.log(`[JobQueue] Job ${jobId} is already being run by another worker; skipping`);
      this.isProcessing = false;
      this.processNext();
      return;
    }
    this.activeJobId = jobId;

    try {
      await this.runJobPipeline(jobId);
    } catch (err: any) {
      console.error(`[JobQueue] Unexpected error running job ${jobId}:`, err);
    } finally {
      releaseJobLock(jobId);
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
      // Stage 0: Source preparation (download / convert) — runs here, in
      // the worker, so no HTTP request has to stay open for minutes.
      // -------------------------------------------------------------
      if (!job.output.filePath && !job.output.fileId) {
        job.stageTimestamps.preparing = { start: Date.now() };
        if (job.output.rawUploadPath) {
          job.progress = 8;
          job.stageMessage = "Converting your upload to a web-ready MP4...";
          saveJobRecord(job);
          const raw = resolveSafeFilePath(job.output.rawUploadPath);
          if (!fs.existsSync(raw)) {
            throw new Error("The uploaded file is missing on the server (it may have expired). Please upload it again.");
          }
          const prepared = await normalizeUploadedVideo(raw, job.output.rawBaseName || path.parse(raw).name.replace(/^raw-/, ""));
          job.output.filePath = prepared.filePath;
          job.output.fileId = prepared.fileId;
          delete job.output.rawUploadPath;
          delete job.output.rawBaseName;
        } else if (job.options.youtubeUrl) {
          job.progress = 8;
          job.stageMessage = "Downloading the video from YouTube...";
          saveJobRecord(job);
          try {
            const dl = await downloadYoutubeVideo({
              url: job.options.youtubeUrl,
              cookieFile: job.options.cookieFile,
              proxy: job.options.proxy,
            });
            job.output.filePath = dl.filePath;
            job.output.fileId = dl.fileId;
          } finally {
            if (job.options.cookieFile) {
              try { fs.unlinkSync(job.options.cookieFile); } catch {}
              delete job.options.cookieFile;
            }
          }
        }
        job.stageTimestamps.preparing.end = Date.now();
        saveJobRecord(job);
      }

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

      if (!job.output.sourceHeight) {
        try {
          const info = await probeVideoFormat(resolvedVideoPath);
          if (info.width) job.output.sourceWidth = info.width;
          if (info.height) job.output.sourceHeight = info.height;
        } catch {}
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
          const transcriptResult = await transcribeAudioFile(targetAudio, {
            groqKey: job.options.groqKey,
            openaiKey: job.options.openaiKey,
          });

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
      // v2: snappedWords are source-absolute (v1 cached entries stored them
      // clip-relative, which stripped captions from most clips on reuse).
      const clipsCachePath = path.join(CLIPS_CACHE_DIR, `${sourceHash}-${promptHash}-v2.json`);

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
            segments: transcription.segments,
            customPrompt: job.options.customPrompt,
            model: job.options.preferredModel,
            openaiKey: job.options.openaiKey,
            claudeKey: job.options.claudeKey,
            groqKey: job.options.groqKey,
          });

          // Precision word boundary snapping & overlap resolution
          const snapped = snapAndValidateClips(rawClips, transcription.words, {
            totalDuration: transcription.duration,
            minDuration: 5.0,
            maxDuration: 90.0,
          });

          if (snapped.length === 0) {
            throw new Error(
              "AI curation produced no usable clips from this transcript. Try again, or use a more specific prompt."
            );
          }

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
      const maxClips = job.options.maxClipsToRender ?? (Number(process.env.MAX_CLIPS_TO_RENDER) || 6);
      const clipsToRender = curatedClips.slice(0, maxClips);

      if (!job.output.renderedClips) {
        job.output.renderedClips = [];
      }

      job.status = "rendering";
      job.stageTimestamps.rendering = { start: Date.now() };

      const outputDir = path.join(process.cwd(), "public", "rendered_clips");
      if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });

      // Thumbnails for every clip up front: a frame of the source, so the
      // clips still waiting to render (they now appear one by one) aren't
      // black boxes. Rendered clips switch to their own poster.
      for (let ci = 0; ci < (job.output.curatedClips || []).length; ci++) {
        const c: any = job.output.curatedClips![ci];
        if (c.posterUrl || job.output.renderedClips.some((r) => Math.abs(r.startTime - c.startTime) < 0.1)) continue;
        const name = await generateSourcePoster(resolvedVideoPath, c.startTime + 1, `${job.id.slice(4, 16)}-${ci}`).catch(() => null);
        if (name) c.posterUrl = `/api/media?file=rendered_clips/${name}`;
      }
      saveJobRecord(job);

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
        const renderKeyRaw = `${sourceHash}:${clip.startTime}:${clip.endTime}:${reframeMode}:${captionStyle}:${aspectRatio}:${job.options.removeSilences ? "tight2" : "full"}:fx${job.options.broll ? "b" : ""}${job.options.musicBed ? "m" : ""}:v3${job.options.hookTitle === false ? "" : "h"}${job.options.keywordHighlights === false ? "" : "k"}:s${JSON.stringify(normalizeClipStyle(job.options.clipStyle))}:f${job.options.captionFont || ""}`;
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
        let transcriptWords = (clip.snappedWords || []).map((w: any) => ({
          start: w.start,
          end: w.end,
          text: w.word,
        }));

        // Snapping can return a clip with no words (e.g. boundaries landed
        // in a pause). Rendering with an empty transcript produces a clip
        // with NO captions at all — fall back to the full transcription's
        // words inside the clip window so captions always burn.
        if (transcriptWords.length < 3 && job.output.transcription?.words?.length) {
          const fallbackWords = job.output.transcription.words
            .filter((w: any) => w.end > clip.startTime && w.start < clip.endTime)
            .map((w: any) => ({
              start: w.start,
              end: w.end,
              text: w.word || w.text,
            }));
          if (fallbackWords.length > transcriptWords.length) {
            console.log(
              `[Stage: Render] Clip "${clip.title}": snappedWords had ${transcriptWords.length} word(s); using ${fallbackWords.length} transcription words for captions`
            );
            transcriptWords = fallbackWords;
          }
        }

        // One shared path (also used by the editor and downloads): render
        // once, cut pauses/fillers, then B-roll / zooms / music and captions.
        const produced = await produceClip({
          inputPath: resolvedVideoPath,
          outputPath,
          startTime: clip.startTime,
          endTime: clip.endTime,
          words: transcriptWords,
          aspectRatio,
          reframeMode,
          captionStyle,
          headline: clip.hookHeadline || clip.title,
          hookTitle: job.options.hookTitle !== false,
          keywords: job.options.keywordHighlights === false ? null : (clip as any).keyPhrases || [],
          style: job.options.clipStyle,
          captionFont: job.options.captionFont,
          removeSilences: Boolean(job.options.removeSilences),
          broll: Boolean(job.options.broll),
          musicBed: Boolean(job.options.musicBed),
          keys: {
            groqKey: job.options.groqKey,
            openaiKey: job.options.openaiKey,
            claudeKey: job.options.claudeKey,
            pexelsKey: job.options.pexelsKey,
            pixabayKey: job.options.pixabayKey,
          },
          brollTag: `broll-${job.id.slice(5, 13)}-${i + 1}`,
        });
        const finalDuration = produced.duration;
        const tightened = produced.keepRanges.length > 1 || finalDuration < exactDuration - 0.1;
        if (tightened) {
          console.log(
            `[Stage: Silence Removal] Clip "${clip.title}": ${exactDuration}s -> ${finalDuration}s across ${produced.keepRanges.length} keep-range(s), tracked once`
          );
        }

        // Lightweight preview rendition for smooth in-browser playback;
        // the master above stays the download quality. Never fatal.
        const previewName = await generatePreviewClip(outputPath).catch(() => null);
        const posterName = await generatePosterImage(outputPath).catch(() => null);

        const renderedItem: RenderedClipItem = {
          clipId: `clip_${Date.now()}_${i + 1}`,
          title: clip.title,
          startTime: clip.startTime,
          endTime: clip.endTime,
          duration: finalDuration,
          downloadUrl: `/api/media?file=rendered_clips/${outputFilename}`,
          previewDownloadUrl: previewName
            ? `/api/media?file=rendered_clips/${previewName}`
            : undefined,
          posterUrl: posterName
            ? `/api/media?file=rendered_clips/${posterName}`
            : undefined,
          fileSize: (() => { try { return fs.statSync(outputPath).size; } catch { return undefined; } })(),
          previewFileSize: (() => {
            try {
              return previewName ? fs.statSync(path.join(path.dirname(outputPath), previewName)).size : undefined;
            } catch { return undefined; }
          })(),
          filename: outputFilename,
          viralityScore: clip.viralityScore || 90,
          hookHeadline: clip.hookHeadline || clip.title,
          trackingSummary:
            [
              produced.tracking?.summary,
              produced.fxSummary,
              tightened
                ? `✂ Tightened: ${exactDuration}s → ${finalDuration}s${produced.fillersRemoved > 0 ? ` (${produced.fillersRemoved} filler${produced.fillersRemoved === 1 ? "" : "s"} cut)` : ""}`
                : "",
            ]
              .filter(Boolean)
              .join(" · ") || undefined,
          keepRanges: produced.keepRanges,
          timeKnots: produced.timeKnots,
          hookStrength: clip.hookStrength,
          engagementScore: clip.engagementScore,
          trendMatch: clip.trendMatch,
          description: clip.description,
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
      cleanupExpiredFiles(job.options.retentionHours ?? retentionHours());
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
// Kept on globalThis in production too: route bundles can each carry a copy
// of this module, and every extra instance would re-queue waiting jobs.
export const jobQueue = globalForJobQueue.jobQueueInstance || new JobQueueManager();
globalForJobQueue.jobQueueInstance = jobQueue;
