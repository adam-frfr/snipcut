/**
 * Runs once when the Next.js server starts: schedules the hourly disk
 * cleanup (old clips, uploads, B-roll, crashed-render temp files) and the
 * Autopilot loop (every 5 minutes; it does nothing until switched on).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startCleanupTimer } = await import("./lib/cleanup");
    startCleanupTimer();
    const { startAutopilotTimer } = await import("./lib/autopilot/engine");
    startAutopilotTimer();
  }
}
