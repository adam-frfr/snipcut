import { execFile } from "child_process";
import util from "util";
import { getFfmpegBinary, TrackingResult } from "./videoService";

/**
 * Effects that decide for themselves, per clip, instead of being blanket
 * on/off switches (OpusClip-style):
 *
 *  - music bed only when the clip has no music / sound bed of its own
 *    (a vlog, gaming clip or music video already has one; stacking ours on
 *    top is muddy);
 *  - B-roll and punch zooms only on talking-head stretches: never over a
 *    split-screen (the split IS the visual) or a "fit" shot (screen
 *    recording, slides, wide scenery: the frame itself is the content).
 */

const execFileP = util.promisify(execFile);

export type Span = { start: number; end: number };

export interface BackgroundAudio {
  /** Level (dBFS) in the pauses between words. */
  gapDb: number | null;
  /** Level (dBFS) while words are spoken. */
  speechDb: number | null;
  /** Seconds of pause that were measured. */
  gapSeconds: number;
  /** true = the clip already carries music / a sound bed under the speech. */
  hasBackground: boolean;
  reason: string;
}

const FRAME = 0.05; // 50 ms analysis frames

/**
 * Decide from measured levels (pure, so it can be tested).
 * `floor` = quietest 5% and loudest 10% of ALL 50ms frames: between
 * syllables a clean voice track drops to room tone (measured on real
 * clips: -53..-64 dB, 33-49 dB under the voice) while music underneath
 * keeps the floor up (a music-backed vlog: -44 dB, only 22 dB of range).
 * Works on continuous speech (voiceovers, tutorials) where there are no
 * real pauses to measure.
 */
export function judgeBackground(
  gapDb: number | null,
  speechDb: number | null,
  gapSeconds: number,
  floor?: { p5: number; p90: number }
): BackgroundAudio {
  const floorSaysBed = floor ? floor.p5 > -48 && floor.p90 - floor.p5 < 28 : false;
  if (floorSaysBed && floor) {
    return {
      gapDb,
      speechDb,
      gapSeconds,
      hasBackground: true,
      reason: `sound never drops to silence (floor ${floor.p5.toFixed(0)} dB, ${(floor.p90 - floor.p5).toFixed(0)} dB under the voice) — the video already has music/sound`,
    };
  }
  if (gapDb === null || speechDb === null || gapSeconds < 0.8) {
    return {
      gapDb,
      speechDb,
      gapSeconds,
      hasBackground: false,
      reason: floor
        ? `clean voice track (floor ${floor.p5.toFixed(0)} dB, ${(floor.p90 - floor.p5).toFixed(0)} dB under the voice)`
        : "not enough audio to tell — assuming a clean voice track",
    };
  }
  // Clean speech: pauses sit 25-40 dB under the voice (room tone).
  // Music / sound bed: pauses stay loud, within ~16 dB of the voice.
  const hasBackground = gapDb > -45 && speechDb - gapDb < 16;
  return {
    gapDb,
    speechDb,
    gapSeconds,
    hasBackground,
    reason: hasBackground
      ? `pauses stay loud (${gapDb.toFixed(0)} dB vs voice ${speechDb.toFixed(0)} dB) — the video already has music/sound`
      : `quiet pauses (${gapDb.toFixed(0)} dB vs voice ${speechDb.toFixed(0)} dB) — clean voice track`,
  };
}

/**
 * Measure the source audio of a clip: loud pauses between words mean there
 * is music or another sound bed under the speech.
 * `words` and `start` are source-absolute seconds.
 */
export async function measureBackgroundAudio(
  inputPath: string,
  start: number,
  duration: number,
  words: Span[]
): Promise<BackgroundAudio> {
  const rate = 8000;
  let pcm: Buffer;
  try {
    const { stdout } = await execFileP(
      getFfmpegBinary(),
      ["-hide_banner", "-loglevel", "error", "-ss", start.toFixed(3), "-t", duration.toFixed(3), "-i", inputPath, "-vn", "-ac", "1", "-ar", String(rate), "-f", "s16le", "-"],
      { encoding: "buffer", maxBuffer: 64 * 1024 * 1024 }
    );
    pcm = stdout as unknown as Buffer;
  } catch {
    return judgeBackground(null, null, 0);
  }
  const samples = Math.floor(pcm.length / 2);
  const perFrame = Math.floor(rate * FRAME);
  const rel = words.map((w) => ({ start: w.start - start, end: w.end - start }));
  const gaps: number[] = [];
  const speech: number[] = [];
  const all: number[] = [];
  for (let f = 0; (f + 1) * perFrame <= samples; f++) {
    let sum = 0;
    for (let i = f * perFrame; i < (f + 1) * perFrame; i++) {
      const v = pcm.readInt16LE(i * 2) / 32768;
      sum += v * v;
    }
    const db = 10 * Math.log10(sum / perFrame + 1e-12);
    all.push(db);
    const t0 = f * FRAME;
    const t1 = t0 + FRAME;
    const inWord = rel.some((w) => t1 > w.start && t0 < w.end);
    // A pause frame must sit clear of any word (Whisper word edges are loose).
    const nearWord = rel.some((w) => t1 > w.start - 0.15 && t0 < w.end + 0.15);
    if (inWord) speech.push(db);
    else if (!nearWord) gaps.push(db);
  }
  const median = (a: number[]) => {
    if (!a.length) return null;
    const s = [...a].sort((x, y) => x - y);
    return s[Math.floor(s.length / 2)];
  };
  // Speech level: the louder half of word frames (consonant gaps inside words are quiet).
  const loud = [...speech].sort((x, y) => x - y).slice(Math.floor(speech.length / 2));
  const sortedAll = [...all].sort((x, y) => x - y);
  const q = (p: number) => sortedAll[Math.floor(p * (sortedAll.length - 1))];
  const floor = sortedAll.length >= 40 ? { p5: q(0.05), p90: q(0.9) } : undefined;
  return judgeBackground(median(gaps), median(loud), gaps.length * FRAME, floor);
}

export interface ShotMap {
  /** Single-speaker tracked crop (talking head). */
  crop: Span[];
  /** Whole frame over a blurred backdrop (screen recording, slides, scenery). */
  fit: Span[];
  /** Two speakers stacked. */
  split: Span[];
}

/** What kind of picture each stretch of the (span-relative) clip is. */
export function shotMap(tracking: TrackingResult | null | undefined, layoutMode: string, duration: number): ShotMap {
  const all = [{ start: 0, end: duration }];
  if (layoutMode === "split-screen") return { crop: [], fit: [], split: all };
  if (layoutMode === "blurred-fit") return { crop: [], fit: all, split: [] };
  const segs = tracking?.layoutSegments || [];
  if (layoutMode !== "auto-tracker" || segs.length === 0) return { crop: all, fit: [], split: [] };
  const pick = (kind: string) => segs.filter((s) => s.layout === kind).map((s) => ({ start: s.start, end: s.end }));
  return { crop: pick("crop"), fit: pick("fit"), split: pick("split") };
}

export const coverage = (spans: Span[], duration: number) =>
  duration > 0 ? spans.reduce((s, x) => s + Math.max(0, Math.min(duration, x.end) - Math.max(0, x.start)), 0) / duration : 0;

/** True when [start, end] lies inside one of `spans` (with a small tolerance). */
export const inside = (spans: Span[], start: number, end: number) =>
  spans.some((s) => start >= s.start - 0.05 && end <= s.end + 0.05);

export const overlaps = (spans: Span[], start: number, end: number, minOverlap = 0.15) =>
  spans.some((s) => Math.min(end, s.end) - Math.max(start, s.start) > minOverlap);
