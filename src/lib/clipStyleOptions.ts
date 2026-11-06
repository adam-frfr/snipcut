/**
 * Clip style options shared by the server and the browser (no Node
 * imports): the choices offered in the dashboard / editor and their
 * defaults. The effects themselves live in clipStyle.ts.
 */

export const MUSIC_MOODS = ["auto", "hype", "chill", "lofi", "dramatic", "inspiring", "funny"] as const;
export type MusicMood = (typeof MUSIC_MOODS)[number];
export const COLOR_GRADES = ["none", "cinematic", "warm", "punchy", "moody", "bw"] as const;
export type ColorGrade = (typeof COLOR_GRADES)[number];
export const TRANSITIONS = ["none", "flash", "glitch", "zoom", "lightleak", "burn", "rewind", "whip"] as const;
export type CutTransition = (typeof TRANSITIONS)[number];
export const ZOOM_TYPES = ["punch", "smooth", "shake", "whip", "none"] as const;
export type ZoomType = (typeof ZOOM_TYPES)[number];
export const FILM_LOOKS = ["none", "grain", "vignette", "letterbox", "vhs", "silent"] as const;
export type FilmLook = (typeof FILM_LOOKS)[number];
export const HOOK_ANIMS = ["pop", "slide", "drop", "typewriter", "shake"] as const;
export type HookAnim = (typeof HOOK_ANIMS)[number];
export const FIT_BACKGROUNDS = ["blur", "dark", "brand"] as const;
export type FitBackground = (typeof FIT_BACKGROUNDS)[number];
export const CAPTION_CASES = ["upper", "title", "lower"] as const;
export type CaptionCase = (typeof CAPTION_CASES)[number];
export const CAPTION_SIZES = ["s", "m", "l", "xl"] as const;
export type CaptionSize = (typeof CAPTION_SIZES)[number];
export const CAPTION_SIZE_SCALE: Record<CaptionSize, number> = { s: 0.8, m: 1, l: 1.18, xl: 1.36 };
export const PACES = [1, 1.1, 1.2, 1.3] as const;
export const FACE_BUBBLES = ["off", "top-left", "top-right", "bottom-left", "bottom-right"] as const;
export type FaceBubble = (typeof FACE_BUBBLES)[number];
export const BILINGUAL_LANGS = ["off", "es", "fr", "de", "pt", "it", "hi", "ar", "tr", "ru", "ja", "ko", "zh", "id"] as const;
export type BilingualLang = (typeof BILINGUAL_LANGS)[number];
export const WATERMARK_POSITIONS = ["top-right", "top-left", "bottom-right", "bottom-left"] as const;
/** Behind the speaker on talking-head shots (person cut out with AI). */
export const BACKGROUNDS = ["none", "blur", "studio", "gradient", "brand"] as const;
export type SubjectBackground = (typeof BACKGROUNDS)[number];
export const FACE_BLURS = ["off", "others", "all"] as const;
export type FaceBlurMode = (typeof FACE_BLURS)[number];

export interface BrandStyle {
  name: string;
  /** #RRGGBB: spoken-word accent, progress bar, lower-third bar. */
  primary: string;
  /** #RRGGBB: keyword highlight colour. */
  secondary: string;
  watermark: boolean;
  watermarkPos: (typeof WATERMARK_POSITIONS)[number];
  watermarkOpacity: number; // 0-100
}

