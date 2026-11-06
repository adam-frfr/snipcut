"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Bot, Check, Clock, ExternalLink, Pause, Play, RefreshCw, Send, Trash2, X, Tv as Youtube } from "lucide-react";
import StyleControls from "@/components/StyleControls";
import ApiSettingsModal from "@/components/ApiSettingsModal";
import { ClipStyle, DEFAULT_CLIP_STYLE, normalizeClipStyle, CAPTION_FONT_OPTIONS } from "@/lib/clipStyleOptions";

/**
 * Autopilot: finds trending videos (or new uploads from channels you
 * follow), clips them with your recipe, keeps the best clips, and posts them
 * to your YouTube channel on a schedule — with an approval inbox first.
 */

type Settings = any;
interface Post {
  id: string; file: string; poster?: string; duration: number; viralityScore: number;
  title: string; description: string; sourceTitle: string; sourceChannel: string;
  status: string; scheduledFor?: number; youtubeId?: string; youtubeStatus?: string; error?: string; postedAt?: number;
}
interface Item {
  id: string; url: string; title: string; channel: string; views: number; durationSec: number;
  reason: string; source: string; status: string; jobId?: string; error?: string; foundAt: number;
}
interface ApState {
  settings: Settings; items: Item[]; posts: Post[]; log: { at: number; level: string; msg: string }[];
  paused: { at: number; reason: string } | null; lastHuntAt: number | null;
  youtube: { connected: boolean; channelTitle?: string };
  setup: { youtubeApiKey: boolean; googleOauth: boolean; redirectUri: string; groq: boolean; timezone: string };
}

const CAPTION_STYLES = ["snipcut", "boxed", "bounce", "kinetic", "typewriter", "slide", "glow", "hormozi", "neon", "beast", "clean"];

const headers = (): Record<string, string> => {
  try {
    const t = localStorage.getItem("app_access_token");
    return t ? { "x-app-access-token": t } : {};
  } catch {
    return {};
  }
};
const AUTH_MSG = "Enter your access key in API Keys to use Autopilot.";
const NET_MSG = "Couldn't reach the server.";
const clipUrl = (f: string) => `/api/autopilot/clip?file=${encodeURIComponent(f)}`;
const when = (t?: number | null) => (t ? new Date(t).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit", month: "short", day: "numeric" }) : "—");
const lines = (v: string[] | undefined) => (v || []).join("\n");
const toList = (s: string) => s.split(/\n|,/).map((x) => x.trim()).filter(Boolean);

function Card({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="bg-white border-2 border-black rounded-2xl p-5 shadow-[4px_4px_0px_#000000]">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <h2 className="font-black uppercase text-sm tracking-wide">{title}</h2>
        {right}
      </div>
      {children}
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-black uppercase tracking-wider mb-1">{label}</span>
      {children}
      {hint && <span className="block text-[10px] font-bold text-neutral-500 mt-1">{hint}</span>}
    </label>
  );
}

/** One-item-per-line box: keeps what you type (blank lines, trailing Enter) and reports the cleaned list. */
function ListArea({ value, onChange, rows }: { value: string[]; onChange: (v: string[]) => void; rows: number }) {
  const [text, setText] = useState(lines(value));
  return (
    <textarea
      rows={rows}
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        onChange(toList(e.target.value));
      }}
      className="w-full neo-input py-2 px-2 text-xs"
    />
  );
}

function SetupRow({ ok, label, help }: { ok: boolean; label: string; help: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 py-1.5">
      <span className={`mt-0.5 w-4 h-4 shrink-0 border-2 border-black rounded-sm flex items-center justify-center ${ok ? "bg-[#7CFFB2]" : "bg-[#FFD1D1]"}`}>
        {ok ? <Check className="w-3 h-3 stroke-[4]" /> : <X className="w-3 h-3 stroke-[4]" />}
      </span>
      <div className="text-xs font-bold">
        {label}
        {!ok && <div className="text-[11px] font-medium text-neutral-600 mt-0.5">{help}</div>}
      </div>
    </div>
  );
}

