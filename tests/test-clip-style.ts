/**
 * Clip style options and the caption-layer effects: option validation,
 * style packs, counters, profanity masking, emoji mapping, and the ASS
 * events the extras produce (counters, lower third, end card, watermark,
 * drawings, second-language line, speaker colours, letter case).
 */
import { normalizeClipStyle, STYLE_PACKS, DEFAULT_CLIP_STYLE, styleNeedsFx } from "../src/lib/clipStyleOptions";
import { parseCounter, formatCounter, isProfane, maskProfanity, hexToAss, filmLookFilter, fitBackgroundChain, emojiImage } from "../src/lib/clipStyle";
import { emojiFor, EMOJI_CODES } from "../src/lib/emojiMap";
import { buildKaraokeAss } from "../src/lib/videoService";
import { knotsForward, knotsInverse } from "../src/lib/timeline";

let failures = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`${ok ? "-> PASS" : "-> FAIL"}: ${msg}`);
  if (!ok) failures++;
};

// ---- options -----------------------------------------------------------
const junk = normalizeClipStyle({ grade: "nope", pace: 9, musicVolume: -4, customMusic: "../../etc/passwd", lowerThirdName: "Al{\\b1}ex\nH", drawings: [{ t: 2, x: 500, y: -3, kind: "zap" }, { t: "x" }], brand: { primary: "red", name: "Me" } });
check(junk.grade === "none", "unknown grade falls back to none");
check(junk.pace === 1.5, "pace is clamped to 1.5x");
check(junk.musicVolume === 0, "music volume is clamped to 0-100");
check(junk.customMusic === "", "music id with a path is rejected");
check(!/[{}\\\n]/.test(junk.lowerThirdName), "lower-third text can't inject ASS tags or new lines");
check(junk.drawings.length === 1 && junk.drawings[0].x === 100 && junk.drawings[0].y === 0 && junk.drawings[0].kind === "circle", "drawings are clamped and bad ones dropped");
check(junk.brand?.primary === "#FACC15" && junk.brand?.name === "Me", "brand colours must be #RRGGBB");
check(normalizeClipStyle(undefined).zoomType === DEFAULT_CLIP_STYLE.zoomType, "missing style gives the defaults");
for (const p of STYLE_PACKS) {
  const n = normalizeClipStyle({ ...DEFAULT_CLIP_STYLE, ...p.style });
  const ok = Object.entries(p.style).every(([k, v]) => (n as any)[k] === v);
  check(ok, `style pack "${p.label}" survives validation`);
}
check(styleNeedsFx({ ...DEFAULT_CLIP_STYLE, sfx: false, voiceEnhance: false, pushIn: false, counters: true }), "a caption-only effect still runs the effects pass");

// ---- helpers ---------------------------------------------------------------
check(parseCounter("$599.")?.value === 599 && parseCounter("$599")?.prefix === "$", "$599 parses as a counter");
check(parseCounter("50%")?.suffix === "%" && parseCounter("10,000")?.value === 10000, "50% and 10,000 parse");
check(parseCounter("2025") === null && parseCounter("2") === null, "years and tiny numbers are not counted");
check(formatCounter({ prefix: "$", decimals: 0, suffix: "" }, 10000) === "$10,000", "counter formats with separators");
check(isProfane("Fucking,") && !isProfane("duck"), "profanity detection");
check(maskProfanity("shit!") === "s***!", "masked word keeps first letter and punctuation");
check(hexToAss("#FF3366") === "&H006633FF", "hex -> ASS colour (BGR)");
check(filmLookFilter("none") === "" && filmLookFilter("vhs").includes("rgbashift"), "film look filters");
check(fitBackgroundChain("brand", "#123456").includes("0x123456"), "brand fit background uses the brand colour");
check(emojiFor("money") === "1f4b0" && emojiFor("the") === null, "emoji mapping");
check(EMOJI_CODES.every((c) => emojiImage(c) !== null), `all ${EMOJI_CODES.length} emoji images are bundled`);

