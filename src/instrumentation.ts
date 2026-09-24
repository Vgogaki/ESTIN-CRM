/**
 * Runs once when the server process boots (Next.js instrumentation hook) —
 * the one place to start background work like pg-boss's scheduled jobs,
 * as opposed to per-request code. Guarded to the Node runtime since pg-boss
 * needs a real TCP connection to Postgres, which the edge runtime doesn't
 * support. Failures are logged, not thrown — a scheduled-job outage
 * shouldn't take the whole app down.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startScheduledJobs } = await import("@/server/jobs/boss");
    try {
      await startScheduledJobs();
    } catch (err) {
      console.error("[instrumentation] failed to start scheduled jobs", err);
    }
  }
}
