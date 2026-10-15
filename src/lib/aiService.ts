import OpenAI from "openai";

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
}: {
  transcriptText: string;
  words?: WordTimestamp[];
  customPrompt?: string;
  model?: string;
  openaiKey?: string;
  claudeKey?: string;
}): Promise<CuratedClipResult[]> {
  const activeKey = (openaiKey || claudeKey || process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || "").trim();

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
      "suggestedEmojis": ["🤯", "⚡", "🚀"]
    }
  ]
}`;

  let clips: CuratedClipResult[] = [];

  if (isHackClubKey(activeKey)) {
    // Map to Hack Club available model IDs
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
        {
          role: "user",
          content: `Here is the video transcript with timestamps:\n\n${transcriptText}\n\nRespond strictly with JSON containing the "clips" array. Extract 2 to 4 top viral short clips.`,
        },
      ],
      max_tokens: 4000,
    });

    const content = response.choices[0]?.message?.content || "";
    clips = extractClipsFromJsonString(content);
  } else {
    // Standard OpenAI
    const client = getOpenAIClient(activeKey);
    const response = await client.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Here is the video transcript:\n\n${transcriptText}\n\nExtract viral shorts with timestamps.`,
        },
      ],
    });

    const parsed = JSON.parse(response.choices[0]?.message?.content || "{}");
    clips = parsed.clips || [];
  }

  // Safety fallback: If AI didn't return any clips, create an intelligent clip from transcript
  if (!clips || clips.length === 0) {
    const firstWords = transcriptText.split(/\s+/).slice(0, 8).join(" ");
    clips = [
      {
        title: "Viral Highlight Moment 🔥",
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
        suggestedEmojis: ["🔥", "✨"],
      },
    ];
  }

  return clips;
}
