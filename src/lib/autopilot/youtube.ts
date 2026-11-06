import fs from "fs";
import path from "path";
import crypto from "crypto";
import { autopilotDir } from "./store";

/**
 * YouTube channel connection (Google OAuth) and uploads.
 * Server env: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET (a "Web application"
 * OAuth client whose redirect URI is <site>/api/autopilot/youtube/callback).
 * The refresh token lives in data/autopilot/youtube.json (never served).
 *
 * Note: until Google audits the Cloud project, YouTube locks videos that
 * the API uploads to private. They upload fine; make them public in
 * YouTube Studio (or get the project audited).
 */

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPES = ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube.readonly"];

interface Saved {
  refreshToken: string;
  channelId?: string;
  channelTitle?: string;
  connectedAt: number;
  redirectUri: string;
}

const FILE = () => path.join(autopilotDir(), "youtube.json");
const STATE_FILE = () => path.join(autopilotDir(), "oauth-state.json");

export const oauthConfigured = () => Boolean((process.env.GOOGLE_CLIENT_ID || "").trim() && (process.env.GOOGLE_CLIENT_SECRET || "").trim());

function readSaved(): Saved | null {
  try {
    const s = JSON.parse(fs.readFileSync(FILE(), "utf8"));
    return s?.refreshToken ? s : null;
  } catch {
    return null;
  }
}

export function youtubeConnection(): { connected: boolean; channelTitle?: string; channelId?: string; connectedAt?: number } {
  const s = readSaved();
  return s ? { connected: true, channelTitle: s.channelTitle, channelId: s.channelId, connectedAt: s.connectedAt } : { connected: false };
}

export function disconnectYoutube(): void {
  try { fs.unlinkSync(FILE()); } catch {}
  cachedAccess = null;
}

