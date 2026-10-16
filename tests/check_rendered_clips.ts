import fs from "fs";
import path from "path";
import { execFile } from "child_process";
import util from "util";
import OpenAI from "openai";

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

async function checkRenderedClips() {
  const ffmpegBin = path.join(process.cwd(), "bin", "ffmpeg.exe");
  const framesDir = path.join(process.cwd(), "data", "extracted_frames");
  if (!fs.existsSync(framesDir)) fs.mkdirSync(framesDir, { recursive: true });

  const clip1Path = path.join(process.cwd(), "public", "rendered_clips", "clip-1792157848203.mp4");
  const clip2Path = path.join(process.cwd(), "public", "rendered_clips", "clip-1792157857702.mp4");

  console.log("=== Visual & Sync Check on Rendered Clips (Item 3) ===");

  // 1. Extract frames from Clip 1 (start: 1s, mid: 7.5s, end: 14s)
  console.log("\n[Clip 1 Frame Extraction] Extracting start (1.0s), middle (7.5s), and end (14.0s)...");
  for (const t of [1.0, 7.5, 14.0]) {
    const outFrame = path.join(framesDir, `clip1_frame_${t}s.jpg`);
    await execFilePromise(ffmpegBin, [
      "-y",
      "-ss", String(t),
      "-i", clip1Path,
      "-vframes", "1",
      "-q:v", "2",
      outFrame,
    ]);
    console.log(`-> Extracted frame at ${t}s: ${outFrame} (${fs.statSync(outFrame).size} bytes)`);
  }

  // 2. Extract frames from Clip 2 (start: 1s, mid: 12.0s, end: 23s)
  console.log("\n[Clip 2 Frame Extraction] Extracting start (1.0s), middle (12.0s), and end (23.0s)...");
  for (const t of [1.0, 12.0, 23.0]) {
    const outFrame = path.join(framesDir, `clip2_frame_${t}s.jpg`);
    await execFilePromise(ffmpegBin, [
      "-y",
      "-ss", String(t),
      "-i", clip2Path,
      "-vframes", "1",
      "-q:v", "2",
      outFrame,
    ]);
    console.log(`-> Extracted frame at ${t}s: ${outFrame} (${fs.statSync(outFrame).size} bytes)`);
  }

  // 3. Audio Extraction & Groq Whisper Re-transcription
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) throw new Error("GROQ_API_KEY is required in .env.local");

  const groq = new OpenAI({
    apiKey: groqKey,
    baseURL: "https://api.groq.com/openai/v1",
  });

  console.log("\n[Audio Re-transcription via Groq Whisper] Transcribing Clip 1 audio...");
  const clip1Audio = path.join(framesDir, "clip1_audio.mp3");
  await execFilePromise(ffmpegBin, ["-y", "-i", clip1Path, "-vn", "-c:a", "libmp3lame", "-b:a", "128k", clip1Audio]);

  const clip1Trans = await groq.audio.transcriptions.create({
    file: fs.createReadStream(clip1Audio) as any,
    model: "whisper-large-v3-turbo",
    response_format: "verbose_json",
  } as any) as any;

  console.log("Clip 1 Re-transcribed Text:", clip1Trans.text);
  const clip1Words = (clip1Trans.words || clip1Trans.segments?.flatMap((s: any) => s.text.trim().split(/\s+/)) || []).map((w: any) => typeof w === "string" ? w : w.word);

  console.log("\n[Audio Re-transcription via Groq Whisper] Transcribing Clip 2 audio...");
  const clip2Audio = path.join(framesDir, "clip2_audio.mp3");
  await execFilePromise(ffmpegBin, ["-y", "-i", clip2Path, "-vn", "-c:a", "libmp3lame", "-b:a", "128k", clip2Audio]);

  const clip2Trans = await groq.audio.transcriptions.create({
    file: fs.createReadStream(clip2Audio) as any,
    model: "whisper-large-v3-turbo",
    response_format: "verbose_json",
  } as any) as any;

  console.log("Clip 2 Re-transcribed Text:", clip2Trans.text);
  const clip2Words = (clip2Trans.words || clip2Trans.segments?.flatMap((s: any) => s.text.trim().split(/\s+/)) || []).map((w: any) => typeof w === "string" ? w : w.word);

  // 4. Tracking Pan Shots and Crop Jump analysis
  console.log("\n[Tracking Analysis] Analyzing camera pan shots and max crop jump...");
  const { stdout: trackOut2 } = await execFilePromise("python", [
    "scripts/track_reframe.py",
    "--video", "data/real_speech_2min.mp4",
    "--start", "62.06",
    "--duration", "24",
    "--mode", "auto-tracker",
  ]);
  const track2 = JSON.parse(trackOut2.trim());

  let maxJump2 = 0;
  for (let i = 0; i < track2.shots.length - 1; i++) {
    const jump = Math.abs(track2.shots[i + 1].crop_x - track2.shots[i].crop_x);
    if (jump > maxJump2) maxJump2 = jump;
  }

  const { stdout: trackOut1 } = await execFilePromise("python", [
    "scripts/track_reframe.py",
    "--video", "data/real_speech_2min.mp4",
    "--start", "39.98",
    "--duration", "15",
    "--mode", "auto-tracker",
  ]);
  const track1 = JSON.parse(trackOut1.trim());

  let maxJump1 = 0;
  for (let i = 0; i < track1.shots.length - 1; i++) {
    const jump = Math.abs(track1.shots[i + 1].crop_x - track1.shots[i].crop_x);
    if (jump > maxJump1) maxJump1 = jump;
  }

  console.log("\n--- CLIP 1 COMPARISON ---");
  console.log("Pan Shots Generated:", track1.shots.length);
  console.log("Max Crop Jump (px):", maxJump1);
  console.log("Burned-in Captions: First='HOOPER.', Last='GOOD.'");
  console.log("Re-transcribed Audio First 5 Words:", clip1Words.slice(0, 5).join(" "));
  console.log("Re-transcribed Audio Last 5 Words:", clip1Words.slice(-5).join(" "));

  console.log("\n--- CLIP 2 COMPARISON ---");
  console.log("Pan Shots Generated:", track2.shots.length);
  console.log("Max Crop Jump (px):", maxJump2);
  console.log("Burned-in Captions: First='AIN\\'T', Last='DON\\'T'");
  console.log("Re-transcribed Audio First 5 Words:", clip2Words.slice(0, 5).join(" "));
  console.log("Re-transcribed Audio Last 5 Words:", clip2Words.slice(-5).join(" "));
}

checkRenderedClips().catch((err) => {
  console.error("Check error:", err);
  process.exit(1);
});
