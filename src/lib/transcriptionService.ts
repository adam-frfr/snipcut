import fs from "fs";
import path from "path";
import OpenAI from "openai";
import {
  GROQ_CHUNK_THRESHOLD_BYTES,
  probeAudioDuration,
  splitAudioIntoChunks,
  mergeAndDeduplicateChunkTranscripts,
} from "./groqChunking";

export interface TranscribeResult {
  text: string;
  words: { word: string; start: number; end: number }[];
  segments: { id?: number; start: number; end: number; text: string }[];
  duration: number;
  provider: string;
}

/**
 * Transcribes audio file using Groq Whisper (primary) or OpenAI Whisper (fallback)
 * Supports audio chunking if file size exceeds Groq's 25MB threshold.
 */
/**
 * Some provider responses (or individual chunks) omit word-level timestamps
 * while still returning segments. Without words, karaoke captions, silence
 * removal and the editor transcript all go empty. Synthesize evenly-spaced
 * word timings from the segment text so captions always exist.
 */
function ensureWords<T extends { words?: any[]; segments?: any[] }>(result: T): T {
  if ((result.words && result.words.length > 0) || !result.segments || result.segments.length === 0) {
    return result;
  }
  const words: { word: string; start: number; end: number }[] = [];
  for (const seg of result.segments as any[]) {
    const tokens = String(seg.text || "").trim().split(/\s+/).filter(Boolean);
    if (tokens.length === 0) continue;
    const segStart = Number(seg.start) || 0;
    const segEnd = Number(seg.end) || segStart;
    const step = Math.max(0.05, (segEnd - segStart) / tokens.length);
    tokens.forEach((tok, i) => {
      words.push({
        word: tok,
        start: Number((segStart + i * step).toFixed(2)),
        end: Number((segStart + (i + 1) * step).toFixed(2)),
      });
    });
  }
  if (words.length > 0) {
    console.log(`[Stage: Transcribe] Provider returned no word timestamps; synthesized ${words.length} words from segments`);
    return { ...result, words };
  }
  return result;
}

export async function transcribeAudioFile(
  audioPath: string,
  keys: { groqKey?: string; openaiKey?: string } = {}
): Promise<TranscribeResult> {
  // Groq keys in priority order: per-job key, GROQ_API_KEY, GROQ_API_KEY2 (rate-limit fallback)
  const groqKeys = [
    (keys.groqKey || "").trim(),
    (process.env.GROQ_API_KEY || "").trim(),
    (process.env.GROQ_API_KEY2 || "").trim(),
  ].filter((k, i, arr) => k && arr.indexOf(k) === i);
  const activeOpenaiKey = (keys.openaiKey || process.env.OPENAI_API_KEY || "").trim();

  if (!fs.existsSync(audioPath)) {
    throw new Error(`Audio file not found at ${audioPath}`);
  }

  // 1. Try Groq Whisper API (whisper-large-v3-turbo), one key at a time
  for (const activeGroqKey of groqKeys) {
    console.log(`[Stage: Transcribe] Calling Groq Whisper API (whisper-large-v3-turbo)...`);
    const whisperApiStartTime = Date.now();
    try {
      const groq = new OpenAI({
        apiKey: activeGroqKey,
        baseURL: "https://api.groq.com/openai/v1",
      });

      const audioSize = fs.statSync(audioPath).size;

      if (audioSize > GROQ_CHUNK_THRESHOLD_BYTES) {
        console.log(
          `[Stage: Transcribe] Audio size ${(audioSize / (1024 * 1024)).toFixed(2)} MB exceeds Groq 25MB threshold. Splitting into overlapping chunks...`
        );
        const totalDur = await probeAudioDuration(audioPath);
        const chunkDir = path.join(path.dirname(audioPath), `chunks_${Date.now()}`);
        const chunks = await splitAudioIntoChunks({
          audioPath,
          totalDuration: totalDur || 600,
          chunkDurationSec: 600,
          overlapSec: 1.0,
          outputDir: chunkDir,
        });

        const chunkOutputs = [];
        for (const slice of chunks) {
          const chunkRes = (await groq.audio.transcriptions.create({
            file: fs.createReadStream(slice.chunkPath) as any,
            model: "whisper-large-v3-turbo",
            response_format: "verbose_json",
            timestamp_granularities: ["word", "segment"],
          } as any)) as any;

          chunkOutputs.push({
            startTime: slice.startTime,
            words: chunkRes.words || [],
            segments: chunkRes.segments || [],
            text: chunkRes.text || "",
          });

          try { fs.unlinkSync(slice.chunkPath); } catch {}
        }

        try { fs.rmdirSync(chunkDir); } catch {}

        const merged = mergeAndDeduplicateChunkTranscripts(chunkOutputs, totalDur);
        return ensureWords({
          text: merged.text,
          words: merged.words,
          segments: merged.segments,
          duration: merged.duration,
          provider: `groq-whisper-large-v3-turbo (${chunks.length} chunks)`,
        });
      } else {
        const res = (await groq.audio.transcriptions.create({
          file: fs.createReadStream(audioPath) as any,
          model: "whisper-large-v3-turbo",
          response_format: "verbose_json",
          timestamp_granularities: ["word", "segment"],
        } as any)) as any;

        const duration = await probeAudioDuration(audioPath);
        console.log(`[Stage: Transcribe] Groq Whisper API finished in ${Date.now() - whisperApiStartTime}ms`);

        return ensureWords({
          text: res.text || "",
          words: res.words || [],
          segments: res.segments || [],
          duration: res.duration || duration,
          provider: "groq-whisper-large-v3-turbo",
        });
      }
    } catch (groqErr: any) {
      console.warn("[Stage: Transcribe] Groq Whisper API error, trying next key / OpenAI fallback:", groqErr?.message || groqErr);
    }
  }

  // 2. Try OpenAI Whisper API (whisper-1)
  if (activeOpenaiKey && !activeOpenaiKey.startsWith("sk-hc-v1-")) {
    console.log(`[Stage: Transcribe] Calling OpenAI Whisper API (whisper-1)...`);
    const whisperApiStartTime = Date.now();
    try {
      const openai = new OpenAI({ apiKey: activeOpenaiKey });
      const res = (await openai.audio.transcriptions.create({
        file: fs.createReadStream(audioPath) as any,
        model: "whisper-1",
        response_format: "verbose_json",
        timestamp_granularities: ["word", "segment"],
      } as any)) as any;

      const duration = await probeAudioDuration(audioPath);
      console.log(`[Stage: Transcribe] OpenAI Whisper API finished in ${Date.now() - whisperApiStartTime}ms`);

      return ensureWords({
        text: res.text || "",
        words: res.words || [],
        segments: res.segments || [],
        duration: res.duration || duration,
        provider: "openai-whisper-1",
      });
    } catch (openaiErr: any) {
      console.warn("[Stage: Transcribe] OpenAI Whisper API error:", openaiErr?.message || openaiErr);
    }
  }

  throw new Error(
    "No transcription provider available. Please configure GROQ_API_KEY (recommended) or OPENAI_API_KEY in your settings."
  );
}
