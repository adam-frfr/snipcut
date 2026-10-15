import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import path from "path";
import fs from "fs";

// Set fluent-ffmpeg binary path to ffmpeg-static bundled executable
if (ffmpegStatic) {
  ffmpeg.setFfmpegPath(ffmpegStatic);
}

export interface RenderOptions {
  inputPath: string;
  outputPath: string;
  startTime: number;
  duration: number;
  aspectRatio: "9:16" | "1:1" | "16:9";
  splitScreen?: boolean;
}

/**
 * Trims and crops a video into 9:16, 1:1, or 16:9 using local FFmpeg
 */
export async function renderVideoClip({
  inputPath,
  outputPath,
  startTime,
  duration,
  aspectRatio = "9:16",
  splitScreen = false,
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

    // Apply video filters for aspect ratio
    if (aspectRatio === "9:16") {
      if (splitScreen) {
        // Stack top and bottom video crop for 2 speakers
        command = command.videoFilters([
          "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920",
        ]);
      } else {
        // Center crop to 9:16 vertical
        command = command.videoFilters([
          "scale=-1:1920,crop=1080:1920:(in_w-1080)/2:0",
        ]);
      }
    } else if (aspectRatio === "1:1") {
      // 1080x1080 Square
      command = command.videoFilters([
        "scale=-1:1080,crop=1080:1080:(in_w-1080)/2:0",
      ]);
    }

    command
      .outputOptions([
        "-c:v libx264",
        "-preset veryfast",
        "-crf 22",
        "-c:a aac",
        "-b:a 192k",
        "-movflags +faststart",
      ])
      .output(outputPath)
      .on("end", () => {
        resolve(outputPath);
      })
      .on("error", (err) => {
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