/** Telestrator mark drawn by the user in the editor (x/y in % of the frame). */
export interface Drawing {
  t: number;
  x: number;
  y: number;
  kind: "circle" | "arrow";
}

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
  // ---- batch 2 ----
  zoomType: ZoomType;
  filmLook: FilmLook;
  hookAnim: HookAnim;
  fitBackground: FitBackground;
  /** Animated "follow" card over the last seconds. */
  endCard: boolean;
  endCardText: string;
  /** Thin bar filling across the top as the clip plays. */
  progressBar: boolean;
  /** Freeze-frame + record scratch on the clip's big moment. */
  freezeFrame: boolean;
  /** Playback speed (1 = original). Pitch is kept. */
  pace: number;
  // ---- batch 3 ----
  emoji: boolean;
  speakerColors: boolean;
  bilingual: BilingualLang;
  bleep: boolean;
  captionCase: CaptionCase;
  captionSize: CaptionSize;
  /** AI narrator reads the hook over a frozen first frame. */
  voiceoverIntro: boolean;
  // ---- batch 4 ----
  /** Detects the loudest / most energetic moment and hits it with zoom + boom + flash. */
  hypeMoments: boolean;
  /** The big moment plays first as a 2s teaser ("wait for it"). */
  coldOpen: boolean;
  lowerThirdName: string;
  lowerThirdTitle: string;
  /** Numbers count up on screen when they're said. */
  counters: boolean;
  /** Screen recordings: the webcam corner becomes a round face bubble. */
  faceBubble: FaceBubble;
  /** Editor-drawn circles / arrows. */
  drawings: Drawing[];
  // ---- batch 5 ----
  brand: BrandStyle | null;
  musicVolume: number; // 0-100
  musicFadeIn: number; // seconds
  musicFadeOut: number; // seconds
  musicStart: number; // seconds into the track
  /** Uploaded track id (data/music/user/<id>); "" = generated mood music. */
  customMusic: string;
  // ---- batch 6 ----
  /** Replace / blur what's behind the speaker (talking-head shots). */
  background: SubjectBackground;
  /** Soft white outline around the speaker. */
  subjectGlow: boolean;
  /** The hook title sits big BEHIND the speaker's head. */
  textBehind: boolean;
  /** The strongest sentence slams in full-screen, word by word. */
  textSlam: boolean;
  /** Animated subscribe button + reaction stickers. */
  stickers: boolean;
  /** "Tip 2/5" labels when the speaker goes through a numbered list. */
  listicle: boolean;
  /** Blur faces: other people (keep the speaker) or everyone. */
  faceBlur: FaceBlurMode;
  /** Uploaded footage id (data/footage/user/<id>) shown under the clip; "" = off. */
  splitFootage: string;
  /** Podcast look: animated waveform + cover instead of the camera picture. */
  audiogram: boolean;
  /** Also stitch the job's best moments into one highlight reel (job renders only). */
  highlightReel: boolean;
}

export const DEFAULT_CLIP_STYLE: ClipStyle = {
  musicMood: "auto",
  grade: "none",
  transition: "none",
  sfx: true,
  voiceEnhance: true,
  pushIn: true,
  zoomType: "punch",
  filmLook: "none",
  hookAnim: "pop",
  fitBackground: "blur",
  endCard: false,
  endCardText: "",
  progressBar: false,
  freezeFrame: false,
  pace: 1,
  emoji: false,
  speakerColors: true,
  bilingual: "off",
  bleep: false,
  captionCase: "upper",
  captionSize: "m",
  voiceoverIntro: false,
  hypeMoments: false,
  coldOpen: false,
  lowerThirdName: "",
  lowerThirdTitle: "",
  counters: false,
  faceBubble: "off",
  drawings: [],
  brand: null,
  musicVolume: 55,
  musicFadeIn: 0.8,
  musicFadeOut: 1.2,
  musicStart: 0,
  customMusic: "",
  background: "none",
  subjectGlow: false,
  textBehind: false,
  textSlam: false,
  stickers: false,
  listicle: false,
  faceBlur: "off",
  splitFootage: "",
  audiogram: false,
  highlightReel: false,
};

