import assert from "node:assert";
import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import util from "util";
import {
  GROQ_MAX_FILE_SIZE_BYTES,
  probeAudioDuration,
  splitAudioIntoChunks,
  mergeAndDeduplicateChunkTranscripts,
  WordItem,
  SegmentItem,
} from "../src/lib/groqChunking";
import { getFfmpegBinary } from "../src/lib/videoService";

const execFilePromise = util.promisify(execFile);

async function runGroqChunkingTests() {
  console.log("=== Running Groq Audio Limit & Chunking Tests (Item 3) ===");

  // Test 1: Verify Groq's file size limit constant
  console.log("\n[Test 1] Verifying Groq official file-size limit...");
  assert.strictEqual(
    GROQ_MAX_FILE_SIZE_BYTES,
    26214400,
    "Groq Whisper limit must be exactly 25 MB (26,214,400 bytes)"
  );
  console.log(`-> PASS: Groq max file size limit = 25 MB (${GROQ_MAX_FILE_SIZE_BYTES} bytes)`);

  // Test 2: Generate fake 40+ min audio file (42 minutes = 2520 seconds)
  const testDir = path.resolve(process.cwd(), "data", "test_chunking");
  if (!fs.existsSync(testDir)) fs.mkdirSync(testDir, { recursive: true });

  const fakeAudioPath = path.join(testDir, "fake_42min_speech.mp3");
  const ffmpegBin = getFfmpegBinary();

  console.log("\n[Test 2] Generating fake 42-minute audio file (2520 seconds)...");
  // Generate synthetic silent audio at 16kHz mono 32kbps for fast generation
  const t0 = Date.now();
  await execFilePromise(ffmpegBin, [
    "-y",
    "-f", "lavfi",
    "-i", "anullsrc=channel_layout=mono:sample_rate=16000",
    "-t", "2520",
    "-c:a", "libmp3lame",
    "-b:a", "32k",
    fakeAudioPath,
  ]);
  console.log(`-> Fake audio created in ${Date.now() - t0}ms: ${fakeAudioPath}`);

  const probedDuration = await probeAudioDuration(fakeAudioPath);
  console.log(`-> Probed audio duration: ${probedDuration.toFixed(2)}s (${(probedDuration / 60).toFixed(1)} minutes)`);
  assert.ok(probedDuration >= 2500, "Audio duration must be >= 40 minutes (2400s)");
  console.log("-> PASS: Fake 40+ min audio probed successfully");

  // Test 3: Split into overlapping chunks (e.g. 600s / 10 min each with 1.0s overlap)
  console.log("\n[Test 3] Splitting 42-min audio into chunks with 1.0s overlap...");
  const chunkDir = path.join(testDir, "chunks");
  const chunks = await splitAudioIntoChunks({
    audioPath: fakeAudioPath,
    totalDuration: probedDuration,
    chunkDurationSec: 600,
    overlapSec: 1.0,
    outputDir: chunkDir,
  });

  console.log(`-> Total chunks generated: ${chunks.length}`);
  assert.ok(chunks.length >= 5, "42 min audio with 10 min chunks should yield 5 chunks");
  assert.strictEqual(chunks[0].startTime, 0, "First chunk starts at t=0");
  assert.strictEqual(chunks[1].startTime, 599, "Second chunk starts at 600s - 1s overlap = 599s");
  assert.strictEqual(chunks[2].startTime, 1199, "Third chunk starts at 1200s - 1s overlap = 1199s");

  for (const c of chunks) {
    assert.ok(fs.existsSync(c.chunkPath), `Chunk file ${c.chunkPath} must exist`);
    const stat = fs.statSync(c.chunkPath);
    assert.ok(stat.size > 0, "Chunk file must have non-zero size");
    assert.ok(stat.size < GROQ_MAX_FILE_SIZE_BYTES, "Each chunk must be well under 25 MB");
  }
  console.log("-> PASS: Chunks generated with frame-accurate ~1.0s overlap offsets and valid sizes");

  // Test 4: Verify timestamp offsetting and overlap deduplication
  console.log("\n[Test 4] Verifying timestamp offsetting and overlap word deduplication...");
  // Simulate Whisper output from Chunk 0 (ending at 600s with overlap words)
  const chunk0Words: WordItem[] = [
    { word: "This", start: 597.0, end: 597.5 },
    { word: "is", start: 597.6, end: 598.0 },
    { word: "the", start: 598.1, end: 598.5 },
    { word: "end", start: 598.6, end: 599.2 },
    { word: "of", start: 599.3, end: 599.6 },
    { word: "chunk", start: 599.7, end: 600.0 }, // Duplicate boundary word
  ];
  const chunk0Segments: SegmentItem[] = [
    { id: 0, start: 597.0, end: 600.0, text: "This is the end of chunk" },
  ];

  // Chunk 1 starts at 599.0s. Its local Whisper timestamps are 0-indexed:
  // Local 0.7s corresponds to absolute 599.0 + 0.7 = 599.7s ("chunk" duplicate)
  // Local 1.2s corresponds to absolute 599.0 + 1.2 = 600.2s ("one" fresh word)
  const chunk1LocalWords: WordItem[] = [
    { word: "chunk", start: 0.7, end: 1.0 }, // Local time 0.7s -> Absolute 599.7s (DUPLICATE)
    { word: "one,", start: 1.2, end: 1.6 }, // Local time 1.2s -> Absolute 600.2s (NEW)
    { word: "moving", start: 1.7, end: 2.2 }, // Local time 1.7s -> Absolute 600.7s (NEW)
    { word: "forward.", start: 2.3, end: 3.0 }, // Local time 2.3s -> Absolute 601.3s (NEW)
  ];
  const chunk1LocalSegments: SegmentItem[] = [
    { id: 0, start: 0.7, end: 3.0, text: "chunk one, moving forward." },
  ];

  const merged = mergeAndDeduplicateChunkTranscripts(
    [
      {
        startTime: 0,
        words: chunk0Words,
        segments: chunk0Segments,
        text: "This is the end of chunk",
      },
      {
        startTime: 599.0,
        words: chunk1LocalWords,
        segments: chunk1LocalSegments,
        text: "chunk one, moving forward.",
      },
    ],
    probedDuration
  );

  console.log(`-> Merged total words: ${merged.words.length}`);
  const wordTexts = merged.words.map((w) => w.word);
  console.log(`-> Words sequence:`, wordTexts.join(" "));

  // Count occurrences of "chunk"
  const chunkWordCount = wordTexts.filter((w) => w.toLowerCase().includes("chunk")).length;
  assert.strictEqual(
    chunkWordCount,
    1,
    `Word "chunk" in 1s overlap boundary must appear exactly once, but appeared ${chunkWordCount} times`
  );

  // Check offset timestamps of chunk 1 words
  const wordOne = merged.words.find((w) => w.word.includes("one"));
  assert.ok(wordOne, "Word 'one' from chunk 1 must be present");
  assert.strictEqual(wordOne.start, 600.2, "Word 'one' timestamp must be shifted to absolute 600.2s");
  assert.strictEqual(wordOne.end, 600.6, "Word 'one' end timestamp must be shifted to absolute 600.6s");

  // Verify strictly ascending timestamps
  for (let i = 1; i < merged.words.length; i++) {
    assert.ok(
      merged.words[i].start >= merged.words[i - 1].start,
      `Word timestamps must be monotonic: word[${i}] (${merged.words[i].word} @ ${merged.words[i].start}) < word[${i-1}] (${merged.words[i-1].word} @ ${merged.words[i-1].start})`
    );
  }
  console.log("-> PASS: Words shifted by chunk start time and overlap duplicate cleanly removed");

  // Clean up test files
  try {
    for (const c of chunks) {
      if (fs.existsSync(c.chunkPath)) fs.unlinkSync(c.chunkPath);
    }
    if (fs.existsSync(chunkDir)) fs.rmdirSync(chunkDir);
    if (fs.existsSync(fakeAudioPath)) fs.unlinkSync(fakeAudioPath);
    if (fs.existsSync(testDir)) fs.rmdirSync(testDir);
  } catch (cleanErr) {}

  console.log("\nALL GROQ CHUNKING & LIMIT TESTS PASSED!\n");
}

runGroqChunkingTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
