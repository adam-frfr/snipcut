import fs from "fs";
import path from "path";

/**
 * AI B-roll: plan visual cutaways for a clip from its transcript, then fetch
 * matching stock media.
 *
 * Planning: transcript segments inside the clip window become "sentences".
 * An LLM (frontier key if the user supplied one, else Groq) turns each
 * sentence into a concrete stock-search query. Without any LLM the sentence
 * keywords are used as the query — worse, but the feature still works.
 *
 * Fetching: Pexels (user's free key, video + photo) when available, else
 * Openverse (no key, photos). Stills get a Ken Burns drift in the composite
 * pass, so photo cutaways still feel alive.
 */

export interface BrollSentence {
  start: number; // clip-relative
  end: number;
  text: string;
}

export interface BrollPlanItem extends BrollSentence {
  query: string;
  kind: "image" | "video";
}

export interface BrollAsset extends BrollPlanItem {
  assetPath: string;
}

const MAX_CUES = 8;
const MIN_CUE_SEC = 1.5;

export function buildSentences(
  segments: { start: number; end: number; text: string }[],
  clipStart: number,
  clipEnd: number
): BrollSentence[] {
  const rel = (segments || [])
    .filter((s) => s.end > clipStart && s.start < clipEnd)
    .map((s) => ({
      start: Math.max(0, s.start - clipStart),
      end: Math.min(clipEnd - clipStart, s.end - clipStart),
      text: String(s.text || "").trim(),
    }))
    .filter((s) => s.text.length > 0 && s.end - s.start > 0.2)
    .sort((a, b) => a.start - b.start);

  // Merge fragments until each cue is at least MIN_CUE_SEC long.
  const merged: BrollSentence[] = [];
  for (const s of rel) {
    const prev = merged[merged.length - 1];
    if (prev && prev.end - prev.start < MIN_CUE_SEC) {
      prev.end = s.end;
      prev.text = `${prev.text} ${s.text}`;
    } else {
      merged.push({ ...s });
    }
  }
  // Cap the cue count by repeatedly merging the shortest cue into its neighbour.
  while (merged.length > MAX_CUES) {
    let shortest = 0;
    for (let i = 1; i < merged.length; i++) {
      if (merged[i].end - merged[i].start < merged[shortest].end - merged[shortest].start) shortest = i;
    }
    const target = shortest === 0 ? 1 : shortest - 1;
    const [a, b] = target < shortest ? [merged[target], merged[shortest]] : [merged[shortest], merged[target]];
    a.end = b.end;
    a.text = `${a.text} ${b.text}`;
    merged.splice(shortest, 1);
  }
  return merged;
}

interface ChatKeys {
  groqKey?: string;
  openaiKey?: string;
  claudeKey?: string;
}

async function chatJson(prompt: string, keys: ChatKeys): Promise<string | null> {
  const timeout = AbortSignal.timeout(30000);

  // Anthropic (frontier key first — best query taste)
  const claudeKey = (keys.claudeKey || process.env.ANTHROPIC_API_KEY || "").trim();
  if (claudeKey) {
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": claudeKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-latest",
          max_tokens: 1200,
          messages: [{ role: "user", content: prompt }],
        }),
        signal: timeout,
      });
      if (res.ok) {
        const data: any = await res.json();
        const text = (data.content || []).map((c: any) => c.text || "").join("");
        if (text) return text;
      }
    } catch {}
  }

  // OpenAI
  const openaiKey = (keys.openaiKey || "").trim();
  if (openaiKey && !openaiKey.startsWith("sk-hc-v1-")) {
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${openaiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          temperature: 0.4,
        }),
        signal: timeout,
      });
      if (res.ok) {
        const data: any = await res.json();
        const text = data.choices?.[0]?.message?.content;
        if (text) return text;
      }
    } catch {}
  }

  // Groq fallback (gpt-oss-120b, then 20b; key2 rotation like the curation path)
  const groqKeys = [
    (keys.groqKey || process.env.GROQ_API_KEY || "").trim(),
    (process.env.GROQ_API_KEY2 || "").trim(),
  ].filter(Boolean);
  for (const key of groqKeys) {
    for (const model of ["openai/gpt-oss-120b", "openai/gpt-oss-20b"]) {
      try {
        const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: prompt }],
            temperature: 0.4,
          }),
          signal: timeout,
        });
        if (res.ok) {
          const data: any = await res.json();
          const text = data.choices?.[0]?.message?.content;
          if (text) return text;
        }
      } catch {}
    }
  }
  return null;
}

