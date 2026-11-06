/**
 * Clip style options and the caption-layer effects: option validation,
 * style packs, counters, profanity masking, emoji mapping, and the ASS
 * events the extras produce (counters, lower third, end card, watermark,
 * drawings, second-language line, speaker colours, letter case).
 */
import { normalizeClipStyle, STYLE_PACKS, DEFAULT_CLIP_STYLE, styleNeedsFx } from "../src/lib/clipStyleOptions";
import { parseCounter, formatCounter, isProfane, maskProfanity, hexToAss, filmLookFilter, fitBackgroundChain, emojiImage } from "../src/lib/clipStyle";
import { emojiFor, EMOJI_CODES } from "../src/lib/emojiMap";
import { buildKaraokeAss, buildBehindTitleAss } from "../src/lib/videoService";
import { pickSlamSentence, pickReactions, detectListicle, transitionFilter, footagePath } from "../src/lib/clipStyle";
import { knotsForward, knotsInverse } from "../src/lib/timeline";
import { isAudioOnlySource, safeUploadName, AUDIO_ONLY_SUFFIX } from "../src/lib/mediaPrep";
import { resolveSafeFilePath } from "../src/lib/videoService";

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

// ---- batch 6 ---------------------------------------------------------------
{
  const n = normalizeClipStyle({ background: "space", faceBlur: "maybe", splitFootage: "../x.mp4", textSlam: "yes", highlightReel: true });
  check(n.background === "none" && n.faceBlur === "off", "unknown background / face-blur values fall back to off");
  check(n.splitFootage === "" && n.textSlam === false && n.highlightReel === true, "footage id must be a plain upload id; booleans must be booleans");
  check(footagePath("../../etc/passwd") === null, "footage path can't escape the upload folder");
  check(!styleNeedsFx({ ...DEFAULT_CLIP_STYLE, sfx: false, voiceEnhance: false, pushIn: false, highlightReel: true }), "the reel switch alone doesn't force an effects pass per clip");
  check(styleNeedsFx({ ...DEFAULT_CLIP_STYLE, sfx: false, voiceEnhance: false, pushIn: false, background: "blur" }), "a background swap runs the effects pass");
  for (const t of ["lightleak", "burn", "rewind", "whip"] as const) {
    const f = transitionFilter(t, [4.2]);
    check(f.includes("enable=") && f.includes("4.") && !f.includes("rgbashift=rh=-16"), `${t} transition has its own timed filter`);
  }
  check(transitionFilter("whip", []) === "", "no cuts = no transition filter");

  const mk = (text: string, t0: number, step = 0.4) =>
    text.split(" ").map((w, i) => ({ text: w, start: t0 + i * step, end: t0 + i * step + step * 0.9 }));
  const talk = [
    ...mk("so here is the thing about this phone.", 0.2),
    ...mk("it costs $599 and that is insane!", 6),
    ...mk("but most people never notice the trick.", 11),
    ...mk("anyway let me show you more stuff here now.", 16),
  ];
  const kw = new Set(["costs", "insane", "trick"]);
  const sl = pickSlamSentence(talk, (w) => kw.has(w.toLowerCase().replace(/[^a-z0-9]/g, "")), 3.2, 24);
  check(!!sl && sl.words[0].text === "it" && /insane/.test(sl.words[sl.words.length - 1].text), "text slam picks the punchy sentence with the number");
  check(pickSlamSentence(talk, () => false, 30, 24) === null, "no slam when nothing fits after the hook");

  const reacts = pickReactions(talk, 3.2, 24, []);
  check(reacts.length === 1 && reacts[0].text === "NO WAY!", "reaction sticker on 'insane'");
  check(pickReactions(talk, 3.2, 24, [{ start: 5.5, end: 9.5 }]).length === 0, "reactions keep away from the slam");

  const list = detectListicle(
    [
      ...mk("here are 3 tips that changed my life.", 0.5),
      ...mk("first, wake up early every day.", 4),
      ...mk("second, drink water before coffee.", 8),
      ...mk("and finally, go for a walk.", 12),
    ],
    16
  );
  check(!!list && list.label === "TIP" && list.total === 3 && list.items.length === 3, "list: 3 tips detected with 3 items");
  check(!!list && list.items[0].start === 4 && list.items[2].n === 3 && list.items[1].end === list.items[2].start, "list items start at first / second / finally");
  check(detectListicle(mk("i went to the store and bought 3 apples today.", 0), 10) === null, "no list without list words");

  const ass = buildKaraokeAss(talk, "snipcut", 400, { x: 1080, y: 1920 }, {
    slam: sl!,
    stickers: { subscribeAt: 12, reactions: [{ t: 7, text: "NO WAY!" }] },
    listicle: { label: "TIP", total: 3, items: [{ n: 1, start: 4, end: 8 }, { n: 2, start: 8, end: 12 }] },
  });
  const L = ass.split("\n");
  check(L.filter((l) => l.includes(",Slam,")).length === sl!.words.length, "every slam word gets its own full-screen event");
  check(!L.some((l) => l.includes(",Snipcut,") && /0:00:0[67]\./.test(l)), "normal captions pause during the slam");
  check(L.some((l) => l.includes(",Sub2,") && l.endsWith("SUBSCRIBE")) && L.some((l) => l.includes(",SubDone,") && l.endsWith("SUBSCRIBED")), "subscribe button pops, then shows SUBSCRIBED");
  check(L.some((l) => l.includes(",React,") && l.endsWith("NO WAY!")), "reaction sticker event");
  check(L.some((l) => l.includes(",List,") && l.endsWith("TIP 1/3")) && L.some((l) => l.endsWith("TIP 2/3")), "list labels TIP 1/3, TIP 2/3");

  const behindHigh = buildBehindTitleAss("This phone is not cheap anymore", 3, 1080, 1920, "anton", undefined, 0.12);
  const behindLow = buildBehindTitleAss("This phone is not cheap anymore", 3, 1080, 1920, "anton", undefined, 0.35);
  const yOf = (a: string) => Number(/\\pos\(\d+,(\d+)\)/.exec(a)?.[1]);
  check(yOf(behindHigh) < yOf(behindLow), "title behind sits higher when the head is higher");
  check(yOf(behindHigh) > 0 && yOf(behindLow) <= 1920 * 0.45, "title behind stays on screen");
  {
    // Seen live: a long AI headline + zooms cut the top line off the frame.
    const longT = buildBehindTitleAss("Brand new 2025 iPhone 16e? Not a budget phone, it costs $900 and here is why everyone is wrong", 3, 1080, 1920, "default", undefined, 0.04);
    const fs = Number(/Behind,[^,]+,(\d+)/.exec(longT)?.[1]);
    const ev = longT.split("\n").find((l) => l.startsWith("Dialogue"))!;
    const n = ev.slice(ev.indexOf("}") + 1).split("\\N").length;
    const top = yOf(longT) - (n * fs * 1.15) / 2;
    check(n <= 3 && /…/.test(ev), "a long title is cut to 3 lines with an ellipsis");
    check(top >= 1920 * 0.119, `title stays clear of the zoom crop at the top (${((top / 1920) * 100).toFixed(1)}%)`);
    check(fs >= 100, `a long title stays big (${fs}px)`);
  }
}

// Bug hunt fixes.
{
  // A real video named "...-audio" must not turn into an audiogram.
  const vid = `${safeUploadName("interview-audio.mp4").baseName}.mp4`;
  check(!isAudioOnlySource(vid), `a video named "interview-audio.mp4" stays a video (${vid})`);
  const tricky = `${safeUploadName("my.audio.mp4").baseName}.mp4`;
  check(!isAudioOnlySource(tricky), "a file named my.audio.mp4 can't fake the audio-only marker");
  check(isAudioOnlySource(`uploads/123-podcast${AUDIO_ONLY_SUFFIX}`), "the audio-only placeholder is recognised");
  // Source paths outside the media folders (or URLs) are refused.
  for (const bad of ["/etc/passwd", "http://169.254.169.254/latest", "../../etc/hosts"]) {
    let threw = false;
    try { resolveSafeFilePath(bad); } catch { threw = true; }
    check(threw, `render source "${bad}" is refused`);
  }
}

if (failures) {
  console.log(`\n${failures} check(s) FAILED`);
  process.exit(1);
}
console.log("\nALL CLIP STYLE CHECKS PASSED");
