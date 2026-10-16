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
export async function transcribeAudioFile(
  audioPath: string,
  keys: { groqKey?: string; openaiKey?: string } = {}
): Promise<TranscribeResult> {
  const activeGroqKey = (keys.groqKey || process.env.GROQ_API_KEY || "").trim();
  const activeOpenaiKey = (keys.openaiKey || process.env.OPENAI_API_KEY || "").trim();

  if (!fs.existsSync(audioPath)) {
    throw new Error(`Audio file not found at ${audioPath}`);
  }

  // 1. Try Groq Whisper API (whisper-large-v3-turbo)
  if (activeGroqKey) {
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
        return {
          text: merged.text,
          words: merged.words,
          segments: merged.segments,
          duration: merged.duration,
          provider: `groq-whisper-large-v3-turbo (${chunks.length} chunks)`,
        };
      } else {
        const res = (await groq.audio.transcriptions.create({
          file: fs.createReadStream(audioPath) as any,
          model: "whisper-large-v3-turbo",
          response_format: "verbose_json",
          timestamp_granularities: ["word", "segment"],
        } as any)) as any;

        const duration = await probeAudioDuration(audioPath);
        console.log(`[Stage: Transcribe] Groq Whisper API finished in ${Date.now() - whisperApiStartTime}ms`);

        return {
          text: res.text || "",
          words: res.words || [],
          segments: res.segments || [],
          duration: res.duration || duration,
          provider: "groq-whisper-large-v3-turbo",
        };
      }
    } catch (groqErr: any) {
      console.warn("[Stage: Transcribe] Groq Whisper API error, checking OpenAI fallback:", groqErr?.message || groqErr);
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

      return {
        text: res.text || "",
        words: res.words || [],
        segments: res.segments || [],
        duration: res.duration || duration,
        provider: "openai-whisper-1",
      };
    } catch (openaiErr: any) {
      console.warn("[Stage: Transcribe] OpenAI Whisper API error:", openaiErr?.message || openaiErr);
    }
  }

  throw new Error(
    "No transcription provider available. Please configure GROQ_API_KEY (recommended) or OPENAI_API_KEY in your settings."
  );
}
