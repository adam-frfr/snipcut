import { CuratedClipResult, WordTimestamp } from "./aiService";

export interface SnappedClipResult extends CuratedClipResult {
  rawStartTime: number;
  rawEndTime: number;
  snappedWords: {
    word: string;
    start: number;
    end: number;
  }[];
}

export interface SnapOptions {
  minDuration?: number; // default 5s
  maxDuration?: number; // default 90s
  totalDuration?: number;
  allowOverlap?: boolean; // default false
  targetPaddingSec?: number; // default 0.2s
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

const SENTENCE_END_REGEX = /[.?!…]+["']?$/;

/**
 * Snaps raw LLM start/end times to precise Whisper word boundaries,
 * clamps padding so it never bleeds into adjacent words (max half the gap),
 * prioritizes sentence punctuation boundaries, and validates constraints (min/max duration, no overlap).
 */
export function snapAndValidateClips(
  rawClips: CuratedClipResult[],
  words: WordTimestamp[] = [],
  options: SnapOptions = {}
): SnappedClipResult[] {
  const minDuration = options.minDuration ?? 5.0;
  const maxDuration = options.maxDuration ?? 90.0;
  const totalDuration = options.totalDuration;
  const targetPadding = options.targetPaddingSec ?? 0.2;
  const allowOverlap = options.allowOverlap ?? false;

  // Ensure words are sorted chronologically
  const sortedWords = [...words]
    .filter((w) => typeof w.start === "number" && typeof w.end === "number" && w.end >= w.start)
    .sort((a, b) => a.start - b.start);

  console.log(
    `[Stage: Word Snapping] Processing ${rawClips.length} candidate clips across ${sortedWords.length} Whisper words`
  );

  const snappedCandidates: (SnappedClipResult | null)[] = rawClips.map((clip, index): SnappedClipResult | null => {
    const rawStart = Math.max(0, clip.startTime);
    let rawEnd = Math.max(rawStart + 1, clip.endTime);

    // Rule: Drop clips that start at or beyond the video end (do not relocate them)
    if (totalDuration && totalDuration > 0) {
      if (rawStart >= totalDuration) {
        console.log(
          `[Stage: Word Snapping] Dropping clip "${clip.title}": start time ${rawStart}s is at or beyond video duration (${totalDuration}s)`
        );
        return null;
      }
      rawEnd = Math.min(rawEnd, totalDuration);
    }

    if (sortedWords.length === 0) {
      let finalStart = rawStart;
      let finalEnd = Math.max(finalStart + minDuration, rawEnd);
      if (finalEnd - finalStart > maxDuration) {
        finalEnd = finalStart + maxDuration;
      }
      if (totalDuration && totalDuration > 0) {
        finalEnd = Math.min(finalEnd, totalDuration);
      }

      return {
        ...clip,
        rawStartTime: rawStart,
        rawEndTime: rawEnd,
        startTime: Number(finalStart.toFixed(2)),
        endTime: Number(finalEnd.toFixed(2)),
        durationFormatted: formatDuration(finalEnd - finalStart),
        snappedWords: [],
      };
    }

    // --- 1. Snap Start Time ---
    // Search window within +/- 3.5s around rawStart
    let startIdx = 0;
    let minStartDiff = Infinity;
    let preferredSentenceStartIdx: number | null = null;
    let minSentenceStartDiff = Infinity;

    for (let i = 0; i < sortedWords.length; i++) {
      const w = sortedWords[i];
      const diff = Math.abs(w.start - rawStart);

      if (diff < minStartDiff) {
        minStartDiff = diff;
        startIdx = i;
      }

      // If previous word ends with punctuation, index `i` is the start of a sentence
      if (i > 0) {
        const prevW = sortedWords[i - 1];
        if (SENTENCE_END_REGEX.test(prevW.word.trim())) {
          if (diff < 2.5 && diff < minSentenceStartDiff) {
            minSentenceStartDiff = diff;
            preferredSentenceStartIdx = i;
          }
        }
      }
    }

    // Rule: Drop clips with no words in range (closest word > 3.5s away)
    if (minStartDiff > 3.5) {
      console.log(
        `[Stage: Word Snapping] Dropping clip "${clip.title}": closest word is ${minStartDiff.toFixed(1)}s away (no words in range of ${rawStart.toFixed(1)}s)`
      );
      return null;
    }

    const chosenStartIdx = preferredSentenceStartIdx !== null ? preferredSentenceStartIdx : startIdx;
    const startWord = sortedWords[chosenStartIdx];

    // Padding calculation: clamp to at most half the gap to the previous word
    let startPad = 0;
    if (chosenStartIdx > 0) {
      const prevWord = sortedWords[chosenStartIdx - 1];
      const gap = Math.max(0, startWord.start - prevWord.end);
      startPad = Math.min(targetPadding, gap / 2);
    } else {
      const gapToZero = Math.max(0, startWord.start);
      startPad = Math.min(targetPadding, gapToZero / 2);
    }

    let snappedStart = Math.max(0, startWord.start - startPad);

    // --- 2. Snap End Time ---
    // Search window within +/- 3.5s around rawEnd
    let endIdx = sortedWords.length - 1;
    let minEndDiff = Infinity;
    let preferredSentenceEndIdx: number | null = null;
    let minSentenceEndDiff = Infinity;

    for (let i = 0; i < sortedWords.length; i++) {
      const w = sortedWords[i];
      if (w.end < snappedStart) continue;
      const diff = Math.abs(w.end - rawEnd);

      if (diff < minEndDiff) {
        minEndDiff = diff;
        endIdx = i;
      }

      // If this word ends with punctuation, it is a clean sentence ending
      if (SENTENCE_END_REGEX.test(w.word.trim())) {
        if (diff < 3.0 && diff < minSentenceEndDiff) {
          minSentenceEndDiff = diff;
          preferredSentenceEndIdx = i;
        }
      }
    }

    let snappedEnd = rawEnd;
    if (minEndDiff <= 3.5) {
      const chosenEndIdx = preferredSentenceEndIdx !== null ? preferredSentenceEndIdx : endIdx;
      const endWord = sortedWords[chosenEndIdx];

      // Padding calculation: clamp to at most half the gap to the next word
      let endPad = 0;
      if (chosenEndIdx < sortedWords.length - 1) {
        const nextWord = sortedWords[chosenEndIdx + 1];
        const gap = Math.max(0, nextWord.start - endWord.end);
        endPad = Math.min(targetPadding, gap / 2);
      } else {
        endPad = targetPadding;
      }

      snappedEnd = endWord.end + endPad;
    }

    // --- 3. Validate Boundaries & Constraints ---
    if (totalDuration && totalDuration > 0) {
      snappedStart = Math.min(snappedStart, Math.max(0, totalDuration - minDuration));
      snappedEnd = Math.min(snappedEnd, totalDuration);
    }

    let clipDuration = snappedEnd - snappedStart;

    // Enforce min duration
    if (clipDuration < minDuration) {
      snappedEnd = snappedStart + minDuration;
      if (totalDuration && snappedEnd > totalDuration) {
        snappedEnd = totalDuration;
        snappedStart = Math.max(0, snappedEnd - minDuration);
      }
    }

    // Enforce max duration
    clipDuration = snappedEnd - snappedStart;
    if (clipDuration > maxDuration) {
      snappedEnd = snappedStart + maxDuration;
    }

    // Filter words within this clip
    const wordsInClip = sortedWords.filter(
      (w) => w.start >= snappedStart - 0.05 && w.end <= snappedEnd + 0.05
    );

    // Rule: Drop clip if no words fall within the final clip boundary
    if (wordsInClip.length === 0) {
      console.log(
        `[Stage: Word Snapping] Dropping clip "${clip.title}": 0 words found inside [${snappedStart.toFixed(1)}s - ${snappedEnd.toFixed(1)}s]`
      );
      return null;
    }

    const clipWords = wordsInClip.map((w) => ({
      word: w.word,
      start: Number((w.start - snappedStart).toFixed(2)),
      end: Number((w.end - snappedStart).toFixed(2)),
    }));

    console.log(
      `[Stage: Word Snapping] Clip #${index + 1} "${clip.title}": raw [${rawStart.toFixed(1)}s - ${rawEnd.toFixed(1)}s] -> snapped [${snappedStart.toFixed(2)}s - ${snappedEnd.toFixed(2)}s] (duration: ${(snappedEnd - snappedStart).toFixed(2)}s)`
    );

    return {
      ...clip,
      rawStartTime: rawStart,
      rawEndTime: rawEnd,
      startTime: Number(snappedStart.toFixed(2)),
      endTime: Number(snappedEnd.toFixed(2)),
      durationFormatted: formatDuration(snappedEnd - snappedStart),
      snappedWords: clipWords,
    };
  });

  const validCandidates = snappedCandidates.filter(
    (c): c is SnappedClipResult => c !== null
  );

  if (allowOverlap) {
    return validCandidates;
  }

  // --- 4. Resolve Overlaps (User requirement: no overlapping clips) ---
  // Prioritize higher virality score clips
  const sortedByVirality = [...validCandidates].sort(
    (a, b) => (b.viralityScore || 0) - (a.viralityScore || 0)
  );

  const nonOverlapping: SnappedClipResult[] = [];

  for (const candidate of sortedByVirality) {
    const isOverlapping = nonOverlapping.some((accepted) => {
      const overlapStart = Math.max(candidate.startTime, accepted.startTime);
      const overlapEnd = Math.min(candidate.endTime, accepted.endTime);
      if (overlapEnd > overlapStart) {
        const overlapDuration = overlapEnd - overlapStart;
        const candidateDuration = candidate.endTime - candidate.startTime;
        // Overlapping more than 3s or 20% of duration is rejected
        return overlapDuration > 3.0 || overlapDuration / candidateDuration > 0.2;
      }
      return false;
    });

    if (!isOverlapping) {
      nonOverlapping.push(candidate);
    } else {
      console.log(
        `[Stage: Word Snapping] Dropping overlapping clip: "${candidate.title}" [${candidate.startTime}s - ${candidate.endTime}s] due to conflict with higher-scoring clip`
      );
    }
  }

  // Re-sort chronologically for user presentation
  nonOverlapping.sort((a, b) => a.startTime - b.startTime);

  return nonOverlapping;
}
