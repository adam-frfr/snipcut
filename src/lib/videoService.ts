import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import path from "path";
import fs from "fs";
import { spawn } from "child_process";

// Set fluent-ffmpeg binary path to local bin or system/static ffmpeg
export function getFfmpegBinary(): string {
  if (process.platform === "win32") {
    const localWinBin = path.join(process.cwd(), "bin", "ffmpeg.exe");
    if (fs.existsSync(localWinBin)) {
      return localWinBin;
    }
  }
  const localLinuxBin = path.join(process.cwd(), "bin", "ffmpeg");
  if (fs.existsSync(localLinuxBin)) {
    return localLinuxBin;
  }
  return ffmpegStatic || "ffmpeg";
}

ffmpeg.setFfmpegPath(getFfmpegBinary());

export type ReframeMode = "auto-tracker" | "split-screen" | "blurred-fit" | "center";

export interface RenderOptions {
  inputPath: string;
  outputPath: string;
  startTime: number;
  duration: number;
  aspectRatio: "9:16" | "1:1" | "16:9";
  reframeMode?: ReframeMode;
  splitScreen?: boolean;
  transcript?: { start: number; end: number; text: string }[];
  headline?: string;
  captionStyle?: "hormozi" | "neon" | "beast" | "clean";
}

export interface FocusShot {
  start: number;
  end: number;
  position: "left" | "center" | "right";
  subject_center_x?: number;
  crop_x: number;
  label: string;
  details: string;
}

export interface TrackingResult {
  status: "success" | "error";
  mode: string;
  isDynamic?: boolean;
  shots?: FocusShot[];
  filter_type: "vf" | "filter_complex";
  filter_value: string;
  subject_center_x?: number;
  crop_x?: number;
  crop_w?: number;
  crop_h?: number;
  summary?: string;
}

function formatSrtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.min(999, Math.floor((seconds % 1) * 1000));
  return `${h < 10 ? "0" : ""}${h}:${m < 10 ? "0" : ""}${m}:${s < 10 ? "0" : ""}${s},${ms < 100 ? (ms < 10 ? "00" : "0") : ""}${ms}`;
}

/**
 * Runs deep-learning AI Subject Tracking (OpusClip ReframeAnything)
 * Computes optimal 9:16 crop box keeping speaker centered or multi-mode layout
 */
export async function detectSubjectAndReframe(
  videoPath: string,
  startTime: number,
  duration: number,
  mode: ReframeMode = "auto-tracker"
): Promise<TrackingResult> {
  return new Promise((resolve) => {
    const scriptPath = path.join(process.cwd(), "scripts", "track_reframe.py");
    if (!fs.existsSync(scriptPath)) {
      return resolve({
        status: "success",
        mode: "center",
        filter_type: "vf",
        filter_value: "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920",
        summary: "Default center crop fallback",
      });
    }

    const pythonBin =
      process.env.PYTHON_BIN || (process.platform === "win32" ? "python" : "python3");

    const py = spawn(pythonBin, [
      scriptPath,
      "--video",
      videoPath,
      "--start",
      String(startTime),
      "--duration",
      String(duration),
      "--mode",
      mode,
    ]);

    let stdout = "";
    let stderr = "";

    py.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    py.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    py.on("close", (code) => {
      if (code === 0 && stdout.trim()) {
        try {
          const lines = stdout.trim().split("\n");
          for (let i = lines.length - 1; i >= 0; i--) {
            const line = lines[i].trim();
            if (line.startsWith("{") && line.endsWith("}")) {
              const parsed = JSON.parse(line);
              return resolve(parsed);
            }
          }
        } catch (e) {
          console.warn("Could not parse tracking python output:", stdout);
        }
      }

      // Fallback
      resolve({
        status: "success",
        mode: "center",
        filter_type: "vf",
        filter_value: "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920",
        summary: "Default center crop",
      });
    });

    py.on("error", (err) => {
      console.warn("Python tracking spawn error:", err);
      resolve({
        status: "success",
        mode: "center",
        filter_type: "vf",
        filter_value: "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920",
        summary: "Default center crop fallback",
      });
    });
  });
}

/**
 * Trims, reframes to 9:16 vertical (with AI Subject Tracking), and burns in viral subtitles using local FFmpeg
 */
export async function renderVideoClip({
  inputPath,
  outputPath,
  startTime,
  duration,
  aspectRatio = "9:16",
  reframeMode = "auto-tracker",
  splitScreen = false,
  transcript,
  headline,
  captionStyle = "hormozi",
}: RenderOptions): Promise<{ outputPath: string; tracking: TrackingResult }> {
  // Resolve input path if relative or web public path
  let resolvedInput = inputPath;
  if (!fs.existsSync(resolvedInput)) {
    const publicCandidate = path.join(process.cwd(), "public", inputPath.replace(/^\//, ""));
    if (fs.existsSync(publicCandidate)) {
      resolvedInput = publicCandidate;
    }
  }

  // Determine actual reframe mode
  let effectiveMode: ReframeMode = reframeMode;
  if (splitScreen) {
    effectiveMode = "split-screen";
  }

  // Run AI Subject Tracking
  let trackingResult: TrackingResult = {
    status: "success",
    mode: effectiveMode,
    filter_type: "vf",
    filter_value: "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920",
    summary: "Static center crop",
  };

  if (aspectRatio === "9:16") {
    try {
      trackingResult = await detectSubjectAndReframe(
        resolvedInput,
        startTime,
        duration,
        effectiveMode
      );
    } catch (e) {
      console.warn("AI Tracking warning:", e);
    }
  }

  return new Promise((resolve, reject) => {
    // Ensure output directory exists
    const dir = path.dirname(outputPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    let command = ffmpeg(resolvedInput)
      .setStartTime(startTime)
      .setDuration(duration);

    // Prepare subtitles
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

    let subtitleFilterStr: string | null = null;
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
      subtitleFilterStr = `subtitles='${srtEscaped}':force_style='${forceStyle}'`;
    }

    // Apply filters based on aspect ratio and tracking
    if (aspectRatio === "9:16") {
      if (trackingResult.filter_type === "filter_complex") {
        if (subtitleFilterStr) {
          command = command.complexFilter(
            `${trackingResult.filter_value}[base_v];[base_v]${subtitleFilterStr}[v]`,
            "v"
          );
        } else {
          command = command.complexFilter(trackingResult.filter_value);
        }
      } else {
        // Standard video filter array (auto-tracker or center crop)
        const filters = [trackingResult.filter_value];
        if (subtitleFilterStr) {
          filters.push(subtitleFilterStr);
        }
        command = command.videoFilters(filters);
      }
    } else if (aspectRatio === "1:1") {
      const filters = ["scale=1080:1080:force_original_aspect_ratio=increase,crop=1080:1080"];
      if (subtitleFilterStr) {
        filters.push(subtitleFilterStr);
      }
      command = command.videoFilters(filters);
    } else {
      // 16:9
      const filters: string[] = [];
      if (subtitleFilterStr) {
        filters.push(subtitleFilterStr);
      }
      if (filters.length > 0) {
        command = command.videoFilters(filters);
      }
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
        "-pix_fmt yuv420p",
        "-c:a aac",
        "-b:a 192k",
        "-movflags +faststart",
      ])
      .output(outputPath)
      .on("end", () => {
        cleanup();
        resolve({ outputPath, tracking: trackingResult });
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
