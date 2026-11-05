/**
 * Clip boundaries must land on word edges — ideally sentence edges — in
 * every corner case: the prompt's sentence lines, over-long clips, too-short
 * clips, and clips trimmed to resolve overlaps.
 */
import { buildSentenceLines } from "../src/lib/aiService";
import { snapAndValidateClips } from "../src/lib/wordSnapping";
import type { CuratedClipResult } from "../src/lib/aiService";

const failures: string[] = [];
const check = (cond: boolean, msg: string) => {
  console.log(`${cond ? "-> PASS" : "-> FAIL"}: ${msg}`);
  if (!cond) failures.push(msg);
};

/** Synthetic speech: sentences of `len` words, 0.4s per word, 0.6s pause between sentences. */
function speech(sentences: number, len: number) {
  const words: { word: string; start: number; end: number }[] = [];
  let t = 1.0;
  for (let s = 0; s < sentences; s++) {
    for (let i = 0; i < len; i++) {
      const last = i === len - 1;
      words.push({ word: `s${s}w${i}${last ? "." : ""}`, start: Number(t.toFixed(2)), end: Number((t + 0.35).toFixed(2)) });
      t += 0.4;
    }
    t += 0.6;
  }
  return words;
}

const clip = (startTime: number, endTime: number, title = "c"): CuratedClipResult =>
  ({ title, hookHeadline: title, startTime, endTime, durationFormatted: "", viralityScore: 90 } as CuratedClipResult);

/** A boundary is clean if it is not strictly inside any word. */
const insideWord = (t: number, words: { start: number; end: number }[]) =>
  words.some((w) => t > w.start + 0.01 && t < w.end - 0.01);

const words = speech(40, 10); // ~180s of speech, sentences every ~4.6s

// 1. Prompt lines are single sentences with exact times
{
  const lines = buildSentenceLines(words);
  check(lines.length === 40, `one prompt line per sentence (${lines.length} lines)`);
  check(lines[3].start === words[30].start && lines[3].end === words[39].end, "line times are the sentence's first-word start and last-word end");
  check(lines.every((l) => l.end - l.start < 6), "no line spans more than one sentence");
  const segLines = buildSentenceLines([], [{ start: 0, end: 5, text: "Hello there." }, { start: 5.2, end: 9, text: "Next." }]);
  check(segLines.length === 2 && segLines[1].start === 5.2, "falls back to segments when there are no word timings");
}

// 2. Over-long clip (LLM asks for 0-150s, max is 90s) ends on a sentence end
{
  const [c] = snapAndValidateClips([clip(1.0, 150)], words, { maxDuration: 90 });
  const dur = c.endTime - c.startTime;
  check(dur <= 90.001, `over-long clip capped at 90s (got ${dur.toFixed(2)}s)`);
  check(!insideWord(c.endTime, words), `over-long clip end ${c.endTime}s is not mid-word`);
  const lastWord = c.snappedWords[c.snappedWords.length - 1];
  check(/\.$/.test(lastWord.word), `over-long clip ends after a full sentence (last word "${lastWord.word}")`);
}

// 3. Too-short clip is extended to a word boundary
{
  const [c] = snapAndValidateClips([clip(10.2, 11.5)], words, { minDuration: 5 });
  check(!!c && c.endTime - c.startTime >= 5, `short clip extended to >= 5s (${c ? (c.endTime - c.startTime).toFixed(2) : "dropped"})`);
  check(!!c && !insideWord(c.endTime, words), `extended end ${c?.endTime}s is not mid-word`);
}

// 4. Overlap trim starts the later clip on a sentence start
{
  // Sentence k starts at 1 + 5k*... compute from words: find starts of sentences 4 and 8
  const s4 = words[40].start;
  const s8end = words[89].end;
  const s6mid = words[65].start; // inside sentence 6
  const out = snapAndValidateClips([clip(s4, s6mid + 0.1, "first"), clip(words[50].start, s8end, "second")], words, {
    minDuration: 5,
  });
  const second = out.find((c) => c.title === "second");
  check(!!second, "overlapping later clip kept after trimming");
  if (second) {
    const first = out.find((c) => c.title === "first")!;
    check(second.startTime >= first.endTime - 0.5, `trimmed clip starts after the first ends (${second.startTime} vs ${first.endTime})`);
    check(!insideWord(second.startTime, words), `trimmed start ${second.startTime}s is not mid-word`);
    const firstWord = second.snappedWords[0];
    const idx = words.findIndex((w) => w.start === firstWord.start);
    check(idx > 0 && /\.$/.test(words[idx - 1].word), `trimmed clip opens on a sentence start ("${firstWord.word}")`);
  }
}

if (failures.length) {
  console.error(`\nCLIP BOUNDARY FAILURES: ${failures.length}`);
  process.exit(1);
}
console.log("\nALL CLIP BOUNDARY TESTS PASSED!");
