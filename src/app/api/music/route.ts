import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { verifyAuthAndRateLimit } from "@/lib/authRateLimit";
import { USER_MUSIC_DIR, probeDuration } from "@/lib/clipStyle";

/**
 * Your own music for clips.
 * GET  -> { tracks: [{ id, name, duration }] }
 * POST raw audio bytes (x-file-name header) -> { id, name, duration }
 * DELETE ?id=... -> { ok }
 */
const MAX_BYTES = 30 * 1024 * 1024;
const EXT = /\.(mp3|wav|m4a|aac|ogg)$/i;

function readIndex(): Record<string, { name: string; duration: number }> {
  try {
    return JSON.parse(fs.readFileSync(path.join(/*turbopackIgnore: true*/ USER_MUSIC_DIR(), "index.json"), "utf8"));
  } catch {
    return {};
  }
}
function writeIndex(idx: Record<string, { name: string; duration: number }>) {
  fs.mkdirSync(USER_MUSIC_DIR(), { recursive: true });
  fs.writeFileSync(path.join(/*turbopackIgnore: true*/ USER_MUSIC_DIR(), "index.json"), JSON.stringify(idx, null, 1));
}

export async function GET(req: NextRequest) {
  const authError = verifyAuthAndRateLimit(req);
  if (authError) return authError;
  const idx = readIndex();
  const tracks = Object.entries(idx)
    .filter(([id]) => fs.existsSync(path.join(/*turbopackIgnore: true*/ USER_MUSIC_DIR(), id)))
    .map(([id, v]) => ({ id, name: v.name, duration: v.duration }));
  return NextResponse.json({ tracks });
}

export async function POST(req: NextRequest) {
  const authError = verifyAuthAndRateLimit(req);
  if (authError) return authError;
  let name = "track.mp3";
  try {
    name = decodeURIComponent(req.headers.get("x-file-name") || "") || name;
  } catch {}
  const ext = (EXT.exec(name)?.[1] || "").toLowerCase();
  if (!ext) return NextResponse.json({ error: "Upload an MP3, WAV, M4A, AAC or OGG file." }, { status: 415 });
  if (Number(req.headers.get("content-length") || 0) > MAX_BYTES) {
    return NextResponse.json({ error: "Music files can be up to 30 MB." }, { status: 413 });
  }
  const buf = Buffer.from(await req.arrayBuffer());
  if (!buf.length) return NextResponse.json({ error: "Empty file." }, { status: 400 });
  if (buf.length > MAX_BYTES) return NextResponse.json({ error: "Music files can be up to 30 MB." }, { status: 413 });
  // Keep "120bpm" in the id so beat sync still works for the track.
  const bpm = /(\d{2,3})\s*bpm/i.exec(name)?.[1];
  const id = `${crypto.randomBytes(5).toString("hex")}${bpm ? `-${bpm}bpm` : ""}.${ext}`;
  fs.mkdirSync(USER_MUSIC_DIR(), { recursive: true });
  const file = path.join(/*turbopackIgnore: true*/ USER_MUSIC_DIR(), id);
  fs.writeFileSync(file, buf);
  const duration = await probeDuration(file);
  if (duration < 1) {
    try { fs.unlinkSync(file); } catch {}
    return NextResponse.json({ error: "That file doesn't look like playable audio." }, { status: 400 });
  }
  const clean = name.replace(/[^\w .()-]/g, "").slice(0, 60) || "My track";
  const idx = readIndex();
  idx[id] = { name: clean, duration: Number(duration.toFixed(1)) };
  writeIndex(idx);
  return NextResponse.json({ id, name: clean, duration: idx[id].duration });
}

export async function DELETE(req: NextRequest) {
  const authError = verifyAuthAndRateLimit(req);
  if (authError) return authError;
  const id = req.nextUrl.searchParams.get("id") || "";
  if (!/^[a-z0-9-]{1,60}\.(mp3|wav|m4a|aac|ogg)$/.test(id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });
  try { fs.unlinkSync(path.join(/*turbopackIgnore: true*/ USER_MUSIC_DIR(), id)); } catch {}
  const idx = readIndex();
  delete idx[id];
  writeIndex(idx);
  return NextResponse.json({ ok: true });
}