/** Consent URL; `state` is remembered for 15 minutes. */
export function authUrl(redirectUri: string): string {
  const state = crypto.randomBytes(16).toString("hex");
  fs.mkdirSync(path.dirname(STATE_FILE()), { recursive: true });
  fs.writeFileSync(STATE_FILE(), JSON.stringify({ state, redirectUri, at: Date.now() }));
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!.trim(),
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${AUTH_URL}?${p.toString()}`;
}

export async function finishAuth(code: string, state: string): Promise<{ channelTitle?: string }> {
  let saved: { state: string; redirectUri: string; at: number };
  try {
    saved = JSON.parse(fs.readFileSync(STATE_FILE(), "utf8"));
  } catch {
    throw new Error("Sign-in expired, start again.");
  }
  try { fs.unlinkSync(STATE_FILE()); } catch {}
  const a = Buffer.from(String(saved.state || ""));
  const b = Buffer.from(String(state || ""));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b) || Date.now() - saved.at > 15 * 60 * 1000) {
    throw new Error("Sign-in expired or didn't match, start again.");
  }
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!.trim(),
      client_secret: process.env.GOOGLE_CLIENT_SECRET!.trim(),
      redirect_uri: saved.redirectUri,
      grant_type: "authorization_code",
    }),
    signal: AbortSignal.timeout(15000),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok || !data.refresh_token) throw new Error(data.error_description || data.error || "Google didn't return a refresh token.");
  cachedAccess = { token: data.access_token, exp: Date.now() + (Number(data.expires_in || 3600) - 60) * 1000 };
  const rec: Saved = { refreshToken: data.refresh_token, connectedAt: Date.now(), redirectUri: saved.redirectUri };
  try {
    const ch = await ytFetch("https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true");
    const item = ch?.items?.[0];
    rec.channelId = item?.id;
    rec.channelTitle = item?.snippet?.title;
  } catch {}
  fs.mkdirSync(path.dirname(FILE()), { recursive: true });
  fs.writeFileSync(FILE(), JSON.stringify(rec), { mode: 0o600 });
  return { channelTitle: rec.channelTitle };
}

let cachedAccess: { token: string; exp: number } | null = null;

async function accessToken(): Promise<string> {
  if (cachedAccess && cachedAccess.exp > Date.now()) return cachedAccess.token;
  const s = readSaved();
  if (!s) throw new Error("YouTube is not connected.");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: s.refreshToken,
      client_id: (process.env.GOOGLE_CLIENT_ID || "").trim(),
      client_secret: (process.env.GOOGLE_CLIENT_SECRET || "").trim(),
      grant_type: "refresh_token",
    }),
    signal: AbortSignal.timeout(15000),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    if (data.error === "invalid_grant") throw new Error("YouTube access was revoked or expired: connect the channel again.");
    throw new Error(`YouTube sign-in failed: ${data.error_description || data.error || res.status}`);
  }
  cachedAccess = { token: data.access_token, exp: Date.now() + (Number(data.expires_in || 3600) - 60) * 1000 };
  return cachedAccess.token;
}

async function ytFetch(url: string, init: RequestInit = {}): Promise<any> {
  const token = await accessToken();
  const res = await fetch(url, {
    ...init,
    headers: { ...(init.headers as any), Authorization: `Bearer ${token}` },
    signal: init.signal || AbortSignal.timeout(20000),
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) {
    const reason = data?.error?.errors?.[0]?.reason || data?.error?.message || `HTTP ${res.status}`;
    const err: any = new Error(`YouTube: ${reason}`);
    err.reason = reason;
    err.status = res.status;
    throw err;
  }
  return data;
}

export interface UploadMeta {
  title: string;
  description: string;
  tags: string[];
  privacy: "public" | "unlisted" | "private";
}

/** Resumable upload; returns the new video id. */
export async function uploadVideo(filePath: string, meta: UploadMeta): Promise<string> {
  const token = await accessToken();
  const size = fs.statSync(filePath).size;
  const init = await fetch("https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": "video/mp4",
      "X-Upload-Content-Length": String(size),
    },
    body: JSON.stringify({
      snippet: {
        title: meta.title.slice(0, 100),
        description: meta.description.slice(0, 4900),
        tags: meta.tags.slice(0, 15),
        categoryId: "24", // Entertainment
      },
      status: { privacyStatus: meta.privacy, selfDeclaredMadeForKids: false },
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!init.ok) {
    const data: any = await init.json().catch(() => ({}));
    const reason = data?.error?.errors?.[0]?.reason || data?.error?.message || `HTTP ${init.status}`;
    const err: any = new Error(`YouTube: ${reason}`);
    err.reason = reason;
    err.status = init.status;
    throw err;
  }
  const loc = init.headers.get("location");
  if (!loc) throw new Error("YouTube didn't return an upload address.");
  const put = await fetch(loc, {
    method: "PUT",
    headers: { "Content-Type": "video/mp4", "Content-Length": String(size) },
    body: fs.readFileSync(filePath),
    signal: AbortSignal.timeout(15 * 60 * 1000),
  });
  const data: any = await put.json().catch(() => ({}));
  if (!put.ok || !data?.id) {
    const reason = data?.error?.errors?.[0]?.reason || data?.error?.message || `HTTP ${put.status}`;
    const err: any = new Error(`YouTube upload: ${reason}`);
    err.reason = reason;
    err.status = put.status;
    throw err;
  }
  return data.id as string;
}

/** Status of our uploads (claims / rejections / forced private). */
export async function videoStatuses(ids: string[]): Promise<Record<string, { uploadStatus?: string; rejectionReason?: string; privacyStatus?: string }>> {
  const out: Record<string, any> = {};
  for (let i = 0; i < ids.length; i += 50) {
    const data = await ytFetch(`https://www.googleapis.com/youtube/v3/videos?part=status&id=${ids.slice(i, i + 50).join(",")}`);
    for (const v of data.items || []) out[v.id] = v.status || {};
  }
  return out;
}
