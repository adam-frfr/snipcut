import fs from "fs";
import path from "path";
import crypto from "crypto";
import { transcribeAudioFile } from "./transcriptionService";
import { analyzeTranscriptForViralClips, CuratedClipResult } from "./aiService";
import { snapAndValidateClips, SnappedClipResult } from "./wordSnapping";
import { buildSentences, planBroll, fetchBrollAssets } from "./brollService";
import { applyPostEffects } from "./videoService";
import { renderVideoClip, resolveSafeFilePath, extractAudioForWhisper, getFfmpegBinary, generatePreviewClip, generatePosterImage } from "./videoService";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

const FILLER_WORDS = new Set([
  "um", "umm", "uh", "uhh", "er", "erm", "hmm", "mm", "mhm", "uhm", "eh",
]);

export function isFillerWord(text: string): boolean {
  const clean = String(text || "").toLowerCase().replace(/[^a-z]/g, "");
  return FILLER_WORDS.has(clean);
}

/**
 * Keep-ranges for silence/filler removal: span from just before the first
 * real word to just after the last one, splitting wherever the gap between
 * consecutive words exceeds 0.55s (keeping a small breath of padding around
 * each cut) and cutting standalone filler words (um, uh, er...) entirely.
 * Returns the ranges plus how many fillers were cut.
 */
