import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { CLAUDE_DEEP_MODEL, CLAUDE_FAST_MODEL } from "./claudeModels";

export interface WordTimestamp {
  word: string;
  start: number;
  end: number;
}

export interface CuratedClipResult {
  title: string;
  hookHeadline: string;
  startTime: number;
  endTime: number;
  durationFormatted: string;
  viralityScore: number;
  hookStrength: number;
  engagementScore: number;
  trendMatch: number;
  viralityReason: string;
  keyPhrases: string[];
  suggestedEmojis: string[];
  description?: string;
}

export function isHackClubKey(key: string): boolean {
  return key.trim().startsWith("sk-hc-v1-");
}

export function getOpenAIClient(apiKey?: string): OpenAI {
  const key = (apiKey || process.env.OPENAI_API_KEY || "").trim();
  if (!key) {
    throw new Error("API key is missing. Please provide it in Settings or .env.local");
  }

  // If it's a HackClub AI key, route through HackClub OpenAI-compatible proxy
  if (isHackClubKey(key)) {
    return new OpenAI({
      apiKey: key,
      baseURL: "https://ai.hackclub.com/proxy/v1",
    });
  }

  return new OpenAI({ apiKey: key });
}

export function extractClipsFromJsonString(rawContent: string): CuratedClipResult[] {
  const cleaned = rawContent
    .replace(/```json/g, "")
    .replace(/```/g, "")
    // Models sometimes leak markdown before a key (`*"hookHeadline": ...`)
    // or leave trailing commas; either makes JSON.parse drop the clip.
    .replace(/([{,]\s*)[*_]+\s*"/g, '$1"')
    .replace(/,(\s*[}\]])/g, "$1")
    .trim();

  // 1. Direct JSON parse
  try {
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    if (parsed?.clips && Array.isArray(parsed.clips) && parsed.clips.length > 0) return parsed.clips;
  } catch (e) {}

  // 2. Outermost object match
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (match) {
    try {
      const parsed = JSON.parse(match[0]);
      if (parsed?.clips && Array.isArray(parsed.clips) && parsed.clips.length > 0) return parsed.clips;
    } catch (e) {}
  }

  // 3. Robust partial JSON recovery: find individual clip objects
  const clipRegex = /\{[^{}]*"title"[^{}]*"startTime"[^{}]*\}/g;
  const found = cleaned.match(clipRegex);
  if (found && found.length > 0) {
    const recovered: CuratedClipResult[] = [];
    for (const item of found) {
      try {
        const obj = JSON.parse(item);
        if (obj.title && obj.startTime !== undefined) {
          recovered.push(obj);
        }
      } catch (err) {}
    }
    if (recovered.length > 0) return recovered;
  }

  return [];
}

export interface SentenceLine {
  start: number;
  end: number;
  text: string;
}

/**
 * One line per sentence with exact start/end times, for the curation prompt.
 * Built from word timestamps when available (a sentence ends at . ? ! or
 * at a pause over 1.2s; very long run-ons are split at 30 words). Falls back
 * to transcription segments, which Whisper already cuts near sentence edges.
 */
