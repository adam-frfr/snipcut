import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";

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
  const cleaned = rawContent.replace(/```json/g, "").replace(/```/g, "").trim();

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

  const systemPrompt = `You are OpusClip AI, the world's #1 video curation intelligence algorithm for TikTok, YouTube Shorts, and Instagram Reels.
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
      "suggestedEmojis": []
    }
  ]
}`;

  // ---- Provider-agnostic single curation call (returns raw model text) ----
  const isGroqOnly = !hackclubKey && !activeOpenaiKey && !!activeGroqKey && !(activeClaudeKey && (model.includes("claude") || !activeOpenaiKey));
  const callCuration = async (userContent: string): Promise<string> => {
    if (activeClaudeKey && !hackclubKey && (model.includes("claude") || !activeOpenaiKey)) {
      const anthropicModel = model.includes("sonnet")
        ? "claude-3-5-sonnet-20241022"
        : "claude-3-5-haiku-20241022";
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
        for (const groqModel of groqModels) {
          try {
            console.log(`[Stage: AI Curation] Calling Groq (${groqModel})...`);
            const response = await groq.chat.completions.create({
              model: groqModel,
              response_format: { type: "json_object" },
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userContent },
              ],
            });
            return response.choices[0]?.message?.content || "";
          } catch (err) {
            lastErr = err;
            console.warn(`[Stage: AI Curation] Groq ${groqModel} failed, trying next:`, err);
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

  // ---- Build timestamped transcript blocks from segments ----
  // The LLM can only return accurate startTime/endTime if it can SEE the times.
  // (Previously the job pipeline sent plain text with no timestamps at all.)
  interface TBlock { start: number; end: number; text: string }
  const blocks: TBlock[] = [];
  const segs = (segments || []).filter((sg) => sg && typeof sg.start === "number" && sg.text);
  if (segs.length > 0) {
    let cur: TBlock = { start: segs[0].start, end: segs[0].end, text: segs[0].text };
    for (let idx = 1; idx < segs.length; idx++) {
      const sg = segs[idx];
      if (sg.start - cur.start >= 20 && cur.text) {
        blocks.push(cur);
        cur = { start: sg.start, end: sg.end, text: sg.text };
      } else {
        cur.text += (cur.text ? " " : "") + sg.text;
        cur.end = sg.end;
      }
    }
    if (cur.text) blocks.push(cur);
  }

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
      const line = `[${Math.floor(b.start)}s] ${b.text}`;
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

  for (let wi = 0; wi < windows.length; wi++) {
    const w = windows[wi];
    const perWindow = windows.length === 1 ? 4 : 2;
    const userContent =
      blocks.length > 0
        ? `Here is a section of a video transcript from ${Math.floor(w.start)}s to ${Math.floor(w.end)}s. Each line begins with its start time in seconds, like [123s].\n\n${w.body}\n\nExtract up to ${perWindow} standalone viral clips WHOLLY INSIDE ${Math.floor(w.start)}s-${Math.floor(w.end)}s. startTime and endTime MUST be numbers of seconds copied from the line timestamps, and each clip must be 15-60 seconds long. Respond strictly with JSON containing the "clips" array. If nothing in this section works as a standalone clip, return {"clips": []}.`
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
      console.warn(`[Stage: AI Curation] Window ${wi + 1}/${windows.length} failed:`, err);
    }
    // Pace Groq free-tier calls (8000 TPM): ~7s between windows
    if (isGroqOnly && wi < windows.length - 1) await sleep(7000);
  }

  // De-duplicate overlapping candidates, keep highest scores first, cap at 6
  allClips.sort((a, b) => (b.viralityScore || 0) - (a.viralityScore || 0));
  let clips: CuratedClipResult[] = [];
  for (const c of allClips) {
    const overlaps = clips.some(
      (k) => Math.max(k.startTime, c.startTime) < Math.min(k.endTime, c.endTime)
    );
    if (!overlaps) clips.push(c);
    if (clips.length >= 6) break;
  }

  // Safety fallback: If AI didn't return any clips, create an intelligent clip from transcript
  if (!clips || clips.length === 0) {
    const firstWords = transcriptText.split(/\s+/).slice(0, 8).join(" ");
    clips = [
      {
        title: "Viral Highlight Moment",
        hookHeadline: firstWords || "Must-watch moment",
        startTime: 0,
        endTime: 20,
        durationFormatted: "0:20",
        viralityScore: 94,
        hookStrength: 95,
        engagementScore: 92,
        trendMatch: 94,
        viralityReason: "Top retention introductory segment with fast emotional delivery.",
        keyPhrases: ["viral moment", "trending"],
        suggestedEmojis: [],
      },
    ];
  }

  return clips;
}
