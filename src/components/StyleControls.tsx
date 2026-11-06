"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  ClipStyle,
  DEFAULT_CLIP_STYLE,
  MUSIC_MOODS,
  COLOR_GRADES,
  TRANSITIONS,
  ZOOM_TYPES,
  FILM_LOOKS,
  HOOK_ANIMS,
  FIT_BACKGROUNDS,
  CAPTION_CASES,
  CAPTION_SIZES,
  PACES,
  FACE_BUBBLES,
  BILINGUAL_LANGS,
  MOOD_LABELS,
  GRADE_LABELS,
  TRANSITION_LABELS,
  ZOOM_LABELS,
  FILM_LOOK_LABELS,
  HOOK_ANIM_LABELS,
  FIT_BG_LABELS,
  CASE_LABELS,
  SIZE_LABELS,
  PACE_LABELS,
  FACE_BUBBLE_LABELS,
  LANG_LABELS,
  CAPTION_FONT_OPTIONS,
  STYLE_PACKS,
  BrandStyle,
  BACKGROUNDS,
  BACKGROUND_LABELS,
  FACE_BLURS,
  FACE_BLUR_LABELS,
} from "@/lib/clipStyleOptions";

type Track = { id: string; name: string; duration: number };

const authHeaders = (): Record<string, string> => {
  try {
    const t = localStorage.getItem("app_access_token");
    return t ? { "x-app-access-token": t } : {};
  } catch {
    return {};
  }
};

/** The brand kit saved on /brand-kit, as render settings (null if none saved). */
export function readBrandKit(): BrandStyle | null {
  try {
    const raw = localStorage.getItem("snipcut_brand_kit");
    if (!raw) return null;
    const b = JSON.parse(raw);
    const hex = (v: unknown, d: string) => (typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v) ? v : d);
    return {
      name: typeof b.brandName === "string" ? b.brandName.slice(0, 40) : "",
      primary: hex(b.primaryColor, "#FACC15"),
      secondary: hex(b.secondaryColor, "#22C55E"),
      watermark: true,
      watermarkPos: ["top-right", "top-left", "bottom-right", "bottom-left"].includes(b.watermarkPos) ? b.watermarkPos : "top-right",
      watermarkOpacity: typeof b.watermarkOpacity === "number" ? b.watermarkOpacity : 80,
    };
  } catch {
    return null;
  }
}


const lbl = "text-[10px] font-black uppercase text-neutral-600";
const sel =
  "bg-[#F8F7F4] text-black text-xs font-bold px-2 py-1.5 border-2 border-black focus:outline-none focus:bg-white cursor-pointer w-full";

