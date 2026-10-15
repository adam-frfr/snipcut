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
Your task is to analyze long-form video transcripts and extract 3 to 6 standalone viral short clips.

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
      "startTime": 12.5,
      "endTime": 54.0,
      "durationFormatted": "0:41",
      "viralityScore": 98,
      "hookStrength": 99,
      "engagementScore": 96,
      "trendMatch": 98,
      "viralityReason": "Detailed explanation of why this segment will hook viewers on social feeds",
      "keyPhrases": ["exponential compute", "obsolete", "inflection point"],
      "suggestedEmojis": ["🤯", "⚡", "🚀"]
    }
  ]
}`;

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
          content: `Here is the video transcript:\n\n${transcriptText}\n\nRespond strictly with JSON containing the "clips" array.`,
        },
      ],
      max_tokens: 3000,
    });

    const content = response.choices[0]?.message?.content || "";
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Could not parse JSON clips from AI response: " + content.slice(0, 200));
    }
    const parsed = JSON.parse(jsonMatch[0]);
    return parsed.clips || [];
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
    return parsed.clips || [];
  }
}