function PostCard({ p, onAction }: { p: Post; onAction: (action: string, extra?: any) => Promise<void> }) {
  const [title, setTitle] = useState(p.title);
  const [desc, setDesc] = useState(p.description);
  const [busy, setBusy] = useState("");
  const editable = p.status === "pending" || p.status === "approved";
  const run = async (a: string) => {
    setBusy(a);
    await onAction(a, editable ? { title, description: desc } : undefined);
    setBusy("");
  };
  return (
    <div className="border-2 border-black rounded-xl p-3 bg-[#F8F7F4] flex flex-col sm:flex-row gap-3">
      <video
        src={clipUrl(p.file)}
        poster={p.poster ? clipUrl(p.poster) : undefined}
        controls
        preload="none"
        className="w-full sm:w-40 aspect-[9/16] bg-black rounded-lg border-2 border-black object-cover shrink-0"
      />
      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex flex-wrap gap-1.5 text-[10px] font-black uppercase">
          <span className="neo-tag-yellow">Score {p.viralityScore}</span>
          <span className="neo-tag-white">{Math.round(p.duration)}s</span>
          {p.scheduledFor && p.status === "approved" && <span className="neo-tag-white"><Clock className="inline w-3 h-3 mr-1" />{when(p.scheduledFor)}</span>}
        </div>
        <p className="text-[11px] font-bold text-neutral-500 truncate">From: {p.sourceTitle} — {p.sourceChannel}</p>
        {editable ? (
          <>
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} className="w-full neo-input py-1.5 px-2 text-sm" />
            <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} className="w-full neo-input py-1.5 px-2 text-xs font-medium" />
          </>
        ) : (
          <p className="text-sm font-black">{p.title}</p>
        )}
        {p.error && p.status !== "posted" && <p className="text-[11px] font-bold text-red-600">{p.error}</p>}
        <div className="flex flex-wrap gap-2">
          {p.status === "pending" && (
            <button onClick={() => run("approve")} disabled={!!busy} className="neo-btn-yellow px-3 py-1.5 rounded-lg text-xs font-black uppercase">
              <Check className="inline w-3.5 h-3.5 mr-1" />{busy === "approve" ? "..." : "Approve"}
            </button>
          )}
          {p.status === "approved" && (
            <button onClick={() => run("edit")} disabled={!!busy} className="neo-btn-white px-3 py-1.5 rounded-lg text-xs font-black uppercase">
              {busy === "edit" ? "..." : "Save text"}
            </button>
          )}
          {(p.status === "pending" || p.status === "approved" || p.status === "failed") && (
            <button onClick={() => run("postNow")} disabled={!!busy} className="neo-btn-black px-3 py-1.5 rounded-lg text-xs font-black uppercase">
              <Send className="inline w-3.5 h-3.5 mr-1" />{busy === "postNow" ? "Uploading..." : "Post now"}
            </button>
          )}
          {(p.status === "pending" || p.status === "approved" || p.status === "failed") && (
            <button onClick={() => run("reject")} disabled={!!busy} className="neo-btn-white px-3 py-1.5 rounded-lg text-xs font-black uppercase">
              <Trash2 className="inline w-3.5 h-3.5 mr-1" />Reject
            </button>
          )}
          <a href={clipUrl(p.file)} download className="neo-btn-white px-3 py-1.5 rounded-lg text-xs font-black uppercase">Download</a>
        </div>
      </div>
    </div>
  );
}

