/**
 * Drive the reminder back-off policy through the real database, on a throwaway account.
 *
 * The policy has thorough unit tests, but every one of them mocks the `db` barrel — so they
 * prove `decideReminder` reasons correctly about a delivery history handed to it, and prove
 * nothing about whether the tick assembles that history from real rows. The wiring in
 * between is where this feature has repeatedly gone wrong: the query that loads a user's
 * recent deliveries, the one that counts distinct active days since a pause, and the fact
 * that the tick only ever sees a user at all if the candidate query returns them.
 *
 * So this seeds a fake user, walks it through the rules a reader would meet over a month,
 * and asserts what the tick decides at each step. Everything runs `dryRun`, which computes
 * every decision but sends nothing and writes no pause — so the fake user's only footprint is
 * the rows created here, and they are deleted in a `finally`.
 *
 *   npm run push:rehearse                # dry run, prints what it would create
 *   npm run push:rehearse -- --apply     # seed, assert, clean up
 */
import 'dotenv/config';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import {
  and,
  db,
  eq,
  PushSubscriptions,
  ReadingEvents,
  ReminderDeliveries,
  UserMetadata,
} from '../db';
import { serializeReminderSettings, type ReminderSettings } from '@/utils/reminder-settings';
import { resolveOutcomes, runReminderTick } from '../utils/push-reminders';
import { requireDbTarget } from '../utils/require-db-target';

/** A Sunday at 08:00 America/Chicago, which is the schedule the fake user is given. */
const SUNDAY_8AM_UTC = '2026-09-06T13:00:00.000Z';
const TIMEZONE = 'America/Chicago';
const DAY_MS = 24 * 60 * 60 * 1000;

const BASE_SETTINGS: ReminderSettings = {
  cadence: 'twice-weekly',
  sunday: true,
  midweek: true,
  midweekDay: 3,
  hour: 8,
  pausedByPolicy: null,
};

type Outcome = 'clicked' | 'dismissed' | 'opened' | 'ignored' | null;

interface Scenario {
  name: string;
  /** Newest first, one week apart. */
  history: Outcome[];
  /** Which rhythm's history this is. Defaults to the twice-weekly Sunday. */
  kind?: 'sunday' | 'daily';
  variants?: string[];
  settings?: Partial<ReminderSettings>;
  /** Distinct days of reading activity to seed, for the re-arm rule. */
  activeDays?: number;
  expectReason: string;
  expectPaused?: number;
  expectRearmed?: number;
  expectVariant?: string | null;
}

const SCENARIOS: Scenario[] = [
  { name: 'no history at all', history: [], expectReason: 'ok' },
  { name: 'one ignored', history: ['ignored'], expectReason: 'ok' },
  {
    name: 'two ignored in a row halves the frequency',
    history: ['ignored', 'ignored'],
    expectReason: 'backoff-skip',
  },
  {
    name: 'three ignored resumes rather than stopping',
    history: ['ignored', 'ignored', 'ignored'],
    expectReason: 'ok',
  },
  {
    name: 'four ignored stops and records a pause',
    history: ['ignored', 'ignored', 'ignored', 'ignored'],
    expectReason: 'paused-by-policy',
    expectPaused: 1,
  },
  {
    name: 'one tap buys the schedule back',
    history: ['clicked', 'ignored', 'ignored', 'ignored', 'ignored'],
    expectReason: 'ok',
  },
  {
    name: 'an app opened without tapping counts as a yes',
    history: ['opened', 'ignored', 'ignored'],
    expectReason: 'ok',
  },
  {
    name: 'dismissals alone never pause',
    history: ['dismissed', 'dismissed', 'dismissed', 'dismissed'],
    expectReason: 'ok',
  },
  {
    name: 'a paused account re-arms after three days back',
    history: [],
    settings: { pausedByPolicy: { at: '2026-08-01T13:00:00.000Z', kind: 'all' } },
    activeDays: 3,
    expectReason: 'ok',
    expectRearmed: 1,
  },
  {
    name: 'a paused account stays paused after only two days back',
    history: [],
    settings: { pausedByPolicy: { at: '2026-08-01T13:00:00.000Z', kind: 'all' } },
    activeDays: 2,
    expectReason: 'paused-by-policy',
    expectRearmed: 0,
  },
  {
    name: 'daily: four ignored is a long weekend, not a verdict',
    kind: 'daily',
    settings: { cadence: 'daily' },
    history: ['ignored', 'ignored', 'ignored', 'ignored'],
    expectReason: 'ok',
    expectPaused: 0,
  },
  {
    name: 'daily: ten ignored is a fortnight, and stops',
    kind: 'daily',
    settings: { cadence: 'daily' },
    history: Array(10).fill('ignored') as Outcome[],
    expectReason: 'paused-by-policy',
    expectPaused: 1,
  },
  {
    name: 'daily: sends on a Sunday as one reminder, not two',
    kind: 'daily',
    settings: { cadence: 'daily' },
    history: [],
    expectReason: 'ok',
  },
  {
    name: 'the better-performing variant is preferred',
    history: ['clicked', 'clicked', 'opened', 'ignored', 'ignored', 'ignored'],
    variants: ['pickup', 'pickup', 'pickup', 'verse', 'verse', 'verse'],
    expectReason: 'ok',
    expectVariant: 'pickup',
  },
];