export function buildSentenceLines(
  words?: { word?: string; text?: string; start: number; end: number }[],
  segments?: { start: number; end: number; text: string }[]
): SentenceLine[] {
  const ws = (words || [])
    .map((w) => ({ text: String(w.word ?? w.text ?? "").trim(), start: Number(w.start), end: Number(w.end) }))
    .filter((w) => w.text && Number.isFinite(w.start) && Number.isFinite(w.end) && w.end >= w.start)
    .sort((a, b) => a.start - b.start);

  const lines: SentenceLine[] = [];
  if (ws.length > 0) {
    let cur: typeof ws = [];
    const flush = () => {
      if (cur.length) {
        lines.push({ start: cur[0].start, end: cur[cur.length - 1].end, text: cur.map((w) => w.text).join(" ") });
        cur = [];
      }
    };
    for (let i = 0; i < ws.length; i++) {
      const w = ws[i];
      if (cur.length && w.start - cur[cur.length - 1].end > 1.2) flush();
      cur.push(w);
      if (/[.?!…]["')\]]?$/.test(w.text) || cur.length >= 30) flush();
    }
    flush();
    return lines;
  }

  for (const sg of segments || []) {
    if (!sg || typeof sg.start !== "number" || typeof sg.end !== "number" || !String(sg.text || "").trim()) continue;
    lines.push({ start: sg.start, end: sg.end, text: String(sg.text).trim() });
  }
  return lines;
}

/**
 * Prompt Claude or ChatGPT to analyze the full transcript and extract viral golden nuggets
 */
export async function analyzeTranscriptForViralClips({
  transcriptText,
  words,
  customPrompt,
  model = "claude-3-5-haiku",
  openaiKey,
  claudeKey,
  groqKey,
  segments,
}: {
  transcriptText: string;
  words?: WordTimestamp[];
  customPrompt?: string;
  model?: string;
  openaiKey?: string;
  claudeKey?: string;
  groqKey?: string;
  segments?: { start: number; end: number; text: string }[];
}): Promise<CuratedClipResult[]> {
  const activeOpenaiKey = (openaiKey || process.env.OPENAI_API_KEY || "").trim();
  const activeClaudeKey = (claudeKey || process.env.ANTHROPIC_API_KEY || "").trim();
  const activeGroqKey = (groqKey || process.env.GROQ_API_KEY || "").trim();
  const hackclubKey = [openaiKey, claudeKey, process.env.HACKCLUB_API_KEY]
    .map((k) => (k || "").trim())
    .find((k) => isHackClubKey(k));
  const activeKey = hackclubKey || activeOpenaiKey;

  const systemPrompt = `You are Snipcut AI, an expert video curation assistant for TikTok, YouTube Shorts, and Instagram Reels.
Your task is to analyze video transcripts and extract 1 to 6 standalone viral short clips (ALWAYS return at least 1 clip, even if the transcript is short or concise).

Guidelines for Virality Score (0-100):
- Hook Quality (0-3s): Does it start with an immediate contrarian question, shocking fact, or high-stakes premise?
- Retention Pacing: Is the thought compact, fast-paced, and free of fluff?
- Emotional Resonance: Does it evoke curiosity, inspiration, disagreement, or humor?
- Standalone Coherence: Can a viewer scrolling TikTok understand this without needing 30 minutes of backstory?

${customPrompt ? `User Preference Instruction: "${customPrompt}"` : ""}

You MUST respond strictly in valid JSON matching this schema:
{
  "clips": [
    {
      "title": "Short punchy video title with 1 emoji",
      "hookHeadline": "Opening sentence that hooks viewer in second 0-3",
      "startTime": 0,
      "endTime": 30.0,
      "durationFormatted": "0:30",
      "viralityScore": 96,
      "hookStrength": 97,
      "engagementScore": 94,
      "trendMatch": 95,
      "viralityReason": "Detailed explanation of why this segment will hook viewers on social feeds",
      "keyPhrases": ["exponential compute", "obsolete", "inflection point"],
      "suggestedEmojis": [],
      "description": "Ready-to-post social caption: 1-2 punchy sentences about this clip, ending with 3-5 relevant hashtags like #publicspeaking #communication"
    }
  ]
}`;

  // ---- Provider-agnostic single curation call (returns raw model text) ----
  const isGroqOnly = !hackclubKey && !activeOpenaiKey && !!activeGroqKey && !(activeClaudeKey && (model.includes("claude") || !activeOpenaiKey));
  const callCuration = async (userContent: string): Promise<string> => {
    if (activeClaudeKey && !hackclubKey && (model.includes("claude") || !activeOpenaiKey)) {
      const anthropicModel = model.includes("sonnet") ? CLAUDE_DEEP_MODEL : CLAUDE_FAST_MODEL;
      console.log(`[Stage: AI Curation] Calling Anthropic Claude (${anthropicModel})...`);
      const anthropic = new Anthropic({ apiKey: activeClaudeKey });
      const response = await anthropic.messages.create({
        model: anthropicModel,
        max_tokens: 4000,
        system: systemPrompt,
        messages: [{ role: "user", content: userContent }],
      });
      return response.content
        .filter((b) => b.type === "text")
        .map((b) => (b as { text: string }).text)
        .join("");
    }

    if (isGroqOnly) {
      // Groq free tier: 8000 tokens/min. Callers keep each request small
      // (windowed transcript) and pace calls; here we fail over key2 -> smaller model.
      const groqKeys = [activeGroqKey, (process.env.GROQ_API_KEY2 || "").trim()].filter(
        (k, idx, arr) => k && arr.indexOf(k) === idx
      );
      const groqModels = ["openai/gpt-oss-120b", "openai/gpt-oss-20b"];
      let lastErr: unknown = null;
      for (const key of groqKeys) {
        const groq = new OpenAI({ apiKey: key, baseURL: "https://api.groq.com/openai/v1" });
        // Strict JSON mode first; Groq rejects slightly-off JSON with a 400
        // "Failed to validate JSON", which used to drop the whole transcript
        // window (minutes of video never considered). Then retry once
        // without JSON mode — the tolerant clip extractor handles prose.
        const attempts = [
          ...groqModels.map((m) => ({ model: m, json: true })),
          { model: groqModels[0], json: false },
        ];
        for (const attempt of attempts) {
          try {
            console.log(`[Stage: AI Curation] Calling Groq (${attempt.model}${attempt.json ? "" : ", plain"})...`);
            const response = await groq.chat.completions.create({
              model: attempt.model,
              ...(attempt.json ? { response_format: { type: "json_object" as const } } : {}),
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userContent },
              ],
            });
            return response.choices[0]?.message?.content || "";
          } catch (err) {
            lastErr = err;
            // The rejected output usually holds usable clips — salvage it.
            const failed = (err as { error?: { failed_generation?: unknown } })?.error?.failed_generation;
            if (typeof failed === "string" && extractClipsFromJsonString(failed).length > 0) {
              console.warn(`[Stage: AI Curation] Groq ${attempt.model} JSON was rejected; recovered clips from its output`);
              return failed;
            }
            const status = (err as { status?: number })?.status;
            console.warn(`[Stage: AI Curation] Groq ${attempt.model} failed (${status ?? "error"}), trying next: ${err instanceof Error ? err.message : err}`);
            // Free tier is 8000 tokens/min: after a rate limit, wait before retrying.
            if (status === 429) await sleep(15000);
          }
        }
      }
      throw lastErr instanceof Error ? lastErr : new Error("All Groq curation attempts failed");
    }

    if (isHackClubKey(activeKey)) {
      let targetModel = "~anthropic/claude-sonnet-latest";
      if (model.includes("haiku")) {
        targetModel = "~anthropic/claude-haiku-latest";
      } else if (model.includes("gpt") || model.includes("mini")) {
        targetModel = "~openai/gpt-mini-latest";
      }
      const client = getOpenAIClient(activeKey);
      const response = await client.chat.completions.create({
        model: targetModel,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        max_tokens: 4000,
      });
      return response.choices[0]?.message?.content || "";
    }

    // Standard OpenAI
    const client = getOpenAIClient(activeKey);
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent },
      ],
    });
    return response.choices[0]?.message?.content || "{}";
  };

  // ---- Build timestamped transcript lines ----
  // The LLM can only return accurate startTime/endTime if it can SEE the times.
  // Lines used to be 20-second blocks with one start stamp each, so a hook
  // that began mid-block could only be guessed — and word snapping only
  // searches ±3s, so clips started mid-thought and ended mid-sentence. Now
  // every line is ONE sentence with its exact start AND end time.
  const blocks = buildSentenceLines(words, segments);

  // ---- Split blocks into windows small enough for free-tier token limits ----
  // ~3200 chars of transcript per window (~800 tokens) keeps system+transcript+response
  // comfortably under Groq's 8000 TPM when paced.
  const WINDOW_CHARS = 3200;
  interface TWindow { start: number; end: number; body: string }
  const windows: TWindow[] = [];
  if (blocks.length > 0) {
    let curLines: string[] = [];
    let curStart = blocks[0].start;
    let curEnd = blocks[0].end;
    let curLen = 0;
    for (const b of blocks) {
      const line = `[${b.start.toFixed(1)}-${b.end.toFixed(1)}] ${b.text}`;
      if (curLen + line.length > WINDOW_CHARS && curLines.length > 0) {
        windows.push({ start: curStart, end: curEnd, body: curLines.join("\n") });
        curLines = [];
        curLen = 0;
        curStart = b.start;
      }
      curLines.push(line);
      curLen += line.length;
      curEnd = b.end;
    }
    if (curLines.length > 0) windows.push({ start: curStart, end: curEnd, body: curLines.join("\n") });
  } else {
    // No segment timestamps available: fall back to chunked raw text (times unreliable)
    for (let off = 0; off < transcriptText.length; off += WINDOW_CHARS) {
      windows.push({ start: 0, end: Number.MAX_SAFE_INTEGER, body: transcriptText.slice(off, off + WINDOW_CHARS) });
    }
    if (windows.length === 0) windows.push({ start: 0, end: Number.MAX_SAFE_INTEGER, body: transcriptText });
  }

  console.log(`[Stage: AI Curation] Curating ${windows.length} window(s) from ${blocks.length} timestamped blocks`);

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const allClips: CuratedClipResult[] = [];
  let failedWindows = 0;
  let lastError: unknown = null;

  for (let wi = 0; wi < windows.length; wi++) {
    const w = windows[wi];
    const perWindow = windows.length === 1 ? 4 : 2;
    const userContent =
      blocks.length > 0
        ? `Here is a section of a video transcript from ${Math.floor(w.start)}s to ${Math.floor(w.end)}s. Each line is one sentence and begins with its start and end time in seconds, like [123.4-128.9].\n\n${w.body}\n\nExtract up to ${perWindow} standalone viral clips WHOLLY INSIDE ${Math.floor(w.start)}s-${Math.floor(w.end)}s. A clip is a run of consecutive lines: startTime MUST be copied exactly from the START time of its first line (the hook sentence), and endTime MUST be copied exactly from the END time of its last line, so the clip opens on a complete sentence and ends after one. Never start on a line that continues a previous thought, and end where the point lands. Each clip must be 15-60 seconds long. Respond strictly with JSON containing the "clips" array. If nothing in this section works as a standalone clip, return {"clips": []}.`
        : `Here is the video transcript:\n\n${w.body}\n\nRespond strictly with JSON containing the "clips" array. Extract up to ${perWindow} top viral short clips.`;
    try {
      const content = await callCuration(userContent);
      const found = extractClipsFromJsonString(content);
      for (const c of found) {
        if (typeof c.startTime !== "number" || typeof c.endTime !== "number") continue;
        if (blocks.length > 0 && (c.startTime < w.start - 2 || c.endTime > w.end + 2)) continue;
        allClips.push(c);
      }
      console.log(`[Stage: AI Curation] Window ${wi + 1}/${windows.length} [${Math.floor(w.start)}s-${Math.floor(w.end)}s] -> ${found.length} candidate(s), ${allClips.length} total`);
    } catch (err) {
      failedWindows++;
      lastError = err;
      console.warn(`[Stage: AI Curation] Window ${wi + 1}/${windows.length} failed:`, err);
    }
    // Pace Groq free-tier calls (8000 TPM): ~7s between windows
    if (isGroqOnly && wi < windows.length - 1) await sleep(7000);
  }

  // De-duplicate overlapping candidates, keep highest scores first, cap at 6
  allClips.sort((a, b) => (b.viralityScore || 0) - (a.viralityScore || 0));
  const clips: CuratedClipResult[] = [];
  for (const c of allClips) {
    const overlaps = clips.some(
      (k) => Math.max(k.startTime, c.startTime) < Math.min(k.endTime, c.endTime)
    );
    if (!overlaps) clips.push(c);
    if (clips.length >= 6) break;
  }

  // Normalize factor scores + guarantee a post-ready description per clip
  const clampScore = (v: unknown, fallback: number) =>
    Math.max(0, Math.min(100, Math.round(typeof v === "number" && isFinite(v) ? v : fallback)));
  for (const c of clips) {
    const overall = clampScore(c.viralityScore, 85);
    c.viralityScore = overall;
    c.hookStrength = clampScore(c.hookStrength, overall);
    c.engagementScore = clampScore(c.engagementScore, overall);
    c.trendMatch = clampScore(c.trendMatch, overall);
    if (!c.description || typeof c.description !== "string" || c.description.trim().length < 10) {
      const tags = (c.keyPhrases || [])
        .slice(0, 4)
        .map((p) => "#" + String(p).replace(/[^a-z0-9]+/gi, ""))
        .filter((t) => t.length > 1)
        .join(" ");
      const lead = (c.viralityReason || c.hookHeadline || c.title || "").split(/(?<=[.!?])\s/)[0];
      c.description = `${lead}${tags ? " " + tags : ""}`.trim();
    }
  }

  // No clips is an error, never a made-up clip. This used to return a fake
  // "Viral Highlight Moment" of seconds 0-20 with a 94 score whenever every
  // AI call failed (bad/expired key, retired model, rate limit), so users got
  // the video's first 20 seconds instead of an explanation.
  if (!clips || clips.length === 0) {
    if (failedWindows > 0 && failedWindows === windows.length) {
      const why = lastError instanceof Error ? lastError.message : String(lastError || "unknown error");
      throw new Error(`AI clip selection failed: ${why}. Check your API key in Settings and try again.`);
    }
    throw new Error(
      "The AI didn't find any standalone clip-worthy moments in this video. Try a custom prompt describing what to look for."
    );
  }

  return clips;
}
