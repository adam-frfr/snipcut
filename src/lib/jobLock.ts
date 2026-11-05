import fs from "fs";
import path from "path";

// -------------------------------------------------------------
// Job run lock. Next.js can evaluate this module more than once (one copy
// per route bundle, and dev workers are separate processes), so several
// queue instances may see the same waiting job. An exclusive lock file per
// job guarantees exactly one worker runs it; a lock whose owner process is
// gone (crash / restart) is stale and gets taken over.
// -------------------------------------------------------------
const JOBS_DIR = path.join(process.cwd(), "data", "jobs");
const lockPathFor = (jobId: string) => path.join(JOBS_DIR, `${jobId}.lock`);

function processAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e: any) {
    return e?.code === "EPERM";
  }
}

/** Claim the right to run a job; false = another live worker has it. */
export function acquireJobLock(jobId: string): boolean {
  fs.mkdirSync(JOBS_DIR, { recursive: true });
  const lockPath = lockPathFor(jobId);
  const owner = JSON.stringify({ pid: process.pid, at: Date.now() });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      fs.writeFileSync(lockPath, owner, { flag: "wx" });
      return true;
    } catch (e: any) {
      if (e?.code !== "EEXIST") return false;
      let held: { pid?: number; at?: number } | null = null;
      try {
        held = JSON.parse(fs.readFileSync(lockPath, "utf-8"));
      } catch {
        held = null;
      }
      if (!held) {
        // Unreadable = another worker created it a moment ago and hasn't
        // written its owner yet (seen in testing: treating that as stale let
        // two workers run one job). Only an old unreadable lock is stale.
        try {
          if (Date.now() - fs.statSync(lockPath).mtimeMs < 60_000) return false;
        } catch {
          continue;
        }
      } else {
        const stale = !processAlive(Number(held.pid)) || Date.now() - Number(held.at || 0) > 6 * 3600 * 1000;
        if (!stale) return false;
      }
      try { fs.unlinkSync(lockPath); } catch {}
    }
  }
  return false;
}

export function releaseJobLock(jobId: string) {
  try { fs.unlinkSync(lockPathFor(jobId)); } catch {}
}