interface Failure {
  scenario: string;
  detail: string;
}

async function seed(userId: string, scenario: Scenario, now: Date): Promise<void> {
  const settings = { ...BASE_SETTINGS, ...(scenario.settings ?? {}) };
  await db.insert(UserMetadata).values({
    id: crypto.randomUUID(),
    userId,
    timezone: TIMEZONE,
    reminderSettings: serializeReminderSettings(settings),
    // Deliberately old: a user active in the last six hours is skipped before the policy is
    // ever consulted, which would make every scenario report the same thing.
    lastActiveAt: new Date(now.getTime() - 30 * DAY_MS),
    lastReminderSentOn: null,
    createdAt: new Date(),
  });

  // The candidate query requires a live subscription, so the user is invisible without one.
  await db.insert(PushSubscriptions).values({
    id: crypto.randomUUID(),
    userId,
    endpoint: `https://rehearsal.invalid/${crypto.randomUUID()}`,
    p256dh: 'rehearsal',
    auth: 'rehearsal',
    userAgent: 'rehearsal',
    createdAt: new Date(),
    failCount: 0,
  });

  const spacingDays = scenario.kind === 'daily' ? 1 : 7;
  for (const [index, outcome] of scenario.history.entries()) {
    const sentAt = new Date(now.getTime() - (index + 1) * spacingDays * DAY_MS);
    await db.insert(ReminderDeliveries).values({
      id: crypto.randomUUID(),
      userId,
      kind: scenario.kind ?? 'sunday',
      variant: scenario.variants?.[index] ?? 'verse',
      sentAt,
      localDate: sentAt.toISOString().slice(0, 10),
      localHour: 8,
      deviceCount: 1,
      outcome,
      outcomeAt: outcome ? sentAt : null,
      outcomeSource: outcome ? 'attribution' : null,
    });
  }

  // Distinct calendar days of reading, for the re-arm rule.
  for (let day = 0; day < (scenario.activeDays ?? 0); day += 1) {
    await db.insert(ReadingEvents).values({
      id: crypto.randomUUID(),
      userId,
      book: 'John',
      bookOrder: 42,
      chapter: 15,
      translation: 'NET',
      dwellBucket: 'read',
      // Days apart and well before the six-hour activity window, so they count as separate
      // days without making the user look like they were just here.
      createdAt: new Date(now.getTime() - (day + 2) * DAY_MS),
    });
  }
}

async function cleanUp(userId: string): Promise<void> {
  await db.delete(ReminderDeliveries).where(eq(ReminderDeliveries.userId, userId));
  await db.delete(PushSubscriptions).where(eq(PushSubscriptions.userId, userId));
  await db.delete(ReadingEvents).where(eq(ReadingEvents.userId, userId));
  await db.delete(UserMetadata).where(eq(UserMetadata.userId, userId));
}

async function runScenario(scenario: Scenario, now: Date): Promise<Failure[]> {
  const userId = `rehearsal_${crypto.randomUUID()}`;
  const failures: Failure[] = [];
  try {
    await seed(userId, scenario, now);
    const summary = await runReminderTick({ now, dryRun: true });
    const mine = summary.candidates.filter((c) => c.userId === userId);

    const reason = mine[0]?.reason ?? 'not-considered';
    if (reason !== scenario.expectReason) {
      failures.push({
        scenario: scenario.name,
        detail: `reason was "${reason}", expected "${scenario.expectReason}"`,
      });
    }
    if (scenario.expectPaused !== undefined && summary.paused !== scenario.expectPaused) {
      failures.push({
        scenario: scenario.name,
        detail: `paused was ${summary.paused}, expected ${scenario.expectPaused}`,
      });
    }
    if (scenario.expectRearmed !== undefined && summary.rearmed !== scenario.expectRearmed) {
      failures.push({
        scenario: scenario.name,
        detail: `rearmed was ${summary.rearmed}, expected ${scenario.expectRearmed}`,
      });
    }
    if (scenario.expectVariant !== undefined && mine[0]?.variant !== scenario.expectVariant) {
      failures.push({
        scenario: scenario.name,
        detail: `variant was ${String(mine[0]?.variant)}, expected ${String(scenario.expectVariant)}`,
      });
    }
    console.log(
      `  ${failures.length === 0 ? 'ok  ' : 'FAIL'} ${scenario.name} → ${reason}` +
        (mine[0]?.variant ? ` (variant ${mine[0].variant})` : ''),
    );
  } finally {
    await cleanUp(userId);
  }
  return failures;
}