export default function AutopilotPage() {
  const [st, setSt] = useState<ApState | null>(null);
  const [form, setForm] = useState<Settings | null>(null);
  const [dirty, setDirty] = useState(false);
  const [err, setErr] = useState("");
  const [flash, setFlash] = useState("");
  const [addUrl, setAddUrl] = useState("");
  const [showStyle, setShowStyle] = useState(false);
  const [showKeys, setShowKeys] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formVersion, setFormVersion] = useState(0);

  const load = useCallback(async (resetForm = false) => {
    try {
      const res = await fetch("/api/autopilot", { headers: headers(), cache: "no-store" });
      if (res.status === 401) {
        setErr(AUTH_MSG);
        return;
      }
      const data = (await res.json()) as ApState;
      // Clear only load problems; keep an action's error (e.g. a failed
      // "Post now") on screen until the next action.
      setErr((e) => (e === AUTH_MSG || e === NET_MSG ? "" : e));
      setSt(data);
      if (resetForm) {
        setForm(data.settings);
        setFormVersion((v) => v + 1);
        setDirty(false);
      }
    } catch {
      setErr(NET_MSG);
    }
  }, []);

  useEffect(() => {
    void load(true);
    const t = window.setInterval(() => void load(false), 15000);
    try {
      const yt = new URLSearchParams(window.location.search).get("yt");
      if (yt) {
        setFlash(yt === "ok" ? "YouTube channel connected." : yt);
        window.history.replaceState(null, "", "/autopilot");
      }
    } catch {}
    return () => window.clearInterval(t);
  }, [load]);

  const set = (patch: Partial<Settings>) => {
    setForm((f: Settings) => ({ ...f, ...patch }));
    setDirty(true);
  };
  const setRecipe = (patch: any) => {
    setForm((f: Settings) => ({ ...f, recipe: { ...f.recipe, ...patch } }));
    setDirty(true);
  };

  const save = async (extra?: Partial<Settings>) => {
    if (!form) return;
    setSaving(true);
    try {
      const res = await fetch("/api/autopilot", {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...headers() },
        body: JSON.stringify({ settings: { ...form, ...extra } }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setForm(data.settings);
      setDirty(false);
      setFlash("Saved.");
      await load(false);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };

  const act = async (action: string, extra: any = {}) => {
    try {
      const res = await fetch("/api/autopilot/action", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers() },
        body: JSON.stringify({ action, ...extra }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) setErr(data.error || "That didn't work.");
      else setErr("");
    } catch {
      setErr("Couldn't reach the server.");
    }
    await load(false);
  };

  const copyDashboardStyle = () => {
    try {
      const raw = localStorage.getItem("snipcut_clip_style");
      const f = localStorage.getItem("snipcut_caption_font") || "";
      setRecipe({ clipStyle: raw ? normalizeClipStyle(JSON.parse(raw)) : DEFAULT_CLIP_STYLE, captionFont: f });
      setFlash("Copied your dashboard look & sound. Save to keep it.");
    } catch {
      setErr("No saved dashboard style found.");
    }
  };

  const posts = st?.posts || [];
  const pending = posts.filter((p) => p.status === "pending");
  const scheduled = posts.filter((p) => p.status === "approved" || p.status === "uploading").sort((a, b) => (a.scheduledFor || 0) - (b.scheduledFor || 0));
  const posted = posts.filter((p) => p.status === "posted");
  const failed = posts.filter((p) => p.status === "failed");
  const style: ClipStyle = normalizeClipStyle(form?.recipe?.clipStyle || {});

  return (
    <div className="min-h-screen bg-[#F8F7F4] text-black">
      <header className="sticky top-0 z-40 bg-[#F8F7F4] border-b-2 border-black px-4 sm:px-6 py-3.5">
        <div className="flex items-center justify-between max-w-6xl mx-auto gap-3">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="p-1.5 border-2 border-black bg-white hover:bg-[#FFC700] rounded-lg transition-colors">
              <ArrowLeft className="w-4 h-4 stroke-[3]" />
            </Link>
            <span className="font-black text-sm uppercase tracking-tight flex items-center gap-2"><Bot className="w-4 h-4" />Autopilot</span>
            {st && (
              <span className={st.paused ? "neo-tag-orange text-[10px]" : st.settings.enabled ? "neo-tag-yellow text-[10px]" : "neo-tag-white text-[10px]"}>
                {st.paused ? "Paused" : st.settings.enabled ? "On" : "Off"}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowKeys(true)} className="neo-btn-white px-3 py-1.5 rounded-lg text-xs font-black uppercase">API Keys</button>
            <Link href="/dashboard" className="neo-btn-white px-3 py-1.5 rounded-lg text-xs font-black uppercase hidden sm:inline-block">Dashboard</Link>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-6">
        {err && <div className="p-3 border-2 border-black bg-[#FFD1D1] font-bold text-sm rounded-xl">{err}</div>}
        {flash && (
          <div className="p-3 border-2 border-black bg-[#FFF3C4] font-bold text-sm rounded-xl flex justify-between gap-3">
            <span>{flash}</span>
            <button onClick={() => setFlash("")}><X className="w-4 h-4" /></button>
          </div>
        )}
        {st?.paused && (
          <div className="p-4 border-2 border-black bg-[#FFB27C] rounded-xl flex flex-wrap items-center justify-between gap-3">
            <span className="font-bold text-sm">Paused: {st.paused.reason}</span>
            <button onClick={() => act("resume")} className="neo-btn-black px-3 py-1.5 rounded-lg text-xs font-black uppercase"><Play className="inline w-3.5 h-3.5 mr-1" />Resume</button>
          </div>
        )}

        {!st || !form ? (
          <p className="font-bold text-sm">{err ? "" : "Loading..."}</p>
        ) : (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <Card title="Control">
                <div className="space-y-3">
                  <label className="flex items-center justify-between gap-3 p-3 border-2 border-black rounded-xl bg-[#F8F7F4] cursor-pointer">
                    <span className="font-black text-sm uppercase">Autopilot {form.enabled ? "on" : "off"}</span>
                    <input type="checkbox" checked={form.enabled} onChange={(e) => save({ enabled: e.target.checked })} className="w-5 h-5 accent-black" />
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {(["approve", "auto"] as const).map((m) => (
                      <button
                        key={m}
                        onClick={() => save({ mode: m })}
                        className={`p-2 border-2 border-black rounded-lg text-[11px] font-black uppercase ${form.mode === m ? "bg-black text-white" : "bg-white"}`}
                      >
                        {m === "approve" ? "Approve first" : "Fully automatic"}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] font-medium text-neutral-600">
                    {form.mode === "approve" ? "New clips wait in your inbox; approved ones post on schedule." : "Clips above your score post on schedule without asking."}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => act("run")} className="neo-btn-yellow px-3 py-2 rounded-lg text-xs font-black uppercase"><RefreshCw className="inline w-3.5 h-3.5 mr-1" />Find videos now</button>
                    {!st.paused && (
                      <button onClick={() => act("pause")} className="neo-btn-white px-3 py-2 rounded-lg text-xs font-black uppercase"><Pause className="inline w-3.5 h-3.5 mr-1" />Pause</button>
                    )}
                  </div>
                  <p className="text-[11px] font-bold text-neutral-500">Last search: {when(st.lastHuntAt)} · every {form.huntEveryHours}h</p>
                  <div className="flex gap-2">
                    <input value={addUrl} onChange={(e) => setAddUrl(e.target.value)} placeholder="Clip this YouTube link next" className="flex-1 min-w-0 neo-input py-2 px-2 text-xs" />
                    <button
                      onClick={async () => { if (addUrl.trim()) { await act("add", { url: addUrl.trim() }); setAddUrl(""); } }}
                      className="neo-btn-black px-3 py-2 rounded-lg text-xs font-black uppercase"
                    >Add</button>
                  </div>
                </div>
              </Card>

              <Card title="YouTube channel">
                {st.youtube.connected ? (
                  <div className="space-y-3">
                    <p className="font-black text-sm flex items-center gap-2"><Youtube className="w-4 h-4" />{st.youtube.channelTitle || "Connected"}</p>
                    <p className="text-[11px] font-medium text-neutral-600">Until Google audits your API project, YouTube keeps uploaded videos private — make them public in YouTube Studio.</p>
                    <button onClick={() => act("disconnect")} className="neo-btn-white px-3 py-1.5 rounded-lg text-xs font-black uppercase">Disconnect</button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-xs font-bold">Connect the channel Autopilot should post to.</p>
                    <a href="/api/autopilot/youtube/connect" className={`inline-block neo-btn-yellow px-3 py-2 rounded-lg text-xs font-black uppercase ${st.setup.googleOauth ? "" : "opacity-50 pointer-events-none"}`}>
                      <Youtube className="inline w-3.5 h-3.5 mr-1" />Connect YouTube
                    </a>
                    {!st.setup.googleOauth && <p className="text-[11px] font-medium text-neutral-600">Needs Google sign-in set up on the server first (see Setup).</p>}
                  </div>
                )}
              </Card>

              <Card title="Setup">
                <SetupRow ok={st.setup.youtubeApiKey} label="Trend search (YouTube Data API key)" help={<>Server setting <code>YOUTUBE_API_KEY</code>. Without it, only channels you follow are checked.</>} />
                <SetupRow ok={st.setup.googleOauth} label="Google sign-in for uploads" help={<>Server settings <code>GOOGLE_CLIENT_ID</code> and <code>GOOGLE_CLIENT_SECRET</code>. Redirect URI: <code className="break-all">{st.setup.redirectUri}</code></>} />
                <SetupRow ok={st.youtube.connected} label="YouTube channel connected" help="Use Connect YouTube." />
                <SetupRow ok={st.setup.groq} label="AI for picking and writing" help={<>Server setting <code>GROQ_API_KEY</code> (free). Without it, the most viewed videos are picked and clip titles are used as-is.</>} />
                <p className="text-[10px] font-bold text-neutral-500 mt-2">Post times use the server clock ({st.setup.timezone}).</p>
              </Card>
            </div>

            <Card title={`Inbox — waiting for you (${pending.length})`}>
              {pending.length ? (
                <div className="space-y-3">{pending.map((p) => <PostCard key={p.id} p={p} onAction={(a, x) => act(a, { id: p.id, ...x })} />)}</div>
              ) : (
                <p className="text-xs font-bold text-neutral-500">Nothing to review. New clips show up here {form.mode === "auto" ? "only in Approve-first mode" : "after Autopilot clips a video"}.</p>
              )}
            </Card>

            <Card title={`Scheduled (${scheduled.length})`}>
              {scheduled.length ? (
                <div className="space-y-3">{scheduled.map((p) => <PostCard key={p.id} p={p} onAction={(a, x) => act(a, { id: p.id, ...x })} />)}</div>
              ) : (
                <p className="text-xs font-bold text-neutral-500">No uploads scheduled.</p>
              )}
              {failed.length > 0 && (
                <div className="mt-4 space-y-3">
                  <p className="text-xs font-black uppercase">Failed uploads</p>
                  {failed.map((p) => <PostCard key={p.id} p={p} onAction={(a, x) => act(a, { id: p.id, ...x })} />)}
                </div>
              )}
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card title={`Posted (${posted.length})`}>
                {posted.length ? (
                  <ul className="space-y-2">
                    {posted.map((p) => (
                      <li key={p.id} className="text-xs font-bold flex items-center justify-between gap-2 border-b border-black/10 pb-2">
                        <span className="truncate">{p.title}</span>
                        <span className="flex items-center gap-2 shrink-0">
                          {p.youtubeStatus && <span className="neo-tag-white text-[9px]">{p.youtubeStatus}</span>}
                          <a href={`https://youtube.com/shorts/${p.youtubeId}`} target="_blank" rel="noreferrer" className="underline flex items-center gap-1">{when(p.postedAt)}<ExternalLink className="w-3 h-3" /></a>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs font-bold text-neutral-500">Nothing posted yet.</p>
                )}
              </Card>
              <Card title="Videos found">
                {st.items.length ? (
                  <ul className="space-y-2 max-h-96 overflow-auto pr-1">
                    {st.items.map((i) => (
                      <li key={i.id} className="text-xs border-b border-black/10 pb-2">
                        <div className="flex justify-between gap-2">
                          <a href={i.url} target="_blank" rel="noreferrer" className="font-black truncate underline">{i.title}</a>
                          <span className={`shrink-0 text-[9px] ${i.status === "failed" ? "neo-tag-orange" : i.status === "clipping" ? "neo-tag-yellow" : "neo-tag-white"}`}>{i.status}</span>
                        </div>
                        <div className="text-[11px] font-medium text-neutral-600">
                          {i.channel && `${i.channel} · `}{i.views ? `${i.views.toLocaleString()} views · ` : ""}{i.durationSec ? `${Math.round(i.durationSec / 60)} min · ` : ""}{i.reason}
                        </div>
                        {i.error && (
                          <div className="text-[11px] font-bold text-red-600 flex justify-between gap-2">
                            <span className="truncate">{i.error}</span>
                            <button onClick={() => act("retry", { id: i.id })} className="underline shrink-0">Retry</button>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs font-bold text-neutral-500">No videos yet. Add niches or channels below, then Find videos now.</p>
                )}
              </Card>
            </div>

            <Card
              title="What to clip"
              right={<button onClick={() => save()} disabled={!dirty || saving} className={`neo-btn-yellow px-4 py-2 rounded-lg text-xs font-black uppercase ${dirty ? "" : "opacity-50"}`}>{saving ? "Saving..." : dirty ? "Save settings" : "Saved"}</button>}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="Trending searches (one per line)" hint="e.g. kai cenat stream, valorant clutch, podcast argument">
                  <ListArea key={`niches-${formVersion}`} rows={4} value={form.niches} onChange={(v) => set({ niches: v })} />
                </Field>
                <Field label="Channels to follow" hint="Channel IDs (UC...) or channel links that contain the ID. New uploads are clipped.">
                  <ListArea key={`channels-${formVersion}`} rows={4} value={form.channels} onChange={(v) => set({ channels: v })} />
                </Field>
                <Field label="Only these creators (allowlist)" hint="Strongly recommended: creators who allow clipping. Empty = any channel.">
                  <ListArea key={`allowlist-${formVersion}`} rows={3} value={form.allowlist} onChange={(v) => set({ allowlist: v })} />
                </Field>
                <Field label="Never clip (blocked words)" hint="Skips videos whose title or channel contains these.">
                  <ListArea key={`blocklist-${formVersion}`} rows={3} value={form.blocklist} onChange={(v) => set({ blocklist: v })} />
                </Field>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                <Field label="Search every (h)"><input type="number" min={1} max={48} value={form.huntEveryHours} onChange={(e) => set({ huntEveryHours: Number(e.target.value) })} className="w-full neo-input py-1.5 px-2 text-sm" /></Field>
                <Field label="Videos per search"><input type="number" min={1} max={5} value={form.videosPerHunt} onChange={(e) => set({ videosPerHunt: Number(e.target.value) })} className="w-full neo-input py-1.5 px-2 text-sm" /></Field>
                <Field label="Max video age (h)"><input type="number" min={6} max={720} value={form.maxAgeHours} onChange={(e) => set({ maxAgeHours: Number(e.target.value) })} className="w-full neo-input py-1.5 px-2 text-sm" /></Field>
                <Field label="Max video length (min)" hint="Long streams take long to process"><input type="number" min={5} max={240} value={form.maxSourceMinutes} onChange={(e) => set({ maxSourceMinutes: Number(e.target.value) })} className="w-full neo-input py-1.5 px-2 text-sm" /></Field>
                <Field label="Clips per video"><input type="number" min={1} max={6} value={form.clipsPerVideo} onChange={(e) => set({ clipsPerVideo: Number(e.target.value) })} className="w-full neo-input py-1.5 px-2 text-sm" /></Field>
                <Field label="Min virality score"><input type="number" min={0} max={100} value={form.minScore} onChange={(e) => set({ minScore: Number(e.target.value) })} className="w-full neo-input py-1.5 px-2 text-sm" /></Field>
                <Field label="Max posts per day"><input type="number" min={1} max={20} value={form.dailyPostCap} onChange={(e) => set({ dailyPostCap: Number(e.target.value) })} className="w-full neo-input py-1.5 px-2 text-sm" /></Field>
                <Field label="Visibility">
                  <select value={form.privacy} onChange={(e) => set({ privacy: e.target.value })} className="w-full neo-input py-1.5 px-2 text-sm">
                    <option value="public">Public</option><option value="unlisted">Unlisted</option><option value="private">Private</option>
                  </select>
                </Field>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <Field label="Post times (HH:MM, one per line)" hint="Up to 'max posts per day' are used each day.">
                  <ListArea key={`postTimes-${formVersion}`} rows={3} value={form.postTimes} onChange={(v) => set({ postTimes: v })} />
                </Field>
                <Field label="Add to every description" hint="A credit line to the original video is always added.">
                  <textarea rows={3} value={form.descriptionFooter} onChange={(e) => set({ descriptionFooter: e.target.value })} className="w-full neo-input py-2 px-2 text-xs" />
                </Field>
              </div>
            </Card>

            <Card title="Clip recipe" right={<button onClick={copyDashboardStyle} className="neo-btn-white px-3 py-1.5 rounded-lg text-xs font-black uppercase">Copy my dashboard style</button>}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Field label="What makes a good clip (prompt)" hint="e.g. funniest reactions and arguments, 20-45s, must make sense alone">
                  <textarea rows={3} value={form.recipe.prompt} onChange={(e) => setRecipe({ prompt: e.target.value })} className="w-full neo-input py-2 px-2 text-xs" />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Caption style">
                    <select value={form.recipe.captionStyle} onChange={(e) => setRecipe({ captionStyle: e.target.value })} className="w-full neo-input py-1.5 px-2 text-sm">
                      {CAPTION_STYLES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </Field>
                  <Field label="Framing">
                    <select value={form.recipe.reframeMode} onChange={(e) => setRecipe({ reframeMode: e.target.value })} className="w-full neo-input py-1.5 px-2 text-sm">
                      <option value="auto-tracker">AI follow speaker</option><option value="split-screen">Split screen</option><option value="blurred-fit">Blurred fit</option><option value="center">Center crop</option>
                    </select>
                  </Field>
                  <Field label="Caption font">
                    <select value={form.recipe.captionFont} onChange={(e) => setRecipe({ captionFont: e.target.value })} className="w-full neo-input py-1.5 px-2 text-sm">
                      <option value="">Style default</option>
                      {CAPTION_FONT_OPTIONS.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </select>
                  </Field>
                  <div className="space-y-1 text-xs font-bold pt-4">
                    {([["removeSilences", "Cut pauses"], ["musicBed", "Music bed"], ["broll", "B-roll"], ["hookTitle", "Hook title"]] as const).map(([k, l]) => (
                      <label key={k} className="flex items-center gap-2"><input type="checkbox" checked={!!form.recipe[k]} onChange={(e) => setRecipe({ [k]: e.target.checked })} className="accent-black" />{l}</label>
                    ))}
                  </div>
                </div>
              </div>
              <button onClick={() => setShowStyle((v) => !v)} className="mt-4 neo-btn-white px-3 py-1.5 rounded-lg text-xs font-black uppercase">{showStyle ? "Hide" : "Show"} look & sound</button>
              {showStyle && (
                <div className="mt-4">
                  <StyleControls
                    style={style}
                    onChange={(patch) => setRecipe({ clipStyle: { ...style, ...patch } })}
                    font={form.recipe.captionFont || "default"}
                    onFont={(f) => setRecipe({ captionFont: f })}
                    onCaptionStyle={(c) => setRecipe({ captionStyle: c })}
                    musicOn={form.recipe.musicBed}
                    dense
                  />
                </div>
              )}
            </Card>

            <Card title="Activity">
              <ul className="space-y-1 max-h-80 overflow-auto text-[11px] font-mono">
                {st.log.map((l, i) => (
                  <li key={i} className={l.level === "error" ? "text-red-600" : l.level === "warn" ? "text-orange-700" : ""}>
                    <span className="text-neutral-500">{when(l.at)}</span> {l.msg}
                  </li>
                ))}
                {!st.log.length && <li className="text-neutral-500">Nothing yet.</li>}
              </ul>
            </Card>

            <p className="text-[11px] font-bold text-neutral-500">
              Clipping other people&apos;s videos without permission can get copyright strikes (3 strikes removes a channel). Use the allowlist for creators who allow clipping — Autopilot pauses itself if YouTube rejects an upload for copyright.
            </p>
          </>
        )}
      </main>
      <ApiSettingsModal isOpen={showKeys} onClose={() => { setShowKeys(false); void load(true); }} />
    </div>
  );
}
