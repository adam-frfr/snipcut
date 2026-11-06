import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import type { ReadableStream as NodeReadableStream } from "stream/web";
import { verifyAuthAndRateLimit } from "@/lib/authRateLimit";
import { USER_FOOTAGE_DIR, probeDuration } from "@/lib/clipStyle";

/**
 * Your footage for the split layout (gameplay, satisfying clips...).
 * GET  -> { items: [{ id, name, duration }] }
 * POST raw video bytes (x-file-name header) -> { id, name, duration }
 * DELETE ?id=... -> { ok }
 */
const MAX_BYTES = 300 * 1024 * 1024;
const EXT = /\.(mp4|mov|webm|mkv)$/i;
const ID = /^[a-z0-9-]{1,60}\.(mp4|mov|webm|mkv)$/;
type Index = Record<string, { name: string; duration: number }>;
// Footage is kept until deleted, so cap how much can pile up on the disk.
const MAX_FILES = Math.max(1, Number(process.env.MAX_USER_FOOTAGE) || 20);
const storedCount = () => {
  try {
    return fs.readdirSync(/*turbopackIgnore: true*/ USER_FOOTAGE_DIR()).filter((f) => ID.test(f)).length;
  } catch {
    return 0;
  }
};

function readIndex(): Index {
  try {
    return JSON.parse(fs.readFileSync(path.join(/*turbopackIgnore: true*/ USER_FOOTAGE_DIR(), "index.json"), "utf8"));
  } catch {
    return {};
  }
}
function writeIndex(idx: Index) {
  fs.mkdirSync(USER_FOOTAGE_DIR(), { recursive: true });
  fs.writeFileSync(path.join(/*turbopackIgnore: true*/ USER_FOOTAGE_DIR(), "index.json"), JSON.stringify(idx, null, 1));
}

export async function GET(req: NextRequest) {
  const authError = verifyAuthAndRateLimit(req);
  if (authError) return authError;
  const idx = readIndex();
  const items = Object.entries(idx)
    .filter(([id]) => fs.existsSync(path.join(/*turbopackIgnore: true*/ USER_FOOTAGE_DIR(), id)))
    .map(([id, v]) => ({ id, name: v.name, duration: v.duration }));
  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const authError = verifyAuthAndRateLimit(req);
  if (authError) return authError;
  let name = "footage.mp4";
  try {
    name = decodeURIComponent(req.headers.get("x-file-name") || "") || name;
  } catch {}
  const ext = (EXT.exec(name)?.[1] || "").toLowerCase();
  if (!ext) return NextResponse.json({ error: "Upload an MP4, MOV, WebM or MKV video." }, { status: 415 });
  if (storedCount() >= MAX_FILES) {
    return NextResponse.json({ error: `You can keep up to ${MAX_FILES} footage files. Delete one to upload another.` }, { status: 409 });
  }
  if (Number(req.headers.get("content-length") || 0) > MAX_BYTES) {
    return NextResponse.json({ error: "Footage can be up to 300 MB." }, { status: 413 });
  }
  if (!req.body) return NextResponse.json({ error: "Empty file." }, { status: 400 });
  const id = `${crypto.randomBytes(5).toString("hex")}.${ext}`;
  fs.mkdirSync(USER_FOOTAGE_DIR(), { recursive: true });
  const file = path.join(/*turbopackIgnore: true*/ USER_FOOTAGE_DIR(), id);
  let bytes = 0;
  try {
    const counted = Readable.fromWeb(req.body as unknown as NodeReadableStream).on("data", (c: Buffer) => {
      bytes += c.length;
      if (bytes > MAX_BYTES) counted.destroy(new Error("too big"));
    });
    await pipeline(counted, fs.createWriteStream(file));
  } catch {
    try { fs.unlinkSync(file); } catch {}
    return NextResponse.json({ error: bytes > MAX_BYTES ? "Footage can be up to 300 MB." : "Upload failed — try again." }, { status: bytes > MAX_BYTES ? 413 : 400 });
  }
  const duration = await probeDuration(file);
  if (duration < 2) {
    try { fs.unlinkSync(file); } catch {}
    return NextResponse.json({ error: "That file doesn't look like a playable video (needs 2s+)." }, { status: 400 });
  }
  const clean = name.replace(/[^\w .()-]/g, "").slice(0, 60) || "My footage";
  const idx = readIndex();
  idx[id] = { name: clean, duration: Number(duration.toFixed(1)) };
  writeIndex(idx);
  return NextResponse.json({ id, name: clean, duration: idx[id].duration });
}

export async function DELETE(req: NextRequest) {
  const authError = verifyAuthAndRateLimit(req);
  if (authError) return authError;
  const id = req.nextUrl.searchParams.get("id") || "";
  if (!ID.test(id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });
  try { fs.unlinkSync(path.join(/*turbopackIgnore: true*/ USER_FOOTAGE_DIR(), id)); } catch {}
  const idx = readIndex();
  delete idx[id];
  writeIndex(idx);
  return NextResponse.json({ ok: true });
}
