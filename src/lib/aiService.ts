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

export function getOpenAIClient(apiKey?: string): OpenAI {
  const key = apiKey || process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error("OpenAI API key is missing. Please provide it in Settings or .env.local");
  }
  return new OpenAI({ apiKey: key });
}

export function getAnthropicClient(apiKey?: string): Anthropic {
  const key = apiKey || process.env.ANTHROPIC_API_KEY;
  if (!key) {
    throw new Error("Anthropic Claude API key is missing. Please provide it in Settings or .env.local");
  }
  return new Anthropic({ apiKey: key });
}

/**
 * Prompt Claude or GPT-4o-mini to analyze the full transcript and extract viral golden nuggets
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
  model?: "claude-3-5-haiku" | "gpt-4o-mini" | "claude-3-5-sonnet";
  openaiKey?: string;
  claudeKey?: string;
}): Promise<CuratedClipResult[]> {
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

  if (model.startsWith("claude") && (claudeKey || process.env.ANTHROPIC_API_KEY)) {
    const anthropic = getAnthropicClient(claudeKey);
    const selectedModel = model === "claude-3-5-sonnet" ? "claude-3-5-sonnet-20241022" : "claude-3-5-haiku-20241022";
    
    const response = await anthropic.messages.create({
      model: selectedModel,
      max_tokens: 3000,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `Here is the full video transcript:\n\n${transcriptText}\n\nExtract the highest potential viral shorts with timestamps.`,
        },
      ],
    });

    const contentText = response.content
      .filter((c) => c.type === "text")
      .map((c) => (c as any).text)
      .join("\n");

    const jsonMatch = contentText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Failed to parse JSON clips from Claude response");
    }
    const parsed = JSON.parse(jsonMatch[0]);
    return parsed.clips || [];
  } else {
    // Default to OpenAI GPT-4o-mini
    const openai = getOpenAIClient(openaiKey);
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Here is the full video transcript:\n\n${transcriptText}\n\nExtract the highest potential viral shorts with timestamps.`,
        },
      ],
    });

    const parsed = JSON.parse(response.choices[0].message.content || "{}");
    return parsed.clips || [];
  }
}
