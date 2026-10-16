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
  maxShiftSec?: number; // default 3.0s
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

const SENTENCE_END_REGEX = /[.?!…]+["']?$/;

/**
 * Snaps raw LLM start/end times to precise Whisper word boundaries:
 * 1. A start boundary is the word AFTER a sentence-ending word, not the punctuated word itself.
 * 2. Never moves a start or end more than 3s from the raw value (drops or snaps to nearest word in range).
 * 3. Clamps end to totalDuration exactly.
 * 4. Clips may not overlap by more than 0.5s: trims the later clip's start or drops it.
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
  const maxShift = options.maxShiftSec ?? 3.0;

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

    // Rule: Drop clips that start at or beyond the video end
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
    // Rule: Never move start more than 3s from raw value.
    // Rule: A start boundary is the word AFTER a sentence-ending word, not the punctuated word itself.
    // Test: "...hooper." "Ain't..." must start at "Ain't".
    const wordsNearStart = sortedWords
      .map((w, idx) => ({ word: w, idx, diff: Math.abs(w.start - rawStart) }))
      .filter((item) => item.diff <= maxShift);

    if (wordsNearStart.length === 0) {
      console.log(
        `[Stage: Word Snapping] Dropping clip "${clip.title}": no words within ${maxShift}s of rawStart ${rawStart.toFixed(2)}s`
      );
      return null;
    }

    // Identify candidate sentence starts in range:
    // A word is a sentence start if it is index 0 OR the PRECEDING word ended with sentence punctuation.
    // A punctuated word itself (e.g. "...hooper.") is NEVER the start boundary!
    const sentenceStartCandidates = wordsNearStart.filter((item) => {
      const i = item.idx;
      if (i === 0) return true;
      const prevWord = sortedWords[i - 1];
      const isAfterSentenceEnd = SENTENCE_END_REGEX.test(prevWord.word.trim());
      return isAfterSentenceEnd;
    });

    let chosenStartIdx: number;

    if (sentenceStartCandidates.length > 0) {
      // Prefer sentence start at or before rawStart, else closest within range
      const beforeStarts = sentenceStartCandidates.filter((c) => c.word.start <= rawStart);
      if (beforeStarts.length > 0) {
        beforeStarts.sort((a, b) => b.word.start - a.word.start); // closest before rawStart
        chosenStartIdx = beforeStarts[0].idx;
      } else {
        sentenceStartCandidates.sort((a, b) => a.diff - b.diff); // closest overall
        chosenStartIdx = sentenceStartCandidates[0].idx;
      }
    } else {
      // No sentence start within 3s -> snap to nearest word boundary in range
      // But avoid starting on a word that ends with sentence punctuation if the next word is also in range
      wordsNearStart.sort((a, b) => a.diff - b.diff);
      let bestItem = wordsNearStart[0];
      if (
        SENTENCE_END_REGEX.test(bestItem.word.word.trim()) &&
        bestItem.idx < sortedWords.length - 1
      ) {
        const nextItem = sortedWords[bestItem.idx + 1];
        if (Math.abs(nextItem.start - rawStart) <= maxShift) {
          bestItem = { word: nextItem, idx: bestItem.idx + 1, diff: Math.abs(nextItem.start - rawStart) };
        }
      }
      chosenStartIdx = bestItem.idx;
    }

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
    // Hard clamp: never exceed maxShift (3s) from rawStart
    if (Math.abs(snappedStart - rawStart) > maxShift) {
      snappedStart = rawStart < startWord.start ? rawStart + maxShift : rawStart - maxShift;
    }

    // --- 2. Snap End Time ---
    // Rule: Never move end more than 3s from raw value.
    // Rule: Prefer sentence-ending words (punctuated words) within range.
    // Clamp rawEnd to totalDuration exactly
    if (totalDuration && totalDuration > 0) {
      rawEnd = Math.min(rawEnd, totalDuration);
    }

    const wordsNearEnd = sortedWords
      .map((w, idx) => ({ word: w, idx, diff: Math.abs(w.end - rawEnd) }))
      .filter((item) => item.word.end >= snappedStart && item.diff <= maxShift);

    let chosenEndIdx: number;

    if (wordsNearEnd.length === 0) {
      // If rawEnd is near totalDuration, clamp directly to totalDuration
      if (totalDuration && Math.abs(totalDuration - rawEnd) <= maxShift) {
        chosenEndIdx = sortedWords.length - 1;
      } else {
        console.log(
          `[Stage: Word Snapping] Dropping clip "${clip.title}": no words within ${maxShift}s of rawEnd ${rawEnd.toFixed(2)}s`
        );
        return null;
      }
    } else {
      // Prefer sentence ending words within range
      const sentenceEndCandidates = wordsNearEnd.filter((item) =>
        SENTENCE_END_REGEX.test(item.word.word.trim())
      );

      if (sentenceEndCandidates.length > 0) {
        // Prefer sentence end at or after rawEnd, else closest
        const afterEnds = sentenceEndCandidates.filter((c) => c.word.end >= rawEnd);
        if (afterEnds.length > 0) {
          afterEnds.sort((a, b) => a.word.end - b.word.end); // closest after rawEnd
          chosenEndIdx = afterEnds[0].idx;
        } else {
          sentenceEndCandidates.sort((a, b) => a.diff - b.diff);
          chosenEndIdx = sentenceEndCandidates[0].idx;
        }
      } else {
        // Nearest word end in range
        wordsNearEnd.sort((a, b) => a.diff - b.diff);
        chosenEndIdx = wordsNearEnd[0].idx;
      }
    }

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

    let snappedEnd = endWord.end + endPad;

    // Hard clamp to totalDuration exactly:
    // If the clip was requested up to or past totalDuration, snap end directly to totalDuration
    if (totalDuration && totalDuration > 0) {
      if (clip.endTime >= totalDuration || rawEnd >= totalDuration) {
        snappedEnd = totalDuration;
      } else {
        snappedEnd = Math.min(snappedEnd, totalDuration);
      }
    }

    // Hard clamp: never exceed maxShift (3s) from rawEnd (unless clamped to totalDuration)
    if (Math.abs(snappedEnd - rawEnd) > maxShift && (!totalDuration || rawEnd < totalDuration)) {
      snappedEnd = rawEnd < endWord.end ? rawEnd + maxShift : rawEnd - maxShift;
    }

    // Ensure start < end
    if (snappedEnd <= snappedStart) {
      return null;
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

    // Clamp end to totalDuration exactly
    if (totalDuration && totalDuration > 0) {
      snappedEnd = Math.min(snappedEnd, totalDuration);
    }

    // Filter words within this clip
    const wordsInClip = sortedWords.filter(
      (w) => w.start >= snappedStart - 0.05 && w.end <= snappedEnd + 0.05
    );

    if (wordsInClip.length === 0) {
      console.log(
        `[Stage: Word Snapping] Dropping clip "${clip.title}": 0 words found inside [${snappedStart.toFixed(1)}s - ${snappedEnd.toFixed(1)}s]`
      );
      return null;
    }

    const finalStart = Number(snappedStart.toFixed(2));
    const finalEnd = Number(snappedEnd.toFixed(2));

    const clipWords = wordsInClip.map((w) => ({
      word: w.word,
      start: Number((w.start - finalStart).toFixed(2)),
      end: Number((w.end - finalStart).toFixed(2)),
    }));

    console.log(
      `[Stage: Word Snapping] Clip #${index + 1} "${clip.title}": raw [${rawStart.toFixed(1)}s - ${rawEnd.toFixed(1)}s] -> snapped [${finalStart.toFixed(2)}s - ${finalEnd.toFixed(2)}s] (duration: ${(finalEnd - finalStart).toFixed(2)}s)`
    );

    return {
      ...clip,
      rawStartTime: rawStart,
      rawEndTime: rawEnd,
      startTime: finalStart,
      endTime: finalEnd,
      durationFormatted: formatDuration(finalEnd - finalStart),
      snappedWords: clipWords,
    };
  });

  const validCandidates = snappedCandidates.filter(
    (c): c is SnappedClipResult => c !== null
  );

  if (allowOverlap) {
    return validCandidates;
  }

  // --- 4. Resolve Overlaps ---
  // Rule: Clips may not overlap by more than 0.5s: trim the later clip's start or drop it.
  // Sort candidates chronologically
  validCandidates.sort((a, b) => a.startTime - b.startTime);

  const nonOverlapping: SnappedClipResult[] = [];

  for (let i = 0; i < validCandidates.length; i++) {
    const current = validCandidates[i];
    if (nonOverlapping.length === 0) {
      nonOverlapping.push(current);
      continue;
    }

    const prev = nonOverlapping[nonOverlapping.length - 1];
    const overlapDuration = Number((prev.endTime - current.startTime).toFixed(2));

    if (overlapDuration > 0.5) {
      // Overlap exceeds 0.5s -> Trim later clip's start to prev.endTime
      const trimmedStart = Number(prev.endTime.toFixed(2));
      const remainingDuration = Number((current.endTime - trimmedStart).toFixed(2));

      if (remainingDuration >= minDuration) {
        // Re-filter words within trimmed bounds
        const trimmedWords = sortedWords.filter(
          (w) => w.start >= trimmedStart - 0.05 && w.end <= current.endTime + 0.05
        );

        if (trimmedWords.length > 0) {
          console.log(
            `[Stage: Word Snapping] Overlap ${overlapDuration.toFixed(2)}s > 0.5s: Trimmed "${current.title}" start from ${current.startTime}s to ${trimmedStart}s (new duration: ${remainingDuration.toFixed(2)}s)`
          );
          current.startTime = trimmedStart;
          current.snappedWords = trimmedWords.map((w) => ({
            word: w.word,
            start: Number((w.start - trimmedStart).toFixed(2)),
            end: Number((w.end - trimmedStart).toFixed(2)),
          }));
          current.durationFormatted = formatDuration(remainingDuration);
          nonOverlapping.push(current);
        } else {
          console.log(
            `[Stage: Word Snapping] Dropping overlapping clip: "${current.title}" [${current.startTime}s - ${current.endTime}s] (0 words after trim)`
          );
        }
      } else {
        console.log(
          `[Stage: Word Snapping] Dropping overlapping clip: "${current.title}" [${current.startTime}s - ${current.endTime}s] (remaining ${remainingDuration.toFixed(2)}s < min ${minDuration}s)`
        );
      }
    } else {
      nonOverlapping.push(current);
    }
  }

  return nonOverlapping;
}
