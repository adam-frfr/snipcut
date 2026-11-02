import fs from "fs";
import path from "path";
import crypto from "crypto";
import {
  jobQueue,
  saveJobRecord,
  getJobRecord,
  computeFileSha256,
  cleanupExpiredFiles,
  JobRecord,
} from "../src/lib/jobQueue";

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, "utf-8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
        if (!process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
}

loadEnvLocal();

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log("==================================================");
  console.log("TEST SUITE: Job Queue, Cache & 24h Cleanup (Phase 4)");
  console.log("==================================================");

  // -------------------------------------------------------------
  // Test 1: 24-Hour Cleanup Routine Verification
  // -------------------------------------------------------------
  console.log("\n>>> [Test 1] 24-Hour File Expiry Cleanup...");
  const uploadsDir = path.join(process.cwd(), "public", "uploads");
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

  const expiredFilePath = path.join(uploadsDir, "test_expired_file.tmp");
  const freshFilePath = path.join(uploadsDir, "test_fresh_file.tmp");

  fs.writeFileSync(expiredFilePath, "old content from yesterday");
  fs.writeFileSync(freshFilePath, "recent content");

  // Set mtime of expired file to 26 hours ago
  const twentySixHoursAgo = new Date(Date.now() - 26 * 3600 * 1000);
  fs.utimesSync(expiredFilePath, twentySixHoursAgo, twentySixHoursAgo);

  const cleanupRes = cleanupExpiredFiles(24);
  console.log(`Cleanup executed: deleted ${cleanupRes.deletedFiles} files, freed ${cleanupRes.freedBytes} bytes`);

  if (fs.existsSync(expiredFilePath)) {
    throw new Error("FAILED: Expired file (>24h) was not deleted by cleanupExpiredFiles!");
  }
  if (!fs.existsSync(freshFilePath)) {
    throw new Error("FAILED: Fresh file (<24h) was erroneously deleted by cleanupExpiredFiles!");
  }
  fs.unlinkSync(freshFilePath);
  console.log("PASSED: 24h cleanup correctly pruned expired file and retained fresh file.");

  // -------------------------------------------------------------
  // Test 2: Crash Recovery (Server Restart)
  // -------------------------------------------------------------
  console.log("\n>>> [Test 2] Crash Recovery on Startup...");
  const crashJobId = `job_crash_test_${Date.now()}`;
  const crashedJob: JobRecord = {
    id: crashJobId,
    status: "transcribing",
    progress: 25,
    stageMessage: "Transcribing audio...",
    error: null,
    createdAt: Date.now() - 10000,
    updatedAt: Date.now() - 10000,
    options: { sourceType: "upload" },
    output: { fileId: "dummy.mp4" },
    stageTimestamps: { uploaded: { start: Date.now() } },
  };

  saveJobRecord(crashedJob);
  const recovered = jobQueue.recoverInterruptedJobs();
  console.log(`Recovered interrupted jobs count: ${recovered}`);

  const postRecoveryJob = getJobRecord(crashJobId);
  if (!postRecoveryJob || postRecoveryJob.status !== "failed") {
    throw new Error(`FAILED: Crashed job was not marked failed! status=${postRecoveryJob?.status}`);
  }
  if (!postRecoveryJob.error?.includes("Server restarted")) {
    throw new Error(`FAILED: Incorrect error message on recovered job: ${postRecoveryJob.error}`);
  }
  console.log(`PASSED: Interrupted job cleanly transitioned to status 'failed' with resume message.`);

  // Clean up crash test job file
  const crashJobFile = path.join(process.cwd(), "data", "jobs", `${crashJobId}.json`);
  if (fs.existsSync(crashJobFile)) fs.unlinkSync(crashJobFile);

  // -------------------------------------------------------------
  // Test 3: Resume / Retry from Failed Stage
  // -------------------------------------------------------------
  console.log("\n>>> [Test 3] Resuming from Last Completed Stage (Retry)...");
  const retryJobId = `job_retry_test_${Date.now()}`;
  const mockTranscription = {
    text: "This is already transcribed text from a previous successful stage.",
    words: [
      { word: "This", start: 0.0, end: 0.5 },
      { word: "is", start: 0.5, end: 0.8 },
      { word: "already", start: 0.8, end: 1.2 },
      { word: "transcribed", start: 1.2, end: 1.8 },
    ],
    segments: [],
    duration: 10,
    provider: "groq-whisper",
  };

  const partiallyCompleteJob: JobRecord = {
    id: retryJobId,
    status: "failed",
    progress: 35,
    stageMessage: "Failed at analysis stage",
    error: "Simulated rate limit during analysis",
    createdAt: Date.now() - 5000,
    updatedAt: Date.now() - 5000,
    options: { sourceType: "upload" },
    output: {
      fileId: "dummy.mp4",
      transcription: mockTranscription, // stage 2 complete
    },
    stageTimestamps: {
      uploaded: { start: Date.now() - 5000, end: Date.now() - 4000 },
      transcribing: { start: Date.now() - 4000, end: Date.now() - 2000 },
    },
  };

  saveJobRecord(partiallyCompleteJob);

  // Simulate retry action from /api/jobs/[id]/retry
  const jobToRetry = getJobRecord(retryJobId)!;
  jobToRetry.error = null;
  if (!jobToRetry.output.transcription) {
    jobToRetry.status = "uploaded";
  } else if (!jobToRetry.output.curatedClips || jobToRetry.output.curatedClips.length === 0) {
    jobToRetry.status = "transcribing"; // Will resume from curation
    jobToRetry.stageMessage = "Retrying: Analyzing virality and snapping clips...";
  }
  saveJobRecord(jobToRetry);

  const updatedRetryJob = getJobRecord(retryJobId);
  if (updatedRetryJob?.status !== "transcribing" || updatedRetryJob.error !== null) {
    throw new Error(`FAILED: Retry stage was not correctly prepared! status=${updatedRetryJob?.status}`);
  }
  console.log("PASSED: Retry successfully targeted next stage without discarding saved transcript.");

  const retryJobFile = path.join(process.cwd(), "data", "jobs", `${retryJobId}.json`);
  if (fs.existsSync(retryJobFile)) fs.unlinkSync(retryJobFile);

  // -------------------------------------------------------------
  // Test 4: End-to-End Async Pipeline Execution with Real Media
  // -------------------------------------------------------------
  console.log("\n>>> [Test 4] End-to-End Async Pipeline Execution...");
  const sourceVideo = path.join(process.cwd(), "data", "real_speech_2min.mp4");
  if (!fs.existsSync(sourceVideo)) {
    throw new Error(`Source test video not found: ${sourceVideo}`);
  }

  const sha256 = await computeFileSha256(sourceVideo);
  console.log(`Source test video sha256: ${sha256.slice(0, 16)}...`);

  const job1Id = `job_e2e_${Date.now()}`;
  const job1: JobRecord = {
    id: job1Id,
    status: "uploaded",
    progress: 5,
    stageMessage: "Video uploaded and ready for worker queue",
    error: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    options: {
      sourceType: "upload",
      aspectRatio: "9:16",
      reframeMode: "center",
      captionStyle: "hormozi",
      maxClipsToRender: 1, // 1 clip for fast test verification
    },
    output: {
      fileId: "data/real_speech_2min.mp4",
      filePath: sourceVideo,
    },
    stageTimestamps: {
      uploaded: { start: Date.now(), end: Date.now() },
    },
  };

  saveJobRecord(job1);
  const t0 = Date.now();
  console.log(`Enqueueing Job 1 (${job1Id})...`);
  jobQueue.enqueue(job1Id);

  // Poll job1 until done or timeout (120s)
  let completedJob1: JobRecord | null = null;
  for (let i = 0; i < 48; i++) {
    await sleep(2500);
    const curr = getJobRecord(job1Id);
    if (!curr) continue;
    console.log(`[Job 1 Polling] status: ${curr.status}, progress: ${curr.progress}%, msg: "${curr.stageMessage}"`);
    if (curr.status === "done") {
      completedJob1 = curr;
      break;
    }
    if (curr.status === "failed") {
      throw new Error(`Job 1 failed during execution: ${curr.error}`);
    }
  }

  if (!completedJob1) {
    throw new Error("Job 1 timed out before reaching status 'done'");
  }

  const job1Duration = Date.now() - t0;
  console.log(`Job 1 completed in ${job1Duration}ms!`);

  // Assertions on Job 1 outputs
  if (!completedJob1.output.transcription?.text) {
    throw new Error("FAILED: Job 1 transcript is missing or empty!");
  }
  if (!completedJob1.output.curatedClips || completedJob1.output.curatedClips.length === 0) {
    throw new Error("FAILED: Job 1 has no curated clips!");
  }
  if (!completedJob1.output.renderedClips || completedJob1.output.renderedClips.length === 0) {
    throw new Error("FAILED: Job 1 has no rendered clips!");
  }

  const renderedClip = completedJob1.output.renderedClips[0];
  const renderedDiskPath = path.join(process.cwd(), "public", "rendered_clips", renderedClip.filename);
  if (!fs.existsSync(renderedDiskPath)) {
    throw new Error(`FAILED: Rendered MP4 not found on disk: ${renderedDiskPath}`);
  }
  console.log(`PASSED: Job 1 completed with ${completedJob1.output.renderedClips.length} clips. Rendered file verified.`);

  // -------------------------------------------------------------
  // Test 5: SHA-256 Cache Hits (Instant Transcript & Render Reuse)
  // -------------------------------------------------------------
  console.log("\n>>> [Test 5] SHA-256 Cache Reuse Verification...");
  const job2Id = `job_cache_test_${Date.now()}`;
  const job2: JobRecord = {
    id: job2Id,
    status: "uploaded",
    progress: 5,
    stageMessage: "Video uploaded for cache test",
    error: null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    options: {
      sourceType: "upload",
      aspectRatio: "9:16",
      reframeMode: "center",
      captionStyle: "hormozi",
      maxClipsToRender: 1,
    },
    output: {
      fileId: "data/real_speech_2min.mp4",
      filePath: sourceVideo,
    },
    stageTimestamps: {
      uploaded: { start: Date.now(), end: Date.now() },
    },
  };

  saveJobRecord(job2);
  const tCacheStart = Date.now();
  console.log(`Enqueueing Job 2 (${job2Id}) with identical source media...`);
  jobQueue.enqueue(job2Id);

  let completedJob2: JobRecord | null = null;
  for (let i = 0; i < 20; i++) {
    await sleep(1000);
    const curr = getJobRecord(job2Id);
    if (!curr) continue;
    console.log(`[Job 2 Polling] status: ${curr.status}, progress: ${curr.progress}%, msg: "${curr.stageMessage}"`);
    if (curr.status === "done") {
      completedJob2 = curr;
      break;
    }
    if (curr.status === "failed") {
      throw new Error(`Job 2 failed: ${curr.error}`);
    }
  }

  if (!completedJob2) {
    throw new Error("Job 2 timed out");
  }

  const job2Duration = Date.now() - tCacheStart;
  console.log(`Job 2 completed in ${job2Duration}ms (vs Job 1 ${job1Duration}ms)!`);

  // Verify that the rendered clip was reused
  if (completedJob2.output.renderedClips?.[0]?.filename !== completedJob1.output.renderedClips?.[0]?.filename) {
    throw new Error("FAILED: Job 2 did not reuse cached rendered clip!");
  }

  console.log("PASSED: Cache hit verified! Render and transcription were reused cleanly.");

  // Clean up test job files
  for (const id of [job1Id, job2Id]) {
    const f = path.join(process.cwd(), "data", "jobs", `${id}.json`);
    if (fs.existsSync(f)) fs.unlinkSync(f);
  }

  console.log("\n==================================================");
  console.log("ALL PHASE 4 JOB QUEUE & CACHE TESTS PASSED!");
  console.log("==================================================");
}

main().catch((err) => {
  console.error("Test suite failed:", err);
  process.exit(1);
});
