import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import path from "path";
import fs from "fs";

// Set fluent-ffmpeg binary path to local bin/ffmpeg.exe or ffmpeg-static
function getFfmpegBinary(): string {
  const localBin = path.join(process.cwd(), "bin", "ffmpeg.exe");
  if (fs.existsSync(localBin)) {
    return localBin;
  }
  return ffmpegStatic || "ffmpeg";
}

ffmpeg.setFfmpegPath(getFfmpegBinary());

export interface RenderOptions {
  inputPath: string;
  outputPath: string;
  startTime: number;
  duration: number;
  aspectRatio: "9:16" | "1:1" | "16:9";
  splitScreen?: boolean;
  transcript?: { start: number; end: number; text: string }[];
  headline?: string;
  captionStyle?: "hormozi" | "neon" | "beast" | "clean";
}

function formatSrtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.min(999, Math.floor((seconds % 1) * 1000));
  return `${h < 10 ? "0" : ""}${h}:${m < 10 ? "0" : ""}${m}:${s < 10 ? "0" : ""}${s},${ms < 100 ? (ms < 10 ? "00" : "0") : ""}${ms}`;
}

/**
 * Trims, reframes to 9:16 vertical, and burns in viral subtitles using local FFmpeg
 */
export async function renderVideoClip({
  inputPath,
  outputPath,
  startTime,
  duration,
  aspectRatio = "9:16",
  splitScreen = false,
  transcript,
  headline,
  captionStyle = "hormozi",
}: RenderOptions): Promise<string> {
  return new Promise((resolve, reject) => {
    // Ensure output directory exists
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    let command = ffmpeg(inputPath)
      .setStartTime(startTime)
      .setDuration(duration);

    const filters: string[] = [];

    // 1. Aspect ratio reframing
    if (aspectRatio === "9:16") {
      if (splitScreen) {
        filters.push("scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920");
      } else {
        filters.push("scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920");
      }
    } else if (aspectRatio === "1:1") {
      filters.push("scale=1080:1080:force_original_aspect_ratio=increase,crop=1080:1080");
    }

    // 2. Subtitle burn-in (Hormozi / TikTok shorts style)
    let tempSrtPath: string | null = null;
    let srtEntries: { start: number; end: number; text: string }[] = [];

    if (transcript && transcript.length > 0) {
      srtEntries = transcript.map((t) => ({
        start: Math.max(0, t.start),
        end: Math.max(t.start + 0.4, t.end),
        text: t.text.toUpperCase(),
      }));
    } else if (headline) {
      srtEntries = [
        {
          start: 0,
          end: duration,
          text: headline.toUpperCase(),
        },
      ];
    }

    if (srtEntries.length > 0) {
      const srtLines: string[] = [];
      srtEntries.forEach((entry, idx) => {
        srtLines.push(`${idx + 1}`);
        srtLines.push(`${formatSrtTime(entry.start)} --> ${formatSrtTime(entry.end)}`);
        srtLines.push(entry.text);
        srtLines.push("");
      });

      tempSrtPath = path.join(dir, `sub-${Date.now()}-${Math.floor(Math.random() * 1000)}.srt`);
      fs.writeFileSync(tempSrtPath, srtLines.join("\n"), "utf-8");

      // Format subtitle filter style
      let forceStyle =
        "Fontname=Arial,Fontsize=24,PrimaryColour=&H0000FFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=3,Alignment=2,MarginV=130";
      if (captionStyle === "neon") {
        forceStyle =
          "Fontname=Arial,Fontsize=24,PrimaryColour=&H0000FF00,OutlineColour=&H00000000,BorderStyle=1,Outline=3,Alignment=2,MarginV=130";
      } else if (captionStyle === "beast") {
        forceStyle =
          "Fontname=Arial,Fontsize=26,PrimaryColour=&H0000FFFF,OutlineColour=&H000000FF,BorderStyle=1,Outline=4,Alignment=2,MarginV=130";
      } else if (captionStyle === "clean") {
        forceStyle =
          "Fontname=Arial,Fontsize=22,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BorderStyle=1,Outline=2,Alignment=2,MarginV=130";
      }

      const srtEscaped = tempSrtPath.replace(/\\/g, "/").replace(/:/g, "\\:");
      filters.push(`subtitles='${srtEscaped}':force_style='${forceStyle}'`);
    }

    if (filters.length > 0) {
      command = command.videoFilters(filters);
    }

    const cleanup = () => {
      if (tempSrtPath && fs.existsSync(tempSrtPath)) {
        try {
          fs.unlinkSync(tempSrtPath);
        } catch (e) {}
      }
    };

    command
      .outputOptions([
        "-c:v libx264",
        "-preset ultrafast",
        "-crf 23",
        "-c:a aac",
        "-b:a 192k",
        "-movflags +faststart",
      ])
      .output(outputPath)
      .on("end", () => {
        cleanup();
        resolve(outputPath);
      })
      .on("error", (err) => {
        cleanup();
        reject(err);
      })
      .run();
  });
}

/**
 * Extracts a lightweight compressed MP3 audio track from any video for OpenAI Whisper
 */
export async function extractAudioForWhisper(
  videoPath: string,
  audioOutputPath: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const dir = path.dirname(audioOutputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    ffmpeg(videoPath)
      .noVideo()
      .audioCodec("libmp3lame")
      .audioBitrate(64)
      .audioChannels(1)
      .output(audioOutputPath)
      .on("end", () => resolve(audioOutputPath))
      .on("error", (err) => reject(err))
      .run();
  });
}