const STOPWORDS = new Set(
  "the a an and or but of to in on for with is are was were be been it its this that these those you your we our they their he she his her as at by from not no yes do does did have has had will would can could should there here what when where which who how all any than then so very just".split(" ")
);

function keywordQuery(text: string): string {
  const words = text
    .replace(/[^A-Za-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w.toLowerCase()));
  return words.slice(0, 5).join(" ") || "cinematic lifestyle";
}

export async function planBroll(
  sentences: BrollSentence[],
  keys: ChatKeys
): Promise<BrollPlanItem[]> {
  if (sentences.length === 0) return [];
  const fallback: BrollPlanItem[] = sentences.map((s) => ({
    ...s,
    query: keywordQuery(s.text),
    kind: "image" as const,
  }));

  const list = sentences.map((s, i) => `${i}. (${s.start.toFixed(1)}s-${s.end.toFixed(1)}s) ${s.text}`).join("\n");
  const prompt = `You are the B-roll picker for a vertical short-form video editor. For each numbered spoken sentence below, choose ONE stock-media search query that visually matches what is being said at that moment — the way a human editor cuts away to a photo, a place, an object, an action or a mood shot.

Rules:
- Concrete visual nouns and scenes only (e.g. "young programmer typing code late night office", "wall street stock chart rising", "empty lecture hall rows"). Never abstract words like "success" or "idea" alone.
- Prefer "video" for actions, movement, people doing things; "image" for objects, places, documents, products, historical topics.
- Keep queries 3-7 words.
- Return ONLY a JSON array, one object per sentence, in order: [{"i":0,"q":"...","kind":"video"}, ...]

Sentences:
${list}`;

  const raw = await chatJson(prompt, keys);
  if (!raw) {
    console.log("[B-roll] No LLM available for planning; using keyword queries");
    return fallback;
  }
  try {
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) return fallback;
    const parsed = JSON.parse(match[0]) as { i: number; q: string; kind: string }[];
    const byIndex = new Map(parsed.map((p) => [p.i, p]));
    return sentences.map((s, i) => {
      const p = byIndex.get(i);
      const q = typeof p?.q === "string" ? p.q.replace(/["\n]/g, " ").trim().slice(0, 80) : "";
      return {
        ...s,
        query: q || keywordQuery(s.text),
        kind: p?.kind === "video" ? ("video" as const) : ("image" as const),
      };
    });
  } catch {
    return fallback;
  }
}

async function downloadToFile(url: string, dest: string, headers: Record<string, string> = {}): Promise<boolean> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "OpusStudio/1.0 (personal clip tool)", ...headers },
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return false;
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 8000) return false; // too small to be real media
    fs.writeFileSync(dest, buf);
    return true;
  } catch {
    return false;
  }
}

function looksLikeImage(p: string): boolean {
  try {
    const fd = fs.openSync(p, "r");
    const buf = Buffer.alloc(12);
    fs.readSync(fd, buf, 0, 12, 0);
    fs.closeSync(fd);
    return (
      buf.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff])) || // jpeg
      buf.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47])) || // png
      buf.subarray(8, 12).toString("ascii") === "WEBP"
    );
  } catch {
    return false;
  }
}

const GATE_STOPWORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "your", "you", "are",
  "was", "were", "has", "have", "into", "over", "under", "about", "stock",
  "footage", "video", "photo", "image", "free", "download",
]);

function queryTerms(query: string): string[] {
  return query
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && !GATE_STOPWORDS.has(w));
}

/**
 * Relevance gate for no-key image sources. Wikimedia Commons' full-text
 * search drifts badly (a "money" query returned antique maps, which
 * then sat on screen for ~10s of a real clip), so a candidate only
 * passes when its own title/tags actually share the planned query's
 * meaningful terms: at least 1 term for short queries, 2 for longer
 * ones. No pass -> the cue is dropped and the real footage stays.
 */
