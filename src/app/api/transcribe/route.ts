import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";
import {
  extractAudioForWhisper,
  getFfmpegBinary,
  resolveSafeFilePath,
  toSafeFileIdentifier,
} from "@/lib/videoService";
import fs from "fs";
import path from "path";

/**
 * Parses WebVTT subtitles into clean timecoded narrative blocks and word-level timings
 */
function parseVttCaptions(vttContent: string, maxDuration?: number) {
  const lines = vttContent.split(/\r?\n/);
  const words: { word: string; start: number; end: number }[] = [];
  const segments: { start: number; end: number; text: string }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes("-->")) {
      const timeMatch = line.match(
        /(\d{2}):(\d{2}):(\d{2})\.(\d{3})\s*-->\s*(\d{2}):(\d{2}):(\d{2})\.(\d{3})/
      );
      if (timeMatch) {
        let s =
          parseInt(timeMatch[1], 10) * 3600 +
          parseInt(timeMatch[2], 10) * 60 +
          parseInt(timeMatch[3], 10) +
          parseInt(timeMatch[4], 10) / 1000;
        let e =
          parseInt(timeMatch[5], 10) * 3600 +
          parseInt(timeMatch[6], 10) * 60 +
          parseInt(timeMatch[7], 10) +
          parseInt(timeMatch[8], 10) / 1000;

        if (maxDuration && s >= maxDuration) break;
        if (maxDuration && e > maxDuration) e = maxDuration;

        i++;
        let cueText = "";
        while (i < lines.length && lines[i].trim() !== "") {
          const raw = lines[i].trim();
          const clean = raw.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
          if (clean) cueText += (cueText ? " " : "") + clean;
          i++;
        }

        if (cueText) {
          segments.push({ start: s, end: e, text: cueText });
          const parts = cueText.split(/\s+/).filter(Boolean);
          const duration = Math.max(0.4, e - s);
          const wordDur = duration / Math.max(1, parts.length);
          parts.forEach((w, idx) => {
            words.push({
              word: w,
              start: Math.round((s + idx * wordDur) * 100) / 100,
              end: Math.round((s + (idx + 1) * wordDur) * 100) / 100,
            });
          });
        }
      }
    }
  }

  const fullText = segments.map((s) => s.text).join(" ");
  return { text: fullText, words, segments };
}

