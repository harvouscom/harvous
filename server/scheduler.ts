/**
 * In-process scheduled jobs — a daily set and an hourly one.
 *
 * On Netlify the daily pair were separate scheduled functions declared in netlify.toml
 * (`purge-shared-spaces`, `audienceful-activity-sync`). A long-lived process runs
 * them itself, which also lifts the 25s Lambda time budgets both were written
 * around — see the timeBudgetMs override below.
 *
 * Jobs are fire-and-forget: a throw is logged and the schedule continues. Missing
 * a run is tolerable for all of them (all idempotent).
 *
 * The hourly timer exists for reminders, which are due at an hour the *user* chose in a
 * timezone the server does not share — so there is no single UTC hour to fire at. It is a
 * separate timer rather than an hourly loop that occasionally runs the daily jobs: those two
 * cadences have nothing to do with each other, and folding them together would mean every
 * future daily job inheriting a reason to think about hours.
 */

import { runAudiencefulActivitySync } from './netlify-audienceful-activity-sync';
import { createPurgeSharedSpacesHandler } from './netlify-purge-shared-spaces';
import { runReminderTick } from './utils/push-reminders';

/** Netlify ran both at 00:00 UTC (`schedule = "@daily"`). Keep that. */
const DAILY_UTC_HOUR = 0;

/**
 * Minutes past the hour for the hourly run.
 *
 * Not :00 — that is when the daily jobs fire at midnight UTC, and the Audienceful sync can
 * hold the process for minutes. Five past keeps reminders out from behind it, and the tick's
 * one-hour late window (see `dueKindFor`) means the offset costs nobody their reminder.
 */
const HOURLY_MINUTE = 5;

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

const HOURLY_JOBS: Job[] = [
  {
    name: 'push-reminders',
    run: () => runReminderTick(),
  },
];

export function msUntilNextRun(now = new Date()): number {
  const next = new Date(now);
  next.setUTCHours(DAILY_UTC_HOUR, 0, 0, 0);
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  return next.getTime() - now.getTime();
}

export function msUntilNextHourlyRun(now = new Date()): number {
  const next = new Date(now);
  next.setUTCMinutes(HOURLY_MINUTE, 0, 0);
  if (next <= now) next.setUTCHours(next.getUTCHours() + 1);
  return next.getTime() - now.getTime();
}

async function runJobs(jobs: readonly Job[]): Promise<void> {
  for (const job of jobs) {
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

async function runAll(): Promise<void> {
  await runJobs(JOBS);
}

async function runHourly(): Promise<void> {
  await runJobs(HOURLY_JOBS);
}

/**
 * Arm the daily and hourly timers. Returns a stop function for shutdown.
 *
 * Timers are unref'd so a pending wake-up never holds the process open during
 * a SIGTERM drain.
 */
export function startScheduler(): () => void {
  let dailyTimer: NodeJS.Timeout;
  let hourlyTimer: NodeJS.Timeout;
  let stopped = false;

  const armDaily = () => {
    if (stopped) return;
    const delay = msUntilNextRun();
    dailyTimer = setTimeout(() => {
      void runAll().finally(armDaily);
    }, delay);
    dailyTimer.unref();
    console.log(`[scheduler] next run in ${Math.round(delay / 60_000)}m`);
  };

  const armHourly = () => {
    if (stopped) return;
    const delay = msUntilNextHourlyRun();
    hourlyTimer = setTimeout(() => {
      void runHourly().finally(armHourly);
    }, delay);
    hourlyTimer.unref();
    console.log(`[scheduler] next hourly run in ${Math.round(delay / 60_000)}m`);
  };

  armDaily();
  armHourly();

  return () => {
    stopped = true;
    clearTimeout(dailyTimer);
    clearTimeout(hourlyTimer);
  };
}
