/**
 * Clip timeline helpers shared by the server pipeline and the editor
 * (no Node imports, safe for client components).
 *
 * A produced clip is the source window [start, end] with some parts cut
 * out (pauses, um/uh fillers, words the user deleted). `keepRanges` are
 * the kept parts in SOURCE seconds; the output video plays them back to
 * back. toOutputTime / toSourceTime convert between the two clocks.
 */

export type Range = { start: number; end: number };

export interface TimelineWord {
  start: number;
  end: number;
  text?: string;
  word?: string;
  /** Removed by the user in the editor: cut from the video and captions. */
  deleted?: boolean;
}

const FILLER_WORDS = new Set(["um", "umm", "uh", "uhh", "er", "erm", "hmm", "mm", "mhm", "uhm", "eh"]);

export function isFillerWord(text: string): boolean {
  const clean = String(text || "").toLowerCase().replace(/[^a-z]/g, "");
  return FILLER_WORDS.has(clean);
}

export interface KeepRangeOptions {
  /** Cut pauses longer than this (seconds). Infinity = keep all pauses. */
  pauseGap?: number;
  /** Cut standalone um/uh fillers. */
  cutFillers?: boolean;
  /** Start/end on the first/last spoken word instead of the window edges. */
  tightEdges?: boolean;
}

/**
 * Keep-ranges for a clip: span from just before the first real word to
 * just after the last one (or the window edges when !tightEdges),
 * splitting wherever the gap between consecutive words exceeds `pauseGap`
 * (keeping a small breath of padding around each cut) and cutting filler
 * words and user-deleted words entirely. Returns the ranges plus how many
 * fillers were cut.
 */
export function computeKeepRanges(
  words: TimelineWord[],
  clipStart: number,
  clipEnd: number,
  opts: KeepRangeOptions = {}
): { ranges: Range[]; fillersRemoved: number; deletedRemoved: number } {
  const pauseGap = opts.pauseGap ?? 0.55;
  const cutFillers = opts.cutFillers ?? true;
  const tightEdges = opts.tightEdges ?? true;
  const ws = (words || [])
    .filter((w) => w.end > clipStart && w.start < clipEnd)
    .sort((a, b) => a.start - b.start);
  if (ws.length === 0) {
    return { ranges: tightEdges ? [] : [{ start: clipStart, end: clipEnd }], fillersRemoved: 0, deletedRemoved: 0 };
  }
  const ranges: Range[] = [];
  let fillersRemoved = 0;
  let deletedRemoved = 0;
  let rangeStart: number | null = tightEdges ? null : clipStart;
  let prevEnd = clipStart;
  let anyCut = false;
  const closeRange = (end: number) => {
    if (rangeStart !== null) {
      ranges.push({ start: rangeStart, end: Math.min(clipEnd, end) });
      rangeStart = null;
    }
  };
  for (const w of ws) {
    const isDeleted = Boolean(w.deleted);
    const isFiller = !isDeleted && cutFillers && isFillerWord(w.word || w.text || "");
    if (isDeleted || isFiller) {
      if (isDeleted) deletedRemoved++;
      else fillersRemoved++;
      // A user cut is exact (to the next word); filler cuts keep a breath.
      closeRange(isDeleted ? Math.min(w.start, prevEnd + 0.08) : prevEnd + 0.08);
      prevEnd = w.end;
      anyCut = true;
      continue;
    }
    if (rangeStart === null) {
      const pad = ranges.length === 0 && !anyCut ? 0.1 : 0.12;
      rangeStart = Math.max(clipStart, prevEnd, w.start - pad);
    } else if (w.start - prevEnd > pauseGap) {
      closeRange(prevEnd + 0.15);
      rangeStart = Math.max(clipStart, w.start - 0.12);
    }
    prevEnd = Math.max(prevEnd, w.end);
  }
  closeRange(tightEdges ? prevEnd + 0.18 : clipEnd);
  // 0.25s floor: anything shorter is encoder noise, but a lone real word
  // (e.g. "So" before an "um") legitimately forms a ~0.35s segment and
  // must never be dropped.
  return { ranges: ranges.filter((r) => r.end - r.start >= 0.25), fillersRemoved, deletedRemoved };
}

