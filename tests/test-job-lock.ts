/**
 * One job, one worker. Next.js can load the job queue more than once, and
 * every copy re-queues waiting jobs on startup — before the lock, a single
 * YouTube job was downloaded and rendered by 2-4 workers at once.
 */
import fs from "node:fs";
import path from "node:path";
import { acquireJobLock, releaseJobLock } from "../src/lib/jobLock";

let failures = 0;
const check = (ok: boolean, msg: string) => {
  console.log(`${ok ? "-> PASS" : "-> FAIL"}: ${msg}`);
  if (!ok) failures++;
};
const id = `job_locktest_${process.pid}`;
const lockPath = path.join(process.cwd(), "data", "jobs", `${id}.lock`);

releaseJobLock(id);
check(acquireJobLock(id), "first worker gets the job");
check(!acquireJobLock(id), "a second worker is refused while the first runs");
releaseJobLock(id);
check(acquireJobLock(id), "after release the job can run again (retry)");
releaseJobLock(id);

// Owner process gone (server crashed / restarted): lock is stale.
fs.writeFileSync(lockPath, JSON.stringify({ pid: 999999, at: Date.now() }));
check(acquireJobLock(id), "a lock left by a dead process is taken over");
releaseJobLock(id);

// Created a moment ago but owner not written yet: NOT stale (the race seen in testing).
fs.writeFileSync(lockPath, "");
check(!acquireJobLock(id), "a just-created, still-empty lock is respected");
const old = new Date(Date.now() - 5 * 60 * 1000);
fs.utimesSync(lockPath, old, old);
check(acquireJobLock(id), "an old unreadable lock is treated as stale");
releaseJobLock(id);
check(!fs.existsSync(lockPath), "release removes the lock file");

if (failures) {
  console.error(`\nJOB LOCK FAILURES: ${failures}`);
  process.exit(1);
}
console.log("\nALL JOB LOCK TESTS PASSED!");
