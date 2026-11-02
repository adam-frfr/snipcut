import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import util from "util";
import OpenAI from "openai";
import {
  splitAudioIntoChunks,
  mergeAndDeduplicateChunkTranscripts,
  probeAudioDuration,
} from "../src/lib/groqChunking";

if (fs.existsSync(".env.local")) {
  const envContent = fs.readFileSync(".env.local", "utf-8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

const execFilePromise = util.promisify(execFile);

async function testForcedChunkingDiff() {
  console.log("=== Testing Forced 60s Audio Chunking & Diff on Real Speech (Item 5) ===");

  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) throw new Error("GROQ_API_KEY is required in .env.local");

  const groq = new OpenAI({
    apiKey: groqKey,
    baseURL: "https://api.groq.com/openai/v1",
  });

  const videoPath = path.join(process.cwd(), "data", "real_speech_2min.mp4");
  const audioDir = path.join(process.cwd(), "data", "test_chunking_diff");
  if (!fs.existsSync(audioDir)) fs.mkdirSync(audioDir, { recursive: true });

  const ffmpegBin = path.join(process.cwd(), "bin", "ffmpeg.exe");
  const extractedAudio = path.join(audioDir, "full_audio.mp3");

  console.log("\n[Step 1] Extracting full MP3 audio for 130s speech video...");
  await execFilePromise(ffmpegBin, [
    "-y",
    "-i", videoPath,
    "-vn",
    "-c:a", "libmp3lame",
    "-b:a", "128k",
    extractedAudio,
  ]);

  const totalDuration = await probeAudioDuration(extractedAudio);
  console.log(`Audio extracted: ${extractedAudio} (${totalDuration.toFixed(2)}s, ${fs.statSync(extractedAudio).size} bytes)`);

  // Step 2: Unchunked transcription
  console.log("\n[Step 2] Transcribing full audio (Unchunked Baseline)...");
  const unchunkedRes = await groq.audio.transcriptions.create({
    file: fs.createReadStream(extractedAudio) as any,
    model: "whisper-large-v3-turbo",
    response_format: "verbose_json",
    timestamp_granularities: ["word", "segment"],
  } as any) as any;

  const unchunkedWords = (unchunkedRes.words || []).map((w: any) => ({
    word: w.word.trim(),
    start: Number(w.start.toFixed(2)),
    end: Number(w.end.toFixed(2)),
  }));
  console.log(`Unchunked transcription complete: ${unchunkedWords.length} words.`);

  // Step 3: Force chunking at 60s threshold
  console.log("\n[Step 3] Forcing chunking at 60s threshold (with 1.0s overlap)...");
  const chunks = await splitAudioIntoChunks({
    audioPath: extractedAudio,
    totalDuration,
    chunkDurationSec: 60,
    overlapSec: 1.0,
    outputDir: audioDir,
  });

  console.log(`Generated ${chunks.length} chunks:`);
  for (const c of chunks) {
    console.log(`  Chunk #${c.index + 1}: ${c.chunkPath} (start: ${c.startTime.toFixed(2)}s, duration: ${c.duration.toFixed(2)}s)`);
  }

  // Step 4: Transcribe each chunk
  console.log("\n[Step 4] Transcribing each chunk with Groq Whisper...");
  const chunkOutputs = [];
  for (const c of chunks) {
    console.log(`Transcribing chunk #${c.index + 1} (${path.basename(c.chunkPath)})...`);
    const res = await groq.audio.transcriptions.create({
      file: fs.createReadStream(c.chunkPath) as any,
      model: "whisper-large-v3-turbo",
      response_format: "verbose_json",
      timestamp_granularities: ["word", "segment"],
    } as any) as any;

    const words = (res.words || []).map((w: any) => ({
      word: w.word.trim(),
      start: Number(w.start.toFixed(2)),
      end: Number(w.end.toFixed(2)),
    }));

    chunkOutputs.push({
      startTime: c.startTime,
      words,
      segments: res.segments || [],
      text: res.text || "",
    });
    console.log(`  Chunk #${c.index + 1} transcribed: ${words.length} words.`);
  }

  // Step 5: Stitch and deduplicate
  console.log("\n[Step 5] Merging and deduplicating chunk transcripts...");
  const merged = mergeAndDeduplicateChunkTranscripts(chunkOutputs, totalDuration);
  const stitchedWords = merged.words.map((w) => ({
    word: w.word.trim(),
    start: Number(w.start.toFixed(2)),
    end: Number(w.end.toFixed(2)),
  }));

  console.log(`Stitched transcription complete: ${stitchedWords.length} words.`);

  // Step 6: Diff Analysis
  console.log("\n==================================================");
  console.log("            CHUNKING DIFF ANALYSIS                ");
  console.log("==================================================");
  console.log(`Unchunked Word Count: ${unchunkedWords.length}`);
  console.log(`Stitched Word Count:  ${stitchedWords.length}`);
  console.log(`Delta Word Count:     ${stitchedWords.length - unchunkedWords.length}`);

  console.log("\nFirst 5 words comparison:");
  console.log("  Unchunked:", unchunkedWords.slice(0, 5).map((w) => `${w.word}(${w.start}s)`).join(" "));
  console.log("  Stitched: ", stitchedWords.slice(0, 5).map((w) => `${w.word}(${w.start}s)`).join(" "));

  console.log("\nLast 5 words comparison:");
  console.log("  Unchunked:", unchunkedWords.slice(-5).map((w) => `${w.word}(${w.start}s)`).join(" "));
  console.log("  Stitched: ", stitchedWords.slice(-5).map((w) => `${w.word}(${w.start}s)`).join(" "));

  // Inspect words around the 60s overlap boundary (58s - 63s)
  console.log("\nWords around 60s Overlap Boundary (58.0s - 63.0s):");
  const unchunkedBoundary = unchunkedWords.filter((w) => w.start >= 58.0 && w.start <= 63.0);
  const stitchedBoundary = stitchedWords.filter((w) => w.start >= 58.0 && w.start <= 63.0);

  console.log("  Unchunked boundary words:", unchunkedBoundary.map((w) => `"${w.word}"[@${w.start}s]`).join(", "));
  console.log("  Stitched boundary words: ", stitchedBoundary.map((w) => `"${w.word}"[@${w.start}s]`).join(", "));

  // Inspect words around the 120s overlap boundary (118s - 123s)
  console.log("\nWords around 120s Overlap Boundary (118.0s - 123.0s):");
  const unchunkedBoundary2 = unchunkedWords.filter((w) => w.start >= 118.0 && w.start <= 123.0);
  const stitchedBoundary2 = stitchedWords.filter((w) => w.start >= 118.0 && w.start <= 123.0);

  console.log("  Unchunked boundary words:", unchunkedBoundary2.map((w) => `"${w.word}"[@${w.start}s]`).join(", "));
  console.log("  Stitched boundary words: ", stitchedBoundary2.map((w) => `"${w.word}"[@${w.start}s]`).join(", "));
}

testForcedChunkingDiff().catch((err) => {
  console.error("Test error:", err);
  process.exit(1);
});
