/**
 * Clip style options shared by the server and the browser (no Node
 * imports): the choices offered in the dashboard / editor and their
 * defaults. The effects themselves live in clipStyle.ts.
 */

export const MUSIC_MOODS = ["auto", "hype", "chill", "lofi", "dramatic", "inspiring", "funny"] as const;
export type MusicMood = (typeof MUSIC_MOODS)[number];
export const COLOR_GRADES = ["none", "cinematic", "warm", "punchy", "moody", "bw"] as const;
export type ColorGrade = (typeof COLOR_GRADES)[number];
export const TRANSITIONS = ["none", "flash", "glitch", "zoom"] as const;
export type CutTransition = (typeof TRANSITIONS)[number];

export interface ClipStyle {
  musicMood: MusicMood;
  grade: ColorGrade;
  transition: CutTransition;
  /** Generated whoosh / pop / ding / riser at the right moments. */
  sfx: boolean;
  /** Noise reduction, voice EQ/compression and social loudness (-14 LUFS). */
  voiceEnhance: boolean;
  /** Slow push-in on the speaker over the whole clip. */
  pushIn: boolean;
}

export const DEFAULT_CLIP_STYLE: ClipStyle = {
  musicMood: "auto",
  grade: "none",
  transition: "none",
  sfx: true,
  voiceEnhance: true,
  pushIn: true,
};

/** Accepts anything (request bodies, stored options) and returns a valid style. */
export function normalizeClipStyle(raw: unknown): ClipStyle {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const pick = <T extends readonly string[]>(list: T, v: unknown, d: T[number]): T[number] =>
    typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T[number]) : d;
  return {
    musicMood: pick(MUSIC_MOODS, r.musicMood, DEFAULT_CLIP_STYLE.musicMood),
    grade: pick(COLOR_GRADES, r.grade, DEFAULT_CLIP_STYLE.grade),
    transition: pick(TRANSITIONS, r.transition, DEFAULT_CLIP_STYLE.transition),
    sfx: typeof r.sfx === "boolean" ? r.sfx : DEFAULT_CLIP_STYLE.sfx,
    voiceEnhance: typeof r.voiceEnhance === "boolean" ? r.voiceEnhance : DEFAULT_CLIP_STYLE.voiceEnhance,
    pushIn: typeof r.pushIn === "boolean" ? r.pushIn : DEFAULT_CLIP_STYLE.pushIn,
  };
}

/** True when the style needs the effects pass even without B-roll / music. */
export const styleNeedsFx = (s: ClipStyle) =>
  s.grade !== "none" || s.transition !== "none" || s.sfx || s.voiceEnhance || s.pushIn;

/** Caption fonts offered in the UI (keys match CAPTION_FONTS in videoService). */
export const CAPTION_FONT_OPTIONS: { id: string; label: string }[] = [
  { id: "default", label: "Classic (Arial)" },
  { id: "montserrat", label: "Montserrat" },
  { id: "poppins", label: "Poppins" },
  { id: "anton", label: "Anton" },
  { id: "bebas", label: "Bebas Neue" },
  { id: "bangers", label: "Bangers (comic)" },
  { id: "luckiest", label: "Luckiest Guy" },
];

export const MOOD_LABELS: Record<string, string> = {
  auto: "AI picks", hype: "Hype", chill: "Chill", lofi: "Lo-fi", dramatic: "Dramatic", inspiring: "Inspiring", funny: "Funny",
};
export const GRADE_LABELS: Record<string, string> = {
  none: "Original", cinematic: "Cinematic", warm: "Warm", punchy: "Punchy", moody: "Moody", bw: "Black & white",
};
export const TRANSITION_LABELS: Record<string, string> = { none: "Hard cut", flash: "Flash", glitch: "Glitch", zoom: "Zoom punch" };