// ---- caption layer ---------------------------------------------------------
const words = [
  { start: 0.2, end: 0.6, text: "hello" },
  { start: 0.6, end: 1.0, text: "there" },
  { start: 4.0, end: 4.5, text: "only" },
  { start: 4.5, end: 5.2, text: "$599." },
  { start: 6.0, end: 6.4, text: "right" },
  { start: 6.4, end: 7.0, text: "now" },
];
const ass = buildKaraokeAss(words, "bounce", 400, { x: 1080, y: 1920 }, {
  counters: true,
  textCase: "title",
  lowerThird: { name: "Alex", title: "Founder" },
  endCard: { text: "FOLLOW FOR MORE", sub: "@me", start: 5, end: 7 },
  watermark: { text: "Snipcut", pos: "top-left", opacity: 50 },
  drawings: [{ t: 1, x: 50, y: 50, kind: "circle" }, { t: 2, x: 30, y: 30, kind: "arrow" }],
  translations: [{ start: 0.2, end: 1, text: "hola" }],
  speakerSpans: [{ start: 5.9, end: 8, speaker: 1 }],
  brand: { accent: "&H006633FF", kw: "&H00FFDD33" },
  hookAnim: "typewriter",
  hook: { text: "Big news today" },
});
const lines = ass.split("\n");
check(lines.filter((l) => l.includes(",Counter,")).length === 12, "a number counts up in 12 steps");
check(lines.some((l) => l.includes(",Counter,") && l.endsWith("$599")), "the counter ends on the spoken value");
check(lines.some((l) => l.includes(",LTName,") && l.includes("ALEX")) && lines.some((l) => l.includes(",LTTitle,")), "lower third: name and title");
check(lines.some((l) => l.includes(",End,") && l.includes("FOLLOW FOR MORE") && l.includes("@me")), "end card text + handle");
check(lines.some((l) => l.includes(",Mark,") && l.includes("\\an7") && l.includes("\\alpha&H80&")), "watermark corner + opacity");
check(lines.filter((l) => l.includes(",Draw,") && l.includes("\\p1")).length === 2, "circle and arrow drawings");
check(lines.some((l) => l.includes(",Sub,") && l.endsWith("hola")), "second-language line");
check(lines.some((l) => l.includes("Hello") && !l.includes("HELLO")), "title case captions");
check(lines.some((l) => l.includes("&H006633FF")), "brand accent on the spoken word");
check(lines.some((l) => /Dialogue: 0,0:00:06\.0/.test(l) && l.includes("&H00FFC83C")), "speaker 2's spoken word gets the second colour");
check(lines.filter((l) => l.includes(",Hook,")).length > 3, "typewriter hook reveals in steps");

// ---- opt-out + clock changes ---------------------------------------------
check(normalizeClipStyle({ zoomType: "none" }).zoomType === "none", "zooms can be switched off");
{
  // 2s teaser, 1.1x pace, 0.9s freeze at cut time 10, cut clip 20s long.
  const pace = 1.1;
  const f10 = 2 + 10 / pace;
  const knots: [number, number][] = [[0, 0], [0, 2], [10, f10], [10, f10 + 0.9], [20, 2 + 20 / pace + 0.9]];
  const near = (a: number, b: number) => Math.abs(a - b) < 0.01;
  check(near(knotsForward(knots, 5), 2 + 5 / pace), "time map: speed-up after the teaser");
  check(near(knotsForward(knots, 15), 2 + 15 / pace + 0.9), "time map: after the freeze");
  check(near(knotsInverse(knots, 1), 0), "time map: teaser maps to the clip start");
  check(near(knotsInverse(knots, f10 + 0.4), 10), "time map: inside the freeze = the frozen moment");
  check(near(knotsInverse(knots, knotsForward(knots, 13.7)), 13.7), "time map: inverse undoes forward");
  check(knotsForward([], 7) === 7 && knotsInverse(undefined, 7) === 7, "time map: no knots = unchanged clock");
}

if (failures) {
  console.log(`\n${failures} check(s) FAILED`);
  process.exit(1);
}
console.log("\nALL CLIP STYLE CHECKS PASSED");
