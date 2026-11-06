import fs from "fs";
import path from "path";

/**
 * Disk cleanup. Runs when the server starts, every hour after that, and
 * after each finished job — so old files go away even when nobody makes
 * new clips for a while (it used to run only after a job).
 *
 * Kept for FILE_RETENTION_HOURS (default 24h): uploads, YouTube downloads,
 * rendered clips (+ previews, posters, thumbnails), extracted audio,
 * B-roll images / videos, abandoned chunked uploads.
 * Kept for 3h: effect-pass temp files (subtitles, pre-pass, voiceover)
 * left behind by a crashed render.
 * Never deleted: job records, saved YouTube cookies, your uploaded music
 * and footage,
 * generated music / sound effects (small, reused).
 */

/** How long uploads, downloads and rendered clips are kept (FILE_RETENTION_HOURS, default 24h). */
export const retentionHours = () => Math.max(1, Number(process.env.FILE_RETENTION_HOURS) || 24);

const TEMP_HOURS = 3;
const HOUR = 3600 * 1000;

/** Deletes files (recursively) older than maxAgeMs; removes directories left empty. */
function sweep(dir: string, maxAgeMs: number, now: number, acc: { deletedFiles: number; freedBytes: number }, top = true): void {
  if (!fs.existsSync(dir)) return;
  let entries: string[] = [];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.startsWith(".")) continue; // .gitkeep etc.
    const full = path.join(dir, entry);
    try {
      const st = fs.statSync(full);
      if (st.isDirectory()) {
        sweep(full, maxAgeMs, now, acc, false);
      } else if (st.isFile() && now - st.mtimeMs > maxAgeMs) {
        acc.freedBytes += st.size;
        fs.unlinkSync(full);
        acc.deletedFiles++;
      }
    } catch {}
  }
  if (!top) {
    try {
      if (fs.readdirSync(dir).length === 0) fs.rmdirSync(dir);
    } catch {}
  }
}

export function cleanupExpiredFiles(hours = retentionHours()): { deletedFiles: number; freedBytes: number } {
  const now = Date.now();
  const maxAgeMs = hours * HOUR;
  const acc = { deletedFiles: 0, freedBytes: 0 };
  const cwd = process.cwd();

  for (const dir of [
    path.join(cwd, "public", "uploads"),
    path.join(cwd, "public", "rendered_clips"),
    path.join(cwd, "public", "downloads"),
    path.join(cwd, "data", "audio"),
    path.join(cwd, "data", "broll"),
  ]) {
    sweep(dir, maxAgeMs, now, acc);
  }

  // Abandoned chunked-upload dirs (per-upload subdirectories of .part files)
  const chunkRoot = path.join(cwd, "data", "chunk-uploads");
  if (fs.existsSync(chunkRoot)) {
    try {
      for (const entry of fs.readdirSync(chunkRoot)) {
        const full = path.join(chunkRoot, entry);
        try {
          const st = fs.statSync(full);
          if (st.isDirectory() && now - st.mtimeMs > maxAgeMs) {
            fs.rmSync(full, { recursive: true, force: true });
            acc.deletedFiles++;
          }
        } catch {}
      }
    } catch {}
  }

  // Temp files a crashed render left behind (a render takes minutes, not hours).
  const tempAge = Math.min(maxAgeMs, TEMP_HOURS * HOUR);
  sweep(path.join(cwd, "data", "postfx"), tempAge, now, acc);
  sweep(path.join(cwd, "data", "voiceover"), tempAge, now, acc);

  if (acc.deletedFiles > 0) {
    console.log(
      `[Stage: Cleanup] Deleted ${acc.deletedFiles} files older than ${hours}h, freeing ${(acc.freedBytes / (1024 * 1024)).toFixed(2)} MB`
    );
  }
  return acc;
}

/** Starts the hourly cleanup (once per server process). */
export function startCleanupTimer(): void {
  const g = globalThis as unknown as { __snipcutCleanupTimer?: boolean };
  if (g.__snipcutCleanupTimer) return;
  g.__snipcutCleanupTimer = true;
  const run = () => {
    try {
      cleanupExpiredFiles();
    } catch (e) {
      console.warn("[Stage: Cleanup] failed:", e);
    }
  };
  // First pass shortly after start (not during boot), then hourly.
  setTimeout(run, 60 * 1000).unref?.();
  setInterval(run, HOUR).unref?.();
}