const HEX = /^#[0-9a-fA-F]{6}$/;
const clampNum = (v: unknown, lo: number, hi: number, d: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;
const cleanText = (v: unknown, max: number) =>
  typeof v === "string" ? v.replace(/[\r\n{}\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";

function normalizeBrand(raw: unknown): BrandStyle | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const pos = WATERMARK_POSITIONS.includes(r.watermarkPos as any) ? (r.watermarkPos as BrandStyle["watermarkPos"]) : "top-right";
  return {
    name: cleanText(r.name, 40),
    primary: typeof r.primary === "string" && HEX.test(r.primary) ? r.primary : "#FACC15",
    secondary: typeof r.secondary === "string" && HEX.test(r.secondary) ? r.secondary : "#22C55E",
    watermark: r.watermark !== false,
    watermarkPos: pos,
    watermarkOpacity: clampNum(r.watermarkOpacity, 10, 100, 80),
  };
}

/** Accepts anything (request bodies, stored options) and returns a valid style. */
export function normalizeClipStyle(raw: unknown): ClipStyle {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_CLIP_STYLE;
  const pick = <T extends readonly string[]>(list: T, v: unknown, def: T[number]): T[number] =>
    typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T[number]) : def;
  const bool = (v: unknown, def: boolean) => (typeof v === "boolean" ? v : def);
  const drawings = Array.isArray(r.drawings)
    ? (r.drawings as any[])
        .slice(0, 30)
        .map((x) => ({
          t: clampNum(x?.t, 0, 600, -1),
          x: clampNum(x?.x, 0, 100, 50),
          y: clampNum(x?.y, 0, 100, 50),
          kind: x?.kind === "arrow" ? ("arrow" as const) : ("circle" as const),
        }))
        .filter((x) => x.t >= 0)
    : [];
  const pace = clampNum(r.pace, 1, 1.5, 1);
  return {
    musicMood: pick(MUSIC_MOODS, r.musicMood, d.musicMood),
    grade: pick(COLOR_GRADES, r.grade, d.grade),
    transition: pick(TRANSITIONS, r.transition, d.transition),
    sfx: bool(r.sfx, d.sfx),
    voiceEnhance: bool(r.voiceEnhance, d.voiceEnhance),
    pushIn: bool(r.pushIn, d.pushIn),
    zoomType: pick(ZOOM_TYPES, r.zoomType, d.zoomType),
    filmLook: pick(FILM_LOOKS, r.filmLook, d.filmLook),
    hookAnim: pick(HOOK_ANIMS, r.hookAnim, d.hookAnim),
    fitBackground: pick(FIT_BACKGROUNDS, r.fitBackground, d.fitBackground),
    endCard: bool(r.endCard, d.endCard),
    endCardText: cleanText(r.endCardText, 40),
    progressBar: bool(r.progressBar, d.progressBar),
    freezeFrame: bool(r.freezeFrame, d.freezeFrame),
    pace: Math.round(pace * 100) / 100,
    emoji: bool(r.emoji, d.emoji),
    speakerColors: bool(r.speakerColors, d.speakerColors),
    bilingual: pick(BILINGUAL_LANGS, r.bilingual, d.bilingual),
    bleep: bool(r.bleep, d.bleep),
    captionCase: pick(CAPTION_CASES, r.captionCase, d.captionCase),
    captionSize: pick(CAPTION_SIZES, r.captionSize, d.captionSize),
    voiceoverIntro: bool(r.voiceoverIntro, d.voiceoverIntro),
    hypeMoments: bool(r.hypeMoments, d.hypeMoments),
    coldOpen: bool(r.coldOpen, d.coldOpen),
    lowerThirdName: cleanText(r.lowerThirdName, 40),
    lowerThirdTitle: cleanText(r.lowerThirdTitle, 50),
    counters: bool(r.counters, d.counters),
    faceBubble: pick(FACE_BUBBLES, r.faceBubble, d.faceBubble),
    drawings,
    brand: normalizeBrand(r.brand),
    musicVolume: Math.round(clampNum(r.musicVolume, 0, 100, d.musicVolume)),
    musicFadeIn: clampNum(r.musicFadeIn, 0, 5, d.musicFadeIn),
    musicFadeOut: clampNum(r.musicFadeOut, 0, 5, d.musicFadeOut),
    musicStart: clampNum(r.musicStart, 0, 600, d.musicStart),
    customMusic: typeof r.customMusic === "string" && /^[a-z0-9-]{1,60}\.(mp3|wav|m4a|aac|ogg)$/.test(r.customMusic) ? r.customMusic : "",
    background: pick(BACKGROUNDS, r.background, d.background),
    subjectGlow: bool(r.subjectGlow, d.subjectGlow),
    textBehind: bool(r.textBehind, d.textBehind),
    textSlam: bool(r.textSlam, d.textSlam),
    stickers: bool(r.stickers, d.stickers),
    listicle: bool(r.listicle, d.listicle),
    faceBlur: pick(FACE_BLURS, r.faceBlur, d.faceBlur),
    splitFootage: typeof r.splitFootage === "string" && /^[a-z0-9-]{1,60}\.(mp4|mov|webm|mkv)$/.test(r.splitFootage) ? r.splitFootage : "",
    audiogram: bool(r.audiogram, d.audiogram),
    highlightReel: bool(r.highlightReel, d.highlightReel),
  };
}

/** True when the style needs the effects pass even without B-roll / music. */
export const styleNeedsFx = (s: ClipStyle) =>
  s.grade !== "none" ||
  s.transition !== "none" ||
  s.sfx ||
  s.voiceEnhance ||
  s.pushIn ||
  s.filmLook !== "none" ||
  s.endCard ||
  s.progressBar ||
  s.freezeFrame ||
  s.pace !== 1 ||
  s.emoji ||
  s.bilingual !== "off" ||
  s.bleep ||
  s.captionCase !== "upper" ||
  s.captionSize !== "m" ||
  s.voiceoverIntro ||
  s.hypeMoments ||
  s.coldOpen ||
  Boolean(s.lowerThirdName) ||
  s.counters ||
  s.faceBubble !== "off" ||
  s.drawings.length > 0 ||
  s.hookAnim !== "pop" ||
  Boolean(s.brand) ||
  s.background !== "none" ||
  s.subjectGlow ||
  s.textBehind ||
  s.textSlam ||
  s.stickers ||
  s.listicle ||
  s.faceBlur !== "off" ||
  Boolean(s.splitFootage) ||
  s.audiogram;

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
export const TRANSITION_LABELS: Record<string, string> = {
  none: "Hard cut", flash: "Flash", glitch: "Glitch", zoom: "Zoom punch",
  lightleak: "Light leak", burn: "Film burn", rewind: "VHS rewind", whip: "Whip pan",
};
export const BACKGROUND_LABELS: Record<string, string> = {
  none: "Original", blur: "Blur the room", studio: "Dark studio", gradient: "Gradient", brand: "Brand colour",
};
export const FACE_BLUR_LABELS: Record<string, string> = { off: "Off", others: "Other people", all: "Everyone" };
export const ZOOM_LABELS: Record<string, string> = { punch: "Punch", smooth: "Smooth", shake: "Shake", whip: "Whip", none: "No zooms" };
export const FILM_LOOK_LABELS: Record<string, string> = {
  none: "None", grain: "Film grain", vignette: "Vignette", letterbox: "Letterbox", vhs: "Retro VHS", silent: "Silent film",
};
export const HOOK_ANIM_LABELS: Record<string, string> = { pop: "Pop", slide: "Slide in", drop: "Drop", typewriter: "Typewriter", shake: "Shake" };
export const FIT_BG_LABELS: Record<string, string> = { blur: "Blur", dark: "Dark blur", brand: "Brand colour" };
export const CASE_LABELS: Record<string, string> = { upper: "UPPERCASE", title: "Title Case", lower: "lowercase" };
export const SIZE_LABELS: Record<string, string> = { s: "Small", m: "Medium", l: "Large", xl: "Huge" };
export const PACE_LABELS: Record<string, string> = { "1": "Normal", "1.1": "1.1× faster", "1.2": "1.2× faster", "1.3": "1.3× faster" };
export const FACE_BUBBLE_LABELS: Record<string, string> = {
  off: "Off", "top-left": "Webcam top-left", "top-right": "Webcam top-right", "bottom-left": "Webcam bottom-left", "bottom-right": "Webcam bottom-right",
};
export const LANG_LABELS: Record<string, string> = {
  off: "Off", es: "Spanish", fr: "French", de: "German", pt: "Portuguese", it: "Italian", hi: "Hindi", ar: "Arabic",
  tr: "Turkish", ru: "Russian", ja: "Japanese", ko: "Korean", zh: "Chinese", id: "Indonesian",
};

/** One-click looks: a caption style, a font and a bundle of effects. */
export const STYLE_PACKS: { id: string; label: string; captionStyle: string; font: string; style: Partial<ClipStyle> }[] = [
  {
    id: "podcast",
    label: "Podcast Pro",
    captionStyle: "snipcut",
    font: "montserrat",
    style: { musicMood: "chill", grade: "cinematic", transition: "none", zoomType: "smooth", filmLook: "vignette", speakerColors: true, progressBar: true, hookAnim: "slide", sfx: true, voiceEnhance: true, pushIn: true },
  },
  {
    id: "hype",
    label: "Hype",
    captionStyle: "bounce",
    font: "bangers",
    style: { musicMood: "hype", grade: "punchy", transition: "glitch", zoomType: "shake", filmLook: "none", emoji: true, hypeMoments: true, counters: true, hookAnim: "drop", sfx: true, voiceEnhance: true, pushIn: true },
  },
  {
    id: "news",
    label: "Breaking News",
    captionStyle: "boxed",
    font: "anton",
    style: { musicMood: "dramatic", grade: "moody", transition: "flash", zoomType: "punch", filmLook: "letterbox", progressBar: true, counters: true, hookAnim: "slide", sfx: true, voiceEnhance: true },
  },
  {
    id: "documentary",
    label: "Documentary",
    captionStyle: "clean",
    font: "poppins",
    style: { musicMood: "inspiring", grade: "warm", transition: "none", zoomType: "smooth", filmLook: "grain", sfx: false, voiceEnhance: true, pushIn: true, hookAnim: "typewriter" },
  },
  {
    id: "vhs",
    label: "Retro VHS",
    captionStyle: "typewriter",
    font: "bebas",
    style: { musicMood: "lofi", grade: "warm", transition: "glitch", zoomType: "whip", filmLook: "vhs", sfx: true, voiceEnhance: true, hookAnim: "shake" },
  },
  {
    id: "minimal",
    label: "Minimal",
    captionStyle: "clean",
    font: "default",
    style: { musicMood: "chill", grade: "none", transition: "none", zoomType: "smooth", filmLook: "none", sfx: false, emoji: false, pushIn: false, captionCase: "title", hookAnim: "pop" },
  },
];
