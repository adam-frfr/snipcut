/**
 * Auto-emoji: words that earn an emoji pop above the captions, and the
 * Noto Color Emoji image (assets/emoji/<code>.png, Apache 2.0) for each.
 */
export const EMOJI_RULES: { code: string; re: RegExp }[] = [
  { code: "1f525", re: /^(fire|hot|lit|insane|crazy|wild|viral)$/ },
  { code: "1f4b0", re: /^(money|cash|rich|dollars?|paid|salary|profit|revenue|millions?|billions?|\$\d.*)$/ },
  { code: "1f680", re: /^(launch|launched|rocket|scale|scaling|growth|grow|growing|faster)$/ },
  { code: "1f9e0", re: /^(brain|think|thinking|smart|genius|mind|psychology|learn|learning)$/ },
  { code: "2764", re: /^(love|loved|heart|lovely)$/ },
  { code: "1f602", re: /^(funny|laugh|laughing|lol|joke|jokes|hilarious|lmao)$/ },
  { code: "1f631", re: /^(shocking|shocked|scary|terrifying|omg|wow|whoa)$/ },
  { code: "1f4af", re: /^(perfect|exactly|absolutely|100%?|literally)$/ },
  { code: "23f0", re: /^(time|hours?|minutes?|deadline|late|early|morning)$/ },
  { code: "1f4f1", re: /^(phone|iphone|android|apps?|smartphone|samsung)$/ },
  { code: "1f4bb", re: /^(computer|laptop|code|coding|software|developer|programming)$/ },
  { code: "1f4c8", re: /^(stocks?|market|chart|invest|investing|investment|up)$/ },
  { code: "1f3c6", re: /^(win|won|winner|winning|champion|best|first)$/ },
  { code: "1f4aa", re: /^(strong|strength|gym|workout|muscle|discipline|hard)$/ },
  { code: "1f440", re: /^(look|watch|see|secret|secrets|hidden)$/ },
  { code: "1f480", re: /^(dead|died|death|dying|kill|killed|killing)$/ },
  { code: "26a0", re: /^(warning|careful|danger|dangerous|risk|risky|scam)$/ },
  { code: "1f4a1", re: /^(idea|ideas|tip|tips|trick|tricks|hack|hacks)$/ },
  { code: "1f44d", re: /^(good|great|nice|yes|agree|recommend)$/ },
  { code: "1f44e", re: /^(bad|worst|terrible|awful|hate)$/ },
  { code: "2705", re: /^(done|works|working|right|correct|true|success)$/ },
  { code: "274c", re: /^(wrong|mistake|mistakes|fail|failed|failure|never|stop)$/ },
  { code: "2b50", re: /^(star|stars|amazing|awesome|incredible|beautiful)$/ },
  { code: "1f389", re: /^(party|celebrate|congrats|birthday|finally)$/ },
  { code: "2615", re: /^(coffee|tea|caffeine)$/ },
  { code: "1f354", re: /^(food|eat|eating|burger|hungry|dinner|lunch)$/ },
  { code: "1f697", re: /^(car|cars|drive|driving|tesla)$/ },
  { code: "1f3e0", re: /^(home|house|apartment|rent)$/ },
  { code: "1f30d", re: /^(world|global|earth|planet|country|countries)$/ },
  { code: "1f916", re: /^(ai|robot|robots|chatgpt|gpt|claude|automation)$/ },
  { code: "1f4f8", re: /^(camera|photo|photos|picture|video|videos)$/ },
  { code: "1f3b5", re: /^(music|song|songs|beat|album)$/ },
  { code: "1f4da", re: /^(book|books|read|reading|study|studying|school)$/ },
  { code: "1f634", re: /^(sleep|sleeping|tired|exhausted|nap)$/ },
  { code: "1f914", re: /^(why|wonder|question|confused|weird)$/ },
  { code: "1f92f", re: /^(mindblowing|unbelievable|insanely|blown)$/ },
  { code: "1f91d", re: /^(deal|partner|partnership|together|team)$/ },
  { code: "1f381", re: /^(gift|free|bonus|giveaway)$/ },
  { code: "1f50b", re: /^(battery|charge|charging|energy)$/ },
  { code: "1f3af", re: /^(goal|goals|target|focus|aim)$/ },
  { code: "1f451", re: /^(king|queen|boss|ceo)$/ },
];

export const EMOJI_CODES = Array.from(new Set(EMOJI_RULES.map((r) => r.code)));

export function emojiFor(word: string): string | null {
  const w = word.toLowerCase().replace(/[^a-z0-9$%]/g, "");
  if (!w) return null;
  for (const r of EMOJI_RULES) if (r.re.test(w)) return r.code;
  return null;
}
