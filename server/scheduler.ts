/**
 * In-process daily jobs.
 *
 * On Netlify these were two separate scheduled functions declared in netlify.toml
 * (`purge-shared-spaces`, `audienceful-activity-sync`). A long-lived process runs
 * them itself, which also lifts the 25s Lambda time budgets both were written
 * around — see the timeBudgetMs override below.
 *
 * Jobs are fire-and-forget: a throw is logged and the schedule continues. Missing
 * a run is tolerable for both (@daily, both idempotent).
 */

import { runAudiencefulActivitySync } from './netlify-audienceful-activity-sync';
import { createPurgeSharedSpacesHandler } from './netlify-purge-shared-spaces';

/** Netlify ran both at 00:00 UTC (`schedule = "@daily"`). Keep that. */
const DAILY_UTC_HOUR = 0;

/** No Lambda ceiling here, so let the Clerk→Audienceful pagination finish. */
const AUDIENCEFUL_TIME_BUDGET_MS = 5 * 60_000;

type Job = { name: string; run: () => Promise<unknown> };

const JOBS: Job[] = [
  {
    name: 'purge-shared-spaces',
    run: createPurgeSharedSpacesHandler(),
  },
  {
    name: 'audienceful-activity-sync',
    run: () => runAudiencefulActivitySync({ timeBudgetMs: AUDIENCEFUL_TIME_BUDGET_MS }),
  },
];

function msUntilNextRun(now = new Date()): number {
  const next = new Date(now);
  next.setUTCHours(DAILY_UTC_HOUR, 0, 0, 0);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  return next.getTime() - now.getTime();
}

async function runAll(): Promise<void> {
  for (const job of JOBS) {
    const startedAt = Date.now();
    try {
      await job.run();
      console.log(`[scheduler] ${job.name} ok in ${Date.now() - startedAt}ms`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[scheduler] ${job.name} failed after ${Date.now() - startedAt}ms:`, message);
    }
  }
}

/**
 * Arm the daily timer. Returns a stop function for shutdown.
 *
 * Timers are unref'd so a pending wake-up never holds the process open during
 * a SIGTERM drain.
 */
export function startScheduler(): () => void {
  let timer: NodeJS.Timeout;
  let stopped = false;

  const arm = () => {
    if (stopped) return;
    const delay = msUntilNextRun();
    timer = setTimeout(() => {
      void runAll().finally(arm);
    }, delay);
    timer.unref();
    console.log(`[scheduler] next run in ${Math.round(delay / 60_000)}m`);
  };

  arm();

  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