export function brollTitleMatches(query: string, title: string): boolean {
  const terms = queryTerms(query);
  if (terms.length === 0) return true;
  const hay = " " + String(title || "").toLowerCase().replace(/[^a-z0-9\s]/g, " ") + " ";
  const hits = terms.filter((t) => hay.includes(" " + t) || hay.includes(t + " ")).length;
  return hits >= (terms.length >= 3 ? 2 : 1);
}

export async function fetchBrollAssets(
  plan: BrollPlanItem[],
  opts: { pexelsKey?: string; pixabayKey?: string; destDir: string; tag: string }
): Promise<BrollAsset[]> {
  fs.mkdirSync(opts.destDir, { recursive: true });
  const pexelsKey = (opts.pexelsKey || process.env.PEXELS_API_KEY || "").trim();
  const pixabayKey = (opts.pixabayKey || process.env.PIXABAY_API_KEY || "").trim();
  const assets: BrollAsset[] = [];

  for (let i = 0; i < plan.length; i++) {
    const item = plan[i];
    const q = encodeURIComponent(item.query);
    let done = false;

    // Pexels video
    if (!done && pexelsKey && item.kind === "video") {
      try {
        const res = await fetch(`https://api.pexels.com/videos/search?query=${q}&per_page=3&orientation=portrait`, {
          headers: { Authorization: pexelsKey },
          signal: AbortSignal.timeout(10000),
        });
        if (res.ok) {
          const data: any = await res.json();
          for (const vid of data.videos || []) {
            const files = (vid.video_files || [])
              .filter((f: any) => f.link && f.width >= 540)
              .sort((a: any, b: any) => Math.abs(a.width - 1080) - Math.abs(b.width - 1080));
            if (files[0]) {
              const dest = path.join(opts.destDir, `${opts.tag}-${i}.mp4`);
              if (await downloadToFile(files[0].link, dest)) {
                assets.push({ ...item, assetPath: dest });
                done = true;
              }
              break;
            }
          }
        }
      } catch {}
    }

    // Pexels photo
    if (!done && pexelsKey) {
      try {
        const res = await fetch(`https://api.pexels.com/v1/search?query=${q}&per_page=3&orientation=portrait`, {
          headers: { Authorization: pexelsKey },
          signal: AbortSignal.timeout(10000),
        });
        if (res.ok) {
          const data: any = await res.json();
          for (const photo of (data.photos || []).slice(0, 3)) {
            if (photo?.alt && !brollTitleMatches(item.query, photo.alt)) continue;
            const src = photo?.src?.large2x || photo?.src?.large || photo?.src?.original;
            if (!src) continue;
            const dest = path.join(opts.destDir, `${opts.tag}-${i}.jpg`);
            if ((await downloadToFile(src, dest)) && looksLikeImage(dest)) {
              assets.push({ ...item, kind: "image", assetPath: dest });
              done = true;
              break;
            }
          }
        }
      } catch {}
    }

    // Pixabay (free key) — Pexels paused new API key issuance in Sept
    // 2026, so this is the keyed source new users can actually get.
    // Videos first, then photos; candidates are relevance-gated on
    // Pixabay's own tags so off-topic hits never reach the clip.
    if (!done && pixabayKey && item.kind === "video") {
      try {
        const res = await fetch(
          `https://pixabay.com/api/videos/?key=${encodeURIComponent(pixabayKey)}&q=${q}&per_page=4`,
          { signal: AbortSignal.timeout(10000) }
        );
        if (res.ok) {
          const data: any = await res.json();
          for (const hit of (data.hits || []).slice(0, 4)) {
            if (!brollTitleMatches(item.query, hit?.tags || "")) continue;
            const files = [hit?.videos?.large, hit?.videos?.medium, hit?.videos?.small]
              .filter((f: any) => f?.url && (f.width || 0) >= 540)
              .sort((a: any, c: any) => Math.abs(a.width - 1080) - Math.abs(c.width - 1080));
            if (!files[0]) continue;
            const dest = path.join(opts.destDir, `${opts.tag}-${i}.mp4`);
            if (await downloadToFile(files[0].url, dest)) {
              assets.push({ ...item, kind: "video", assetPath: dest });
              done = true;
              break;
            }
          }
        }
      } catch {}
    }

    if (!done && pixabayKey) {
      try {
        const res = await fetch(
          `https://pixabay.com/api/?key=${encodeURIComponent(pixabayKey)}&q=${q}&image_type=photo&per_page=4`,
          { signal: AbortSignal.timeout(10000) }
        );
        if (res.ok) {
          const data: any = await res.json();
          for (const hit of (data.hits || []).slice(0, 4)) {
            if (!brollTitleMatches(item.query, hit?.tags || "")) continue;
            const src = hit?.largeImageURL || hit?.webformatURL;
            if (!src) continue;
            const dest = path.join(opts.destDir, `${opts.tag}-${i}.jpg`);
            if ((await downloadToFile(src, dest)) && looksLikeImage(dest)) {
              assets.push({ ...item, kind: "image", assetPath: dest });
              done = true;
              break;
            }
            try { fs.unlinkSync(dest); } catch {}
          }
        }
      } catch {}
    }

    // Wikimedia Commons (no key) — images. Openverse's anonymous API is
    // Cloudflare-gated from many networks, so Commons is the reliable
    // no-key source; results are documentary/encyclopedic in flavour.
    if (!done) {
      try {
        const api =
          `https://commons.wikimedia.org/w/api.php?action=query&generator=search` +
          `&gsrsearch=${q}%20filetype:bitmap&gsrnamespace=6&gsrlimit=6` +
          `&prop=imageinfo&iiprop=url%7Csize%7Cmime&iiurlwidth=1200&format=json`;
        const res = await fetch(api, {
          headers: { "User-Agent": "OpusStudio/1.0 (personal clip tool)" },
          signal: AbortSignal.timeout(10000),
        });
        if (res.ok) {
          const data: any = await res.json();
          const pages = Object.values(data.query?.pages || {}) as any[];
          pages.sort((a, b) => (a.index || 99) - (b.index || 99));
          for (const page of pages) {
            const info = page.imageinfo?.[0];
            if (!info?.thumburl || (info.width || 0) < 700) continue;
            if (!brollTitleMatches(item.query, page.title || "")) continue;
            if (info.mime && !["image/jpeg", "image/png", "image/webp"].includes(info.mime)) continue;
            const dest = path.join(opts.destDir, `${opts.tag}-${i}.jpg`);
            if ((await downloadToFile(info.thumburl, dest)) && looksLikeImage(dest)) {
              assets.push({ ...item, kind: "image", assetPath: dest });
              done = true;
              break;
            }
            try { fs.unlinkSync(dest); } catch {}
          }
        }
      } catch {}
    }

    // Openverse (no key) — images
    if (!done) {
      try {
        const res = await fetch(
          `https://api.openverse.org/v1/images/?q=${q}&page_size=4&license_type=all&filter_dead=false`,
          {
            headers: { "User-Agent": "OpusStudio/1.0 (personal clip tool)" },
            signal: AbortSignal.timeout(10000),
          }
        );
        if (res.ok) {
          const data: any = await res.json();
          for (const r of (data.results || []).slice(0, 4)) {
            if (!r.url) continue;
            const tagText = Array.isArray(r.tags) ? r.tags.map((t: any) => t?.name || "").join(" ") : "";
            if (!brollTitleMatches(item.query, `${r.title || ""} ${tagText}`)) continue;
            const dest = path.join(opts.destDir, `${opts.tag}-${i}.jpg`);
            if ((await downloadToFile(r.url, dest)) && looksLikeImage(dest)) {
              assets.push({ ...item, kind: "image", assetPath: dest });
              done = true;
              break;
            }
            try { fs.unlinkSync(dest); } catch {}
          }
        }
      } catch {}
    }

    if (!done) console.log(`[B-roll] No asset found for cue ${i} ("${item.query}") — keeping base footage`);
  }

  console.log(`[B-roll] Fetched ${assets.length}/${plan.length} cutaway asset(s)`);
  return assets;
}