export async function POST(req: NextRequest) {
  const transcribeStartTime = Date.now();
  try {
    const body = await req.json();
    const { filePath, fileId, openaiKey, groqKey } = body;

    const rawInput = filePath || fileId;
    if (!rawInput) {
      return NextResponse.json(
        { error: "Valid file identifier is required for transcription" },
        { status: 400 }
      );
    }

    // Resolve file safely inside allowed media folders
    let resolvedVideoPath: string;
    try {
      resolvedVideoPath = resolveSafeFilePath(rawInput);
    } catch (pathErr: any) {
      return NextResponse.json({ error: pathErr.message }, { status: 403 });
    }

    if (!fs.existsSync(/*turbopackIgnore: true*/ resolvedVideoPath)) {
      return NextResponse.json(
        { error: "Target video file not found in media storage" },
        { status: 404 }
      );
    }

    console.log(
      `[Stage: Transcribe] Starting transcription pipeline for: ${path.basename(resolvedVideoPath)}`
    );

    let audioPath = resolvedVideoPath;

    // Intermediate audio stored in data/audio (not exposed via public/)
    const ext = path.extname(resolvedVideoPath).toLowerCase();
    if ([".mp4", ".mov", ".mkv", ".webm", ".avi"].includes(ext)) {
      const audioOutputDir = path.join(process.cwd(), "data", "audio");
      if (!fs.existsSync(audioOutputDir)) {
        fs.mkdirSync(audioOutputDir, { recursive: true });
      }
      const audioFilename = `audio-${Date.now()}.mp3`;
      audioPath = path.join(audioOutputDir, audioFilename);
      try {
        await extractAudioForWhisper(resolvedVideoPath, audioPath);
      } catch (e) {
        console.warn("[Stage: Transcribe] Audio extraction failed, using original file:", e);
        audioPath = resolvedVideoPath;
      }
    }

    let transcription: any = null;
    let providerUsed = "";

    // 1. Check GROQ_API_KEY (First priority: ultra-fast whisper-large-v3-turbo)
    const activeGroqKey = (groqKey || process.env.GROQ_API_KEY || "").trim();
    if (activeGroqKey) {
      const whisperApiStartTime = Date.now();
      console.log(`[Stage: Transcribe] Calling Groq Whisper API (whisper-large-v3-turbo)...`);
      try {
        const groq = new OpenAI({
          apiKey: activeGroqKey,
          baseURL: "https://api.groq.com/openai/v1",
        });
        transcription = await groq.audio.transcriptions.create({
          file: fs.createReadStream(/*turbopackIgnore: true*/ audioPath),
          model: "whisper-large-v3-turbo",
          response_format: "verbose_json",
          timestamp_granularities: ["word", "segment"],
        });
        providerUsed = "groq-whisper-large-v3-turbo";
        console.log(
          `[Stage: Transcribe] Groq Whisper API finished in ${Date.now() - whisperApiStartTime}ms`
        );
      } catch (groqErr: any) {
        console.warn("[Stage: Transcribe] Groq Whisper API failed:", groqErr?.message || groqErr);
      }
    }

    // 2. Check OPENAI_API_KEY (Alternative: whisper-1)
    const activeOpenaiKey = (openaiKey || process.env.OPENAI_API_KEY || "").trim();
    if (!transcription && activeOpenaiKey && !activeOpenaiKey.startsWith("sk-hc-v1-")) {
      const whisperApiStartTime = Date.now();
      console.log(`[Stage: Transcribe] Calling OpenAI Whisper API (whisper-1)...`);
      try {
        const openai = new OpenAI({ apiKey: activeOpenaiKey });
        transcription = await openai.audio.transcriptions.create({
          file: fs.createReadStream(/*turbopackIgnore: true*/ audioPath),
          model: "whisper-1",
          response_format: "verbose_json",
          timestamp_granularities: ["word", "segment"],
        });
        providerUsed = "openai-whisper-1";
        console.log(
          `[Stage: Transcribe] OpenAI Whisper API finished in ${Date.now() - whisperApiStartTime}ms`
        );
      } catch (openaiErr: any) {
        console.warn("[Stage: Transcribe] OpenAI Whisper API failed:", openaiErr?.message || openaiErr);
      }
    }

    const debugDir = path.join(process.cwd(), "data", "debug");
    if (!fs.existsSync(debugDir)) {
      fs.mkdirSync(debugDir, { recursive: true });
    }

    // If a provider transcribed successfully:
    if (transcription) {
      const words = transcription.words || [];
      const segments = transcription.segments || [];
      const debugFile = path.join(debugDir, `transcript-${Date.now()}.json`);

      fs.writeFileSync(
        debugFile,
        JSON.stringify(
          {
            timestamp: new Date().toISOString(),
            sourceVideo: path.basename(resolvedVideoPath),
            provider: providerUsed,
            duration: transcription.duration,
            text: transcription.text,
            wordsCount: words.length,
            segmentsCount: segments.length,
            words,
            segments,
          },
          null,
          2
        ),
        "utf-8"
      );

      console.log(
        `[Stage: Transcribe] Saved transcript JSON (${providerUsed}): ${words.length} words, ${segments.length} segments`
      );

      return NextResponse.json({
        success: true,
        provider: providerUsed,
        text: transcription.text,
        words,
        segments,
        duration: transcription.duration,
        fileId: toSafeFileIdentifier(resolvedVideoPath).fileId,
        audioUrl: toSafeFileIdentifier(audioPath).fileUrl,
        timingMs: Date.now() - transcribeStartTime,
      });
    }

    // 3. Fallback: Search for existing aligned VTT / SRT captions in the directory
    const videoDir = path.dirname(resolvedVideoPath);
    const videoBase = path.basename(resolvedVideoPath, path.extname(resolvedVideoPath));
    const candidateCaptions = [
      path.join(videoDir, `${videoBase}.en.vtt`),
      path.join(videoDir, `${videoBase}.vtt`),
      path.join(videoDir, `${videoBase}.srt`),
    ];

    // Also look for any vtt matching prefix
    if (!candidateCaptions.some((p) => fs.existsSync(p))) {
      const prefix = videoBase.split("-")[0];
      const matchVtt = fs
        .readdirSync(videoDir)
        .find((f) => f.startsWith(prefix) && (f.endsWith(".vtt") || f.endsWith(".srt")));
      if (matchVtt) {
        candidateCaptions.unshift(path.join(videoDir, matchVtt));
      }
    }

    const foundCaption = candidateCaptions.find((p) => fs.existsSync(p));
    if (foundCaption) {
      console.log(
        `[Stage: Transcribe] Found aligned caption file: ${path.basename(foundCaption)}. Parsing caption-based fallback...`
      );
      const rawVtt = fs.readFileSync(foundCaption, "utf-8");
      const parsed = parseVttCaptions(rawVtt);

      if (parsed.segments.length > 0) {
        return NextResponse.json({
          success: true,
          isFallback: true,
          fallbackType: "caption-based",
          qualityLabel: "low quality",
          qualityWarning:
            "Transcription generated from auto-captions (low quality). For professional precision, provide a GROQ_API_KEY or OPENAI_API_KEY in Settings.",
          text: parsed.text,
          words: parsed.words,
          segments: parsed.segments,
          duration: parsed.segments[parsed.segments.length - 1]?.end || 60,
          fileId: toSafeFileIdentifier(resolvedVideoPath).fileId,
          audioUrl: toSafeFileIdentifier(audioPath).fileUrl,
          timingMs: Date.now() - transcribeStartTime,
        });
      }
    }

    // 4. No provider key configured and no captions available: Return clear error to UI
    console.error(
      "[Stage: Transcribe] No transcription provider configured (missing GROQ_API_KEY and OPENAI_API_KEY) and no captions available."
    );
    return NextResponse.json(
      {
        error:
          "No transcription API key configured. Please configure GROQ_API_KEY or OPENAI_API_KEY in Settings or .env.local to transcribe audio.",
      },
      { status: 400 }
    );
  } catch (err: any) {
    console.error("Transcription error:", err);
    return NextResponse.json(
      { error: err?.message || "Transcription pipeline failed" },
      { status: 500 }
    );
  }
}