/**
 * The attribution half, which decides whether an un-tapped reminder counted.
 *
 * Called directly rather than through the tick: `runReminderTick` only resolves outcomes on a
 * real run, and a real run would try to send to every genuinely due account.
 */
async function runAttribution(now: Date): Promise<Failure[]> {
  const userId = `rehearsal_${crypto.randomUUID()}`;
  const failures: Failure[] = [];
  try {
    // Opened the app an hour after a reminder, without tapping it.
    await db.insert(UserMetadata).values({
      id: crypto.randomUUID(),
      userId,
      timezone: TIMEZONE,
      lastActiveAt: new Date(now.getTime() - 6 * 60 * 60 * 1000),
      createdAt: new Date(),
    });
    const openedId = crypto.randomUUID();
    await db.insert(ReminderDeliveries).values({
      id: openedId,
      userId,
      kind: 'sunday',
      variant: 'verse',
      sentAt: new Date(now.getTime() - 7 * 60 * 60 * 1000),
      localDate: '2026-09-06',
      localHour: 8,
      deviceCount: 1,
      outcome: null,
    });
    // Sent over a day ago with nothing since.
    const ignoredId = crypto.randomUUID();
    await db.insert(ReminderDeliveries).values({
      id: ignoredId,
      userId,
      kind: 'sunday',
      variant: 'verse',
      sentAt: new Date(now.getTime() - 25 * 60 * 60 * 1000),
      localDate: '2026-08-30',
      localHour: 8,
      deviceCount: 1,
      outcome: null,
    });

    await resolveOutcomes(now);

    const rows = await db
      .select({ id: ReminderDeliveries.id, outcome: ReminderDeliveries.outcome })
      .from(ReminderDeliveries)
      .where(eq(ReminderDeliveries.userId, userId));
    const opened = rows.find((r) => r.id === openedId)?.outcome;
    const ignored = rows.find((r) => r.id === ignoredId)?.outcome;

    if (opened !== 'opened') {
      failures.push({
        scenario: 'attribution',
        detail: `app opened within the window should credit "opened", got ${String(opened)}`,
      });
    }
    if (ignored !== 'ignored') {
      failures.push({
        scenario: 'attribution',
        detail: `a day with no activity should record "ignored", got ${String(ignored)}`,
      });
    }
    console.log(
      `  ${failures.length === 0 ? 'ok  ' : 'FAIL'} attribution → opened=${String(opened)} ignored=${String(ignored)}`,
    );
  } finally {
    await cleanUp(userId);
  }
  return failures;
}

export async function runReminderPolicyRehearsal(argv: readonly string[]): Promise<void> {
  const apply = argv.includes('--apply');
  const now = new Date(SUNDAY_8AM_UTC);

  if (!apply) {
    console.log('[push:rehearse] DRY RUN; no database connection opened');
    console.log(`  would seed ${SCENARIOS.length + 1} throwaway accounts, one at a time,`);
    console.log('  assert what the tick decides for each, and delete every row it created.');
    console.log('[push:rehearse] re-run with --apply');
    return;
  }
  requireDbTarget({ scriptName: 'push:rehearse', writes: true, argv, env: process.env });

  console.log(`\n[push:rehearse] walking the policy at ${SUNDAY_8AM_UTC} (${TIMEZONE} Sunday 8am)\n`);
  const failures: Failure[] = [];
  for (const scenario of SCENARIOS) {
    failures.push(...(await runScenario(scenario, now)));
  }
  failures.push(...(await runAttribution(now)));

  console.log('');
  if (failures.length === 0) {
    console.log(`[push:rehearse] all ${SCENARIOS.length + 1} scenarios behaved as designed`);
    return;
  }
  for (const failure of failures) console.error(`[push:rehearse] ${failure.scenario}: ${failure.detail}`);
  throw new Error(`${failures.length} scenario(s) did not behave as designed`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runReminderPolicyRehearsal(process.argv.slice(2))
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('[push:rehearse] failed:', error instanceof Error ? error.message : error);
      process.exit(1);
    });
}