export function computeKeepRanges(
  words: { start: number; end: number; word?: string; text?: string }[],
  clipStart: number,
  clipEnd: number
): { ranges: { start: number; end: number }[]; fillersRemoved: number } {
  const ws = (words || [])
    .filter((w) => w.end > clipStart && w.start < clipEnd)
    .sort((a, b) => a.start - b.start);
  if (ws.length === 0) return { ranges: [], fillersRemoved: 0 };
  const ranges: { start: number; end: number }[] = [];
  let fillersRemoved = 0;
  let rangeStart: number | null = null;
  let prevEnd = 0;
  const closeRange = (end: number) => {
    if (rangeStart !== null) {
      ranges.push({ start: rangeStart, end: Math.min(clipEnd, end) });
      rangeStart = null;
    }
  };
  for (const w of ws) {
    if (isFillerWord(w.word || w.text || "")) {
      fillersRemoved++;
      closeRange(prevEnd + 0.08);
      prevEnd = w.end;
      continue;
    }
    if (rangeStart === null) {
      rangeStart = Math.max(clipStart, w.start - (ranges.length === 0 && fillersRemoved === 0 ? 0.1 : 0.12));
    } else if (w.start - prevEnd > 0.55) {
      closeRange(prevEnd + 0.15);
      rangeStart = Math.max(clipStart, w.start - 0.12);
    }
    prevEnd = Math.max(prevEnd, w.end);
  }
  closeRange(prevEnd + 0.18);
  // 0.25s floor: anything shorter is encoder noise, but a lone real word
  // (e.g. "So" before an "um") legitimately forms a ~0.35s segment and
  // must never be dropped.
  return { ranges: ranges.filter((r) => r.end - r.start >= 0.25), fillersRemoved };
}

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
  filename: string;
  viralityScore: number;
  hookHeadline: string;
  trackingSummary?: string;
  hookStrength?: number;
  engagementScore?: number;
  trendMatch?: number;
  description?: string;
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
  captionStyle?: "hormozi" | "neon" | "beast" | "clean" | "kinetic";
  removeSilences?: boolean; // tighten clips by cutting internal pauses > 0.55s
  maxClipsToRender?: number; // default 2
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
  pexelsKey?: string;
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
        const renderKeyRaw = `${sourceHash}:${clip.startTime}:${clip.endTime}:${reframeMode}:${captionStyle}:${aspectRatio}:${job.options.removeSilences ? "tight2" : "full"}:fx${job.options.broll ? "b" : ""}${job.options.musicBed ? "m" : ""}`;
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

        // Silence removal: render only the keep-ranges (speech with small
        // breaths) and concatenate them into one tightened clip.
        let renderRes: Awaited<ReturnType<typeof renderVideoClip>> | null = null;
        let fxSummary: string | undefined;
        let finalDuration = exactDuration;
        const keep = job.options.removeSilences
          ? computeKeepRanges(clip.snappedWords || [], clip.startTime, clip.endTime)
          : { ranges: [] as { start: number; end: number }[], fillersRemoved: 0 };
        const keepRanges = keep.ranges;
        const keptDuration = keepRanges.reduce((s, r) => s + (r.end - r.start), 0);
        const tightening =
          keepRanges.length > 0 &&
          (keepRanges.length > 1 || keptDuration < exactDuration * 0.92 || keep.fillersRemoved > 0);

        if (tightening) {
          const partPaths: string[] = [];
          try {
            for (let pi = 0; pi < keepRanges.length; pi++) {
              const range = keepRanges[pi];
              const partPath = path.join(outputDir, `part-${Date.now()}-${i + 1}-${pi}.mp4`);
              const partRes = await renderVideoClip({
                inputPath: resolvedVideoPath,
                outputPath: partPath,
                startTime: range.start,
                duration: Number((range.end - range.start).toFixed(2)),
                aspectRatio,
                reframeMode,
                transcript: transcriptWords,
                headline: clip.hookHeadline || clip.title,
                captionStyle,
              });
              if (!renderRes) renderRes = partRes;
              partPaths.push(partPath);
            }
            const listPath = path.join(outputDir, `concat-${Date.now()}-${i + 1}.txt`);
            fs.writeFileSync(
              listPath,
              partPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join("\n"),
              "utf-8"
            );
            await execFileAsync(getFfmpegBinary(), [
              "-y", "-f", "concat", "-safe", "0", "-i", listPath,
              "-c:v", "libx264", "-preset", "veryfast", "-crf", "20",
              "-c:a", "aac", "-movflags", "+faststart", outputPath,
            ], { maxBuffer: 64 * 1024 * 1024 });
            try { fs.unlinkSync(listPath); } catch {}
            finalDuration = Number(keptDuration.toFixed(2));
            console.log(
              `[Stage: Silence Removal] Clip "${clip.title}": ${exactDuration}s -> ${finalDuration}s across ${keepRanges.length} keep-range(s)`
            );
          } finally {
            for (const p of partPaths) {
              try { fs.unlinkSync(p); } catch {}
            }
          }
        }

        if (!renderRes) {
          // Post effects (B-roll / music / punch zooms) need a caption-less
          // base: captions are burned in the composite pass so they sit on
          // top of the cutaways. Silence-tightened clips skip FX (their
          // timeline is re-cut, so cue timings would drift).
          const fxOn = Boolean(job.options.broll || job.options.musicBed);
          let fxApplied = false;
          if (fxOn) {
            const basePath = path.join(outputDir, `base-${outputFilename}`);
            try {
              renderRes = await renderVideoClip({
                inputPath: resolvedVideoPath,
                outputPath: basePath,
                startTime: clip.startTime,
                duration: exactDuration,
                aspectRatio,
                reframeMode,
                transcript: transcriptWords,
                headline: clip.hookHeadline || clip.title,
                captionStyle,
                skipCaptions: true,
              });

              const relWords = transcriptWords.map((w) => ({
                start: Math.max(0, Number((w.start - clip.startTime).toFixed(2))),
                end: Math.max(0.05, Number((w.end - clip.startTime).toFixed(2))),
                text: w.text,
              }));

              let cues: { start: number; end: number; assetPath: string; kind: "image" | "video" }[] = [];
              if (job.options.broll && job.output.transcription?.segments?.length) {
                const sentences = buildSentences(job.output.transcription.segments, clip.startTime, clip.endTime);
                const plan = await planBroll(sentences, {
                  groqKey: job.options.groqKey,
                  openaiKey: job.options.openaiKey,
                  claudeKey: job.options.claudeKey,
                });
                if (plan.length > 0) {
                  const assets = await fetchBrollAssets(plan, {
                    pexelsKey: job.options.pexelsKey,
                    destDir: path.join(process.cwd(), "data", "broll"),
                    tag: `broll-${job.id.slice(5, 13)}-${i + 1}`,
                  });
                  cues = assets.map((a) => ({ start: a.start, end: a.end, assetPath: a.assetPath, kind: a.kind }));
                }
              }

              // Punch-in zooms on emphasis words (long / digit-bearing),
              // max 3, spaced out.
              const punches: { start: number; end: number }[] = [];
              for (const w of relWords) {
                const clean = w.text.replace(/[^A-Za-z0-9]/g, "");
                if (clean.length < 8 && !/\d/.test(clean)) continue;
                if (punches.length > 0 && w.start - punches[punches.length - 1].start < 2.4) continue;
                punches.push({ start: Math.max(0, w.start - 0.05), end: w.start + 0.85 });
                if (punches.length >= 3) break;
              }

              await applyPostEffects({
                basePath,
                outputPath,
                duration: exactDuration,
                aspectRatio,
                words: relWords,
                captionStyle,
                broll: cues,
                punches,
                musicBed: Boolean(job.options.musicBed),
              });
              fxApplied = true;
              fxSummary = `🎬 Reference FX: ${cues.length} B-roll cutaway${cues.length === 1 ? "" : "s"}, ${punches.length} punch zoom${punches.length === 1 ? "" : "s"}${job.options.musicBed ? ", music bed" : ""}`;
            } catch (fxErr) {
              console.warn(`[PostFX] Failed for clip "${clip.title}"; falling back to a standard captioned render:`, fxErr);
            } finally {
              try { fs.unlinkSync(basePath); } catch {}
            }
          }
          if (!fxApplied) {
            renderRes = await renderVideoClip({
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
          }
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
          filename: outputFilename,
          viralityScore: clip.viralityScore || 90,
          hookHeadline: clip.hookHeadline || clip.title,
          trackingSummary: tightening
            ? `${renderRes?.tracking?.summary || ""} · ✂ Tightened: ${exactDuration}s → ${finalDuration}s${keep.fillersRemoved > 0 ? ` (${keep.fillersRemoved} filler${keep.fillersRemoved === 1 ? "" : "s"} cut)` : ""}`
            : [renderRes?.tracking?.summary, fxSummary].filter(Boolean).join(" · ") || undefined,
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
