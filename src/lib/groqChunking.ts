import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import util from "util";
import { getFfmpegBinary, getFfprobeBinary } from "./videoService";

const execFilePromise = util.promisify(execFile);

/**
 * Groq Whisper API official file size limit: 25 MB (26,214,400 bytes).
 * We trigger chunking if the audio file exceeds 24 MB (25,165,824 bytes).
 */
export const GROQ_MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;
export const GROQ_CHUNK_THRESHOLD_BYTES = 24 * 1024 * 1024;

export interface WordItem {
  word: string;
  start: number;
  end: number;
}

export interface SegmentItem {
  id?: number;
  start: number;
  end: number;
  text: string;
}

export interface ChunkSlice {
  index: number;
  chunkPath: string;
  startTime: number;
  duration: number;
}

export interface MergedTranscriptResult {
  text: string;
  words: WordItem[];
  segments: SegmentItem[];
  duration: number;
  chunkCount: number;
}

/**
 * Probes the exact duration of an audio file using ffprobe
 */
export async function probeAudioDuration(audioPath: string): Promise<number> {
  const ffprobeBin = getFfprobeBinary();
  try {
    const { stdout } = await execFilePromise(ffprobeBin, [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      audioPath,
    ]);
    const duration = parseFloat(stdout.trim());
    return isNaN(duration) ? 0 : duration;
  } catch (err) {
    console.warn("probeAudioDuration error:", err);
    return 0;
  }
}

/**
 * Splits an audio file into overlapping chunks using FFmpeg.
 * Overlap default: 1.0 second.
 */
export async function splitAudioIntoChunks({
  audioPath,
  totalDuration,
  chunkDurationSec = 600, // 10 minutes default chunk
  overlapSec = 1.0,
  outputDir,
}: {
  audioPath: string;
  totalDuration: number;
  chunkDurationSec?: number;
  overlapSec?: number;
  outputDir: string;
}): Promise<ChunkSlice[]> {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const ffmpegBin = getFfmpegBinary();
  const ext = path.extname(audioPath) || ".mp3";
  const base = path.basename(audioPath, ext);
  const chunks: ChunkSlice[] = [];

  let currentStart = 0;
  let index = 0;

  while (currentStart < totalDuration) {
    const isFirst = index === 0;
    const startSec = isFirst ? 0 : Math.max(0, currentStart - overlapSec);
    const duration = Math.min(chunkDurationSec + (isFirst ? 0 : overlapSec), totalDuration - startSec);
    const chunkFile = path.join(outputDir, `${base}_chunk_${index}${ext}`);

    console.log(
      `[Stage: Audio Chunking] Creating chunk #${index + 1}: start=${startSec.toFixed(2)}s, duration=${duration.toFixed(2)}s -> ${path.basename(chunkFile)}`
    );

    // Fast stream copy or MP3 encode
    try {
      await execFilePromise(ffmpegBin, [
        "-y",
        "-ss",
        String(startSec),
        "-t",
        String(duration),
        "-i",
        audioPath,
        "-c:a",
        "libmp3lame",
        "-b:a",
        "64k",
        chunkFile,
      ]);
    } catch (e: any) {
      console.warn(`[Stage: Audio Chunking] MP3 encode failed, falling back to copy:`, e?.message);
      await execFilePromise(ffmpegBin, [
        "-y",
        "-ss",
        String(startSec),
        "-t",
        String(duration),
        "-i",
        audioPath,
        "-c",
        "copy",
        chunkFile,
      ]);
    }

    chunks.push({
      index,
      chunkPath: chunkFile,
      startTime: startSec,
      duration,
    });

    currentStart += chunkDurationSec;
    index++;
  }

  return chunks;
}

/**
 * Offsets timestamps of words and segments by chunk startTime
 * and de-duplicates words across the ~1s overlap region.
 */
export function mergeAndDeduplicateChunkTranscripts(
  chunkOutputs: {
    startTime: number;
    words: WordItem[];
    segments: SegmentItem[];
    text: string;
  }[],
  totalDuration: number
): MergedTranscriptResult {
  const mergedWords: WordItem[] = [];
  const mergedSegments: SegmentItem[] = [];
  const textParts: string[] = [];

  for (let c = 0; c < chunkOutputs.length; c++) {
    const chunk = chunkOutputs[c];
    const offset = chunk.startTime;

    // 1. Shift word timestamps by chunk offset
    const shiftedWords: WordItem[] = (chunk.words || []).map((w) => ({
      word: w.word,
      start: Number((w.start + offset).toFixed(2)),
      end: Number((w.end + offset).toFixed(2)),
    }));

    if (c === 0) {
      mergedWords.push(...shiftedWords);
      if (chunk.text) textParts.push(chunk.text.trim());
    } else {
      // De-duplicate overlap with previous chunk
      const prevLastWord = mergedWords[mergedWords.length - 1];
      const thresholdTime = prevLastWord ? prevLastWord.end - 0.2 : offset;

      const wordsToAdd: WordItem[] = [];
      for (const sw of shiftedWords) {
        // If word is within the overlap window, check for duplicates
        if (prevLastWord && sw.start < thresholdTime) {
          const duplicate = mergedWords.some(
            (mw) =>
              Math.abs(mw.start - sw.start) <= 0.45 &&
              mw.word.trim().toLowerCase().replace(/[^a-z0-9]/g, "") ===
                sw.word.trim().toLowerCase().replace(/[^a-z0-9]/g, "")
          );
          if (duplicate) {
            continue; // Skip duplicate overlap word
          }
        }
        wordsToAdd.push(sw);
      }

      mergedWords.push(...wordsToAdd);
      if (chunk.text) textParts.push(chunk.text.trim());
    }

    // 2. Shift segment timestamps
    for (const seg of chunk.segments || []) {
      const segStart = Number((seg.start + offset).toFixed(2));
      const segEnd = Number((seg.end + offset).toFixed(2));
      if (mergedSegments.length > 0) {
        const lastSeg = mergedSegments[mergedSegments.length - 1];
        if (segStart < lastSeg.end - 0.5) {
          // If segment is within overlap window, skip if already covered
          continue;
        }
      }
      mergedSegments.push({
        id: mergedSegments.length,
        start: segStart,
        end: segEnd,
        text: seg.text,
      });
    }
  }

  // Sort words strictly chronologically
  mergedWords.sort((a, b) => a.start - b.start);

  return {
    text: textParts.join(" "),
    words: mergedWords,
    segments: mergedSegments,
    duration: totalDuration,
    chunkCount: chunkOutputs.length,
  };
}