function Select({ label, value, options, onPick }: { label: string; value: string; options: [string, string][]; onPick: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1 min-w-0">
      <span className={lbl}>{label}</span>
      <select value={value} onChange={(e) => onPick(e.target.value)} className={sel}>
        {options.map(([id, l]) => (
          <option key={id} value={id}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

function Toggle({
  style,
  onChange,
  k,
  label,
  hint,
}: {
  style: ClipStyle;
  onChange: (patch: Partial<ClipStyle>) => void;
  k: keyof ClipStyle;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex items-start gap-2 cursor-pointer select-none">
      <input
        type="checkbox"
        checked={Boolean(style[k])}
        onChange={(e) => onChange({ [k]: e.target.checked } as Partial<ClipStyle>)}
        className="w-4 h-4 mt-0.5 accent-black cursor-pointer shrink-0"
      />
      <span className="leading-tight">
        <span className="text-[11px] font-black uppercase tracking-wide text-black">{label}</span>
        {hint && <span className="block text-[10px] font-medium text-neutral-500">{hint}</span>}
      </span>
    </label>
  );
}

function Text({ label, value, placeholder, onText, max }: { label: string; value: string; placeholder: string; onText: (v: string) => void; max: number }) {
  return (
    <label className="flex flex-col gap-1 min-w-0">
      <span className={lbl}>{label}</span>
      <input
        type="text"
        value={value}
        maxLength={max}
        placeholder={placeholder}
        onChange={(e) => onText(e.target.value)}
        className="bg-[#F8F7F4] text-black text-xs font-bold px-2 py-1.5 border-2 border-black focus:outline-none focus:bg-white w-full"
      />
    </label>
  );
}

function Range({ label, value, min, max, step, unit, onVal }: { label: string; value: number; min: number; max: number; step: number; unit: string; onVal: (v: number) => void }) {
  return (
    <label className="flex flex-col gap-1 min-w-0">
      <span className={`${lbl} flex justify-between`}>
        <span>{label}</span>
        <span className="text-black">
          {value}
          {unit}
        </span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onVal(Number(e.target.value))} className="w-full accent-black" />
    </label>
  );
}

/**
 * Every clip effect, grouped: style packs, look, sound, captions,
 * moments, overlays and brand. Shared by the dashboard and the editor.
 */
export default function StyleControls({
  style,
  onChange,
  font,
  onFont,
  onCaptionStyle,
  dense = false,
  musicOn,
  showReel = false,
}: {
  style: ClipStyle;
  onChange: (patch: Partial<ClipStyle>) => void;
  font: string;
  onFont: (f: string) => void;
  onCaptionStyle?: (s: string) => void;
  dense?: boolean;
  /** Whether "Music bed" is on (music settings do nothing without it). */
  musicOn?: boolean;
  /** Offer the job-level highlight reel (dashboard only). */
  showReel?: boolean;
}) {
  const [tracks, setTracks] = useState<Track[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [activePack, setActivePack] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const [footage, setFootage] = useState<Track[]>([]);
  const [footUploading, setFootUploading] = useState(false);
  const [footError, setFootError] = useState("");
  const footRef = useRef<HTMLInputElement>(null);
  const loadFootage = () =>
    fetch("/api/footage", { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : { items: [] }))
      .then((d) => setFootage(Array.isArray(d.items) ? d.items : []))
      .catch(() => {});
  const uploadFootage = async (file: File) => {
    setFootError("");
    if (file.size > 300 * 1024 * 1024) {
      setFootError("Footage can be up to 300 MB.");
      return;
    }
    setFootUploading(true);
    try {
      const res = await fetch("/api/footage", {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/octet-stream", "x-file-name": encodeURIComponent(file.name) },
        body: file,
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Upload failed");
      await loadFootage();
      onChange({ splitFootage: d.id });
    } catch (e: any) {
      setFootError(e?.message || "Upload failed");
    } finally {
      setFootUploading(false);
    }
  };

  const loadTracks = () =>
    fetch("/api/music", { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : { tracks: [] }))
      .then((d) => setTracks(Array.isArray(d.tracks) ? d.tracks : []))
      .catch(() => {});
  useEffect(() => {
    loadTracks();
    loadFootage();
  }, []);

  const uploadTrack = async (file: File) => {
    setUploadError("");
    if (file.size > 30 * 1024 * 1024) {
      setUploadError("Music files can be up to 30 MB.");
      return;
    }
    setUploading(true);
    try {
      const res = await fetch("/api/music", {
        method: "POST",
        headers: { ...authHeaders(), "Content-Type": "application/octet-stream", "x-file-name": encodeURIComponent(file.name) },
        body: file,
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Upload failed");
      await loadTracks();
      onChange({ customMusic: d.id });
    } catch (e: any) {
      setUploadError(e?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const cols = dense ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4";
  const groupCls = "border-2 border-black bg-white";
  const summaryCls = "cursor-pointer select-none px-3 py-2 text-[11px] font-black uppercase tracking-wider flex items-center justify-between";
  const opts = (list: readonly (string | number)[], labels: Record<string, string>): [string, string][] =>
    list.map((x) => [String(x), labels[String(x)] || String(x)]);

  // Read after mount (localStorage) so the server and first client render match.
  const [brandKit, setBrandKit] = useState<BrandStyle | null>(null);
  useEffect(() => setBrandKit(readBrandKit()), []);

  return (
    <div className="flex flex-col gap-2">
      {/* Style packs */}
      <div>
        <span className={`${lbl} block mb-1`}>Style packs (one click)</span>
        <div className="flex flex-wrap gap-1.5">
          {STYLE_PACKS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                setActivePack(p.id);
                onChange({ ...p.style });
                onFont(p.font);
                onCaptionStyle?.(p.captionStyle);
              }}
              className={`px-2.5 py-1.5 border-2 border-black text-[10px] font-black uppercase cursor-pointer ${
                activePack === p.id ? "bg-black text-white shadow-[2px_2px_0px_#FFC700]" : "bg-[#F8F7F4] hover:bg-white"
              }`}
            >
              {p.label}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setActivePack("");
              onChange({ ...DEFAULT_CLIP_STYLE, drawings: style.drawings });
              onFont("default");
            }}
            className="px-2.5 py-1.5 border-2 border-black text-[10px] font-black uppercase cursor-pointer bg-white hover:bg-[#FFE5E5]"
          >
            Reset
          </button>
        </div>
      </div>

      <details className={groupCls} open>
        <summary className={summaryCls}>Look &amp; motion</summary>
        <div className={`grid ${cols} gap-2 px-3 pb-3`}>
          <Select label="Caption font" value={font} options={CAPTION_FONT_OPTIONS.map((o) => [o.id, o.label])} onPick={onFont} />
          <Select label="Colour grade" value={style.grade} options={opts(COLOR_GRADES, GRADE_LABELS)} onPick={(v) => onChange({ grade: v as ClipStyle["grade"] })} />
          <Select label="Film look" value={style.filmLook} options={opts(FILM_LOOKS, FILM_LOOK_LABELS)} onPick={(v) => onChange({ filmLook: v as ClipStyle["filmLook"] })} />
          <Select label="Cut transition" value={style.transition} options={opts(TRANSITIONS, TRANSITION_LABELS)} onPick={(v) => onChange({ transition: v as ClipStyle["transition"] })} />
          <Select label="Zoom type" value={style.zoomType} options={opts(ZOOM_TYPES, ZOOM_LABELS)} onPick={(v) => onChange({ zoomType: v as ClipStyle["zoomType"] })} />
          <Select label="Hook animation" value={style.hookAnim} options={opts(HOOK_ANIMS, HOOK_ANIM_LABELS)} onPick={(v) => onChange({ hookAnim: v as ClipStyle["hookAnim"] })} />
          <Select label="Screen background" value={style.fitBackground} options={opts(FIT_BACKGROUNDS, FIT_BG_LABELS)} onPick={(v) => onChange({ fitBackground: v as ClipStyle["fitBackground"] })} />
          <Select label="Pace" value={String(style.pace)} options={opts(PACES, PACE_LABELS)} onPick={(v) => onChange({ pace: Number(v) })} />
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-2 px-3 pb-3">
          <Toggle style={style} onChange={onChange} k="pushIn" label="Slow push-in" hint="camera drifts in" />
          <Toggle style={style} onChange={onChange} k="progressBar" label="Progress bar" hint="fills across the top" />
        </div>
        <div className={`grid ${cols} gap-2 px-3 pb-2`}>
          <Select label="Behind the speaker" value={style.background} options={opts(BACKGROUNDS, BACKGROUND_LABELS)} onPick={(v) => onChange({ background: v as ClipStyle["background"] })} />
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-2 px-3 pb-2">
          <Toggle style={style} onChange={onChange} k="textBehind" label="Title behind me" hint="hook title sits behind your head" />
          <Toggle style={style} onChange={onChange} k="subjectGlow" label="Subject glow" hint="soft outline around you" />
        </div>
        <p className="px-3 pb-3 text-[10px] font-medium text-neutral-500">
          The AI cuts the speaker out of the shot for these three. They apply to talking-head shots (not screen recordings).
        </p>
      </details>

      <details className={groupCls} onToggle={(e) => (e.currentTarget as HTMLDetailsElement).open && loadTracks()}>
        <summary className={summaryCls}>Sound &amp; music</summary>
        {musicOn === false && (
          <p className="mx-3 mb-2 px-2 py-1.5 bg-[#FFF3C4] border-2 border-black text-[10px] font-bold">
            &quot;Music bed&quot; is off, so mood, track, volume and fades won&apos;t be used. Turn it on to add music.
          </p>
        )}
        <div className={`grid ${cols} gap-2 px-3 pb-2`}>
          <Select label="Music mood" value={style.musicMood} options={opts(MUSIC_MOODS, MOOD_LABELS)} onPick={(v) => onChange({ musicMood: v as ClipStyle["musicMood"] })} />
          <Select
            label="Music track"
            value={style.customMusic}
            options={[["", "Generated (mood)"], ...tracks.map((t) => [t.id, t.name] as [string, string])]}
            onPick={(v) => onChange({ customMusic: v })}
          />
          <Range label="Music volume" value={style.musicVolume} min={0} max={100} step={5} unit="%" onVal={(v) => onChange({ musicVolume: v })} />
          <Range label="Start music at" value={style.musicStart} min={0} max={120} step={1} unit="s" onVal={(v) => onChange({ musicStart: v })} />
          <Range label="Fade in" value={style.musicFadeIn} min={0} max={5} step={0.1} unit="s" onVal={(v) => onChange({ musicFadeIn: v })} />
          <Range label="Fade out" value={style.musicFadeOut} min={0} max={5} step={0.1} unit="s" onVal={(v) => onChange({ musicFadeOut: v })} />
        </div>
        <div className="px-3 pb-2 flex items-center gap-2 flex-wrap">
          <input
            ref={fileRef}
            type="file"
            accept=".mp3,.wav,.m4a,.aac,.ogg,audio/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadTrack(f);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            disabled={uploading}
            onClick={() => fileRef.current?.click()}
            className="px-2.5 py-1.5 border-2 border-black text-[10px] font-black uppercase cursor-pointer bg-[#FFC700] hover:bg-[#FFD84D] disabled:opacity-60"
          >
            {uploading ? "Uploading…" : "Upload your music"}
          </button>
          <span className="text-[10px] font-medium text-neutral-500">
            Music plays when &quot;Music bed&quot; is on. Put &quot;120bpm&quot; in the file name for beat sync.
          </span>
          {uploadError && <span className="text-[10px] font-bold text-red-600">{uploadError}</span>}
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-2 px-3 pb-3">
          <Toggle style={style} onChange={onChange} k="sfx" label="Sound effects" hint="whoosh, pop, ding, riser" />
          <Toggle style={style} onChange={onChange} k="voiceEnhance" label="Studio voice" hint="clean, loud, clear" />
          <Toggle style={style} onChange={onChange} k="bleep" label="Bleep swearing" hint="beep + f*** in captions" />
          <Toggle style={style} onChange={onChange} k="voiceoverIntro" label="AI voiceover intro" hint="narrator reads the hook (OpenAI key)" />
        </div>
      </details>

      <details className={groupCls}>
        <summary className={summaryCls}>Captions</summary>
        <div className={`grid ${cols} gap-2 px-3 pb-2`}>
          <Select label="Letter case" value={style.captionCase} options={opts(CAPTION_CASES, CASE_LABELS)} onPick={(v) => onChange({ captionCase: v as ClipStyle["captionCase"] })} />
          <Select label="Caption size" value={style.captionSize} options={opts(CAPTION_SIZES, SIZE_LABELS)} onPick={(v) => onChange({ captionSize: v as ClipStyle["captionSize"] })} />
          <Select label="Second language" value={style.bilingual} options={opts(BILINGUAL_LANGS, LANG_LABELS)} onPick={(v) => onChange({ bilingual: v as ClipStyle["bilingual"] })} />
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-2 px-3 pb-3">
          <Toggle style={style} onChange={onChange} k="emoji" label="Auto emoji" hint="🔥 💰 🚀 pop on key words" />
          <Toggle style={style} onChange={onChange} k="speakerColors" label="Speaker colours" hint="2nd speaker in another colour" />
          <Toggle style={style} onChange={onChange} k="counters" label="Number counters" hint="$599 counts up on screen" />
        </div>
      </details>

      <details className={groupCls}>
        <summary className={summaryCls}>Moments &amp; overlays</summary>
        <div className="flex flex-wrap gap-x-5 gap-y-2 px-3 pb-2">
          <Toggle style={style} onChange={onChange} k="hypeMoments" label="AI hype moments" hint="biggest moment: zoom + boom + flash + 🔥" />
          <Toggle style={style} onChange={onChange} k="freezeFrame" label="Freeze-frame" hint="record scratch on the big moment" />
          <Toggle style={style} onChange={onChange} k="coldOpen" label="Cold-open teaser" hint="big moment first: “wait for it”" />
          <Toggle style={style} onChange={onChange} k="endCard" label="End card" hint="animated follow card" />
          <Toggle style={style} onChange={onChange} k="textSlam" label="Text slams" hint="best line slams in full-screen" />
          <Toggle style={style} onChange={onChange} k="stickers" label="Animated stickers" hint="subscribe button + LOL / NO WAY!" />
          <Toggle style={style} onChange={onChange} k="listicle" label="List labels" hint={'"3 tips" → TIP 1/3, TIP 2/3...'} />
          {showReel && <Toggle style={style} onChange={onChange} k="highlightReel" label="Highlight reel" hint="also one video of the best moments" />}
        </div>
        <div className={`grid ${cols} gap-2 px-3 pb-3`}>
          <Text label="End card text" value={style.endCardText} placeholder="FOLLOW FOR MORE" max={40} onText={(v) => onChange({ endCardText: v })} />
          <Text label="Lower third: name" value={style.lowerThirdName} placeholder="e.g. Alex Hormozi" max={40} onText={(v) => onChange({ lowerThirdName: v })} />
          <Text label="Lower third: title" value={style.lowerThirdTitle} placeholder="e.g. Founder, Acquisition.com" max={50} onText={(v) => onChange({ lowerThirdTitle: v })} />
          <Select label="Face-cam bubble" value={style.faceBubble} options={opts(FACE_BUBBLES, FACE_BUBBLE_LABELS)} onPick={(v) => onChange({ faceBubble: v as ClipStyle["faceBubble"] })} />
        </div>
        <p className="px-3 pb-3 -mt-1 text-[10px] font-medium text-neutral-500">
          Face-cam bubble works on 9:16 screen recordings: pick the corner your webcam is in. Freeze-frame, cold open and hype need a clip with a clear loud moment.
        </p>
      </details>

      <details className={groupCls} onToggle={(e) => (e.currentTarget as HTMLDetailsElement).open && loadFootage()}>
        <summary className={summaryCls}>Layout &amp; privacy</summary>
        <div className={`grid ${cols} gap-2 px-3 pb-2`}>
          <Select
            label="Bottom footage (split)"
            value={style.splitFootage}
            options={[["", "Off"], ...footage.map((t) => [t.id, t.name] as [string, string])]}
            onPick={(v) => onChange({ splitFootage: v })}
          />
          <Select label="Blur faces" value={style.faceBlur} options={opts(FACE_BLURS, FACE_BLUR_LABELS)} onPick={(v) => onChange({ faceBlur: v as ClipStyle["faceBlur"] })} />
        </div>
        <div className="px-3 pb-2 flex items-center gap-2 flex-wrap">
          <input
            ref={footRef}
            type="file"
            accept=".mp4,.mov,.webm,.mkv,video/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) uploadFootage(f);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            disabled={footUploading}
            onClick={() => footRef.current?.click()}
            className="px-2.5 py-1.5 border-2 border-black text-[10px] font-black uppercase cursor-pointer bg-[#FFC700] hover:bg-[#FFD84D] disabled:opacity-60"
          >
            {footUploading ? "Uploading…" : "Upload gameplay / footage"}
          </button>
          <span className="text-[10px] font-medium text-neutral-500">Clip on top, your footage looping underneath (9:16). Captions sit on the seam.</span>
          {footError && <span className="text-[10px] font-bold text-red-600">{footError}</span>}
        </div>
        <div className="flex flex-wrap gap-x-5 gap-y-2 px-3 pb-3">
          <Toggle style={style} onChange={onChange} k="audiogram" label="Audiogram (podcast)" hint="waveform + cover instead of the camera" />
        </div>
        <p className="px-3 pb-3 -mt-1 text-[10px] font-medium text-neutral-500">
          Blur faces: "Other people" keeps the main speaker sharp. Audio-only uploads (MP3 / WAV) always become audiograms.
        </p>
      </details>

      <details className={groupCls}>
        <summary className={summaryCls}>Brand kit</summary>
        <div className="px-3 pb-3 flex flex-col gap-2">
          <label className="flex items-start gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={Boolean(style.brand)}
              onChange={(e) => onChange({ brand: e.target.checked ? readBrandKit() || { name: "", primary: "#FACC15", secondary: "#22C55E", watermark: true, watermarkPos: "top-right", watermarkOpacity: 80 } : null })}
              className="w-4 h-4 mt-0.5 accent-black cursor-pointer shrink-0"
            />
            <span className="leading-tight">
              <span className="text-[11px] font-black uppercase tracking-wide text-black">Use my brand kit</span>
              <span className="block text-[10px] font-medium text-neutral-500">
                Brand colours on captions, bar and lower third; your name as a watermark and on the end card.
                {!brandKit && " Set it up on the Brand Kit page first."}
              </span>
            </span>
          </label>
          {style.brand && (
            <div className="flex items-center gap-3 flex-wrap text-[10px] font-bold">
              <span className="flex items-center gap-1">
                <span className="w-4 h-4 border-2 border-black inline-block" style={{ background: style.brand.primary }} /> Accent
              </span>
              <span className="flex items-center gap-1">
                <span className="w-4 h-4 border-2 border-black inline-block" style={{ background: style.brand.secondary }} /> Keywords
              </span>
              <span>Watermark: {style.brand.name || "—"}</span>
              <label className="flex items-center gap-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={style.brand.watermark}
                  onChange={(e) => onChange({ brand: { ...style.brand!, watermark: e.target.checked } })}
                  className="w-3.5 h-3.5 accent-black"
                />
                show watermark
              </label>
              <a href="/brand-kit" className="underline">
                Edit brand kit
              </a>
            </div>
          )}
        </div>
      </details>
    </div>
  );
}