/**
 * Keep words in SPOKEN order with non-decreasing start times (in place).
 * Whisper sometimes stamps a word slightly before the one said ahead of it
 * ("time to work because" had "because" at 47.70s, before "to" at 47.86s);
 * sorting by time burned "BECAUSE TO WORK" into a caption.
 */
export function inSpokenOrder<W extends { start: number; end: number }>(words: W[]): W[] {
  for (let i = 1; i < words.length; i++) {
    const prev = words[i - 1];
    if (words[i].start < prev.start) {
      const start = Math.max(prev.start, Math.min(prev.end, words[i].end - 0.05));
      words[i] = { ...words[i], start, end: Math.max(words[i].end, start + 0.05) };
    }
  }
  return words;
}

/** Source time -> output time. Times inside a cut snap to the next kept frame. */
export function toOutputTime(ranges: Range[], t: number): number {
  let acc = 0;
  for (const r of ranges) {
    if (t < r.start) return acc;
    if (t <= r.end) return acc + (t - r.start);
    acc += r.end - r.start;
  }
  return acc;
}

/** Output time -> source time. */
export function toSourceTime(ranges: Range[], t: number): number {
  let acc = 0;
  for (const r of ranges) {
    const len = r.end - r.start;
    if (t <= acc + len) return r.start + Math.max(0, t - acc);
    acc += len;
  }
  const last = ranges[ranges.length - 1];
  return last ? last.end : t;
}

export function keptDuration(ranges: Range[]): number {
  return ranges.reduce((s, r) => s + (r.end - r.start), 0);
}

/** Words that survive the cut, re-timed onto the output clock. */
export function wordsOnOutput<W extends TimelineWord>(words: W[], ranges: Range[]): (W & { start: number; end: number })[] {
  const out: (W & { start: number; end: number })[] = [];
  for (const w of words) {
    if (w.deleted) continue;
    const mid = (w.start + w.end) / 2;
    const r = ranges.find((rg) => mid >= rg.start && mid <= rg.end);
    if (!r) continue;
    const start = toOutputTime(ranges, Math.max(w.start, r.start));
    const end = toOutputTime(ranges, Math.min(w.end, r.end));
    out.push({ ...w, start: Number(start.toFixed(3)), end: Number(Math.max(start + 0.05, end).toFixed(3)) });
  }
  return out;
}

/**
 * Effects that change the clip's clock (speed-up, freeze-frame, voiceover
 * intro, cold-open teaser) are described by knots: [cutTime, finalTime]
 * pairs, increasing. Between knots time is linear; two knots with the same
 * cutTime are a hold (the picture is frozen / the teaser plays).
 * Empty or missing = the final clip plays the cut clip 1:1.
 */
export type TimeKnots = [number, number][];

/** Cut-clip time -> final clip time. */
export function knotsForward(knots: TimeKnots | undefined | null, t: number): number {
  if (!knots || knots.length < 2) return t;
  for (let i = knots.length - 1; i >= 0; i--) {
    const [c, f] = knots[i];
    if (t >= c - 1e-6) {
      const next = knots[i + 1];
      if (!next) return f + (t - c);
      const span = next[0] - c;
      return span > 1e-6 ? f + ((t - c) * (next[1] - f)) / span : f;
    }
  }
  return knots[0][1] + (t - knots[0][0]);
}

/** Final clip time -> cut-clip time (inside a hold: the held moment). */
export function knotsInverse(knots: TimeKnots | undefined | null, T: number): number {
  if (!knots || knots.length < 2) return T;
  for (let i = knots.length - 1; i >= 0; i--) {
    const [c, f] = knots[i];
    if (T >= f - 1e-6) {
      const next = knots[i + 1];
      if (!next) return c + (T - f);
      const span = next[1] - f;
      return span > 1e-6 ? c + ((T - f) * (next[0] - c)) / span : c;
    }
  }
  return knots[0][0];
}
