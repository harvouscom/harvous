/**
 * The hourly reminder tick: who is due right now, in their own timezone, and what happened
 * to the reminders we already sent.
 *
 * Runs from `server/scheduler.ts` on the always-on Fly machine, and can be driven by hand
 * through `POST /api/push/run-reminders` (dry runs included) since dev never starts the
 * scheduler.
 *
 * Two things make this safe to run every hour on one machine:
 *
 *   1. Every send is claimed first. `UserMetadata.lastReminderSentOn` holds the user's own
 *      local calendar day, and the claim is a conditional UPDATE … RETURNING. A restart
 *      mid-tick, two overlapping ticks, or a repeated 1 AM on a DST fall-back all lose the
 *      race rather than sending twice.
 *   2. Timezone is read from the wall clock on each pass rather than computed once as an
 *      offset, so a zone that shifts between ticks is simply a zone whose hour changed.
 */
import crypto from 'node:crypto';
import {
  and,
  db,
  eq,
  gt,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  NoteVisitEvents,
  PushSubscriptions,
  ReadingEvents,
  ReminderDeliveries,
  sql,
  UserMetadata,
} from '../db';
import { now as dbNow } from '../db/dates';
import {
  parseReminderSettings,
  serializeReminderSettings,
  isReminderEnabled,
  type ReminderSettings,
} from '@/utils/reminder-settings';
import { buildReminderPayload, type ReminderVariant } from './reminder-payload';
import {
  decideReminder,
  shouldRearm,
  shouldWritePause,
  type DeliveryRecord,
  type ReminderPolicyKind,
  POLICY_WINDOW,
} from './reminder-policy';
import { isPushRemindersSchemaMissing } from './pg-undefined-relation';
import { isValidIanaTimeZone } from './votd-local-date';
import { isPushConfigured, sendToUser } from './web-push-client';

/** Someone who used the app this recently does not need to be told to come back. */
const RECENT_ACTIVITY_MS = 6 * 60 * 60 * 1000;
/** A reminder still unanswered after this long counts as ignored. */
const IGNORED_AFTER_MS = 24 * 60 * 60 * 1000;
/** An app open within this window of a send is credited to the reminder. */
const ATTRIBUTION_WINDOW_MS = 6 * 60 * 60 * 1000;
/** Chunk size for the `inArray` activity sweep — keeps one query from growing unbounded. */
const ID_CHUNK = 200;

export interface ReminderTickOptions {
  now?: Date;
  /** Report what would be sent and change nothing. Claims no days and writes no pauses. */
  dryRun?: boolean;
}

export interface ReminderTickCandidate {
  userId: string;
  kind: ReminderPolicyKind;
  localDate: string;
  localHour: number;
  reason: string;
  variant: ReminderVariant | null;
}

export interface ReminderTickSummary {
  /**
   * Why nothing ran. `unconfigured` = no VAPID keys on this deploy; `schema-missing` =
   * deployed ahead of `npm run push:schema:apply`. Two very different fixes, so they are
   * two different words — an operator reading a dry run should not have to guess which.
   */
  skipped?: 'unconfigured' | 'schema-missing';
  considered: number;
  due: number;
  sent: number;
  gone: number;
  failed: number;
  paused: number;
  rearmed: number;
  resolvedOpened: number;
  resolvedIgnored: number;
  dryRun: boolean;
  candidates: ReminderTickCandidate[];
}

interface LocalParts {
  hour: number;
  /** 0 = Sunday … 6 = Saturday, matching `Date.getDay()`. */
  weekday: number;
  localDate: string;
}

/**
 * The wall clock in a given zone. One formatter call rather than three, because a date that
 * straddles midnight must not be read from one call and its hour from another.
 */
export function localPartsFor(timeZone: string, at: Date): LocalParts {
  const zone = isValidIanaTimeZone(timeZone) ? timeZone : 'UTC';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
    weekday: 'short',
  }).formatToParts(at);

  const value = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const weekdayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  // `hour12: false` yields 24 for midnight in some ICU versions; normalize it.
  const hour = Number(value('hour')) % 24;

  return {
    hour: Number.isFinite(hour) ? hour : 0,
    weekday: weekdayMap[value('weekday')] ?? 0,
    localDate: `${value('year')}-${value('month')}-${value('day')}`,
  };
}

/**
 * Which kind, if any, is due at this local moment.
 *
 * The hour test allows the chosen hour *or the one after it*, so a deploy that lands during
 * the tick's minute does not silently drop that morning's reminders. The per-day claim keeps
 * the widened window from sending twice.
 */
export function dueKindFor(settings: ReminderSettings, parts: LocalParts): ReminderPolicyKind | null {
  const onSchedule = parts.hour === settings.hour || parts.hour === (settings.hour + 1) % 24;
  if (!onSchedule) return null;
  /*
   * The daily rhythm answers first and answers for every day, including Sunday.
   *
   * It is not combined with the two below, because the cadence is a choice between rhythms
   * rather than a set of switches — see `ReminderCadence`. Returning early is what makes a
   * Sunday produce one reminder instead of two without anything having to dedupe them.
   */
  if (settings.cadence === 'daily') return 'daily';
  if (parts.weekday === 0 && settings.sunday) return 'sunday';
  if (parts.weekday === settings.midweekDay && settings.midweek) return 'midweek';
  return null;
}

interface CandidateRow {
  userId: string;
  timezone: string | null;
  reminderSettings: string | null;
  lastActiveAt: Date | null;
  lastReminderSentOn: string | null;
}

/** Accounts that have a schedule, a timezone, and at least one live device. */
async function loadCandidates(): Promise<CandidateRow[]> {
  return db
    .select({
      userId: UserMetadata.userId,
      timezone: UserMetadata.timezone,
      reminderSettings: UserMetadata.reminderSettings,
      lastActiveAt: UserMetadata.lastActiveAt,
      lastReminderSentOn: UserMetadata.lastReminderSentOn,
    })
    .from(UserMetadata)
    .where(
      and(
        isNotNull(UserMetadata.reminderSettings),
        isNotNull(UserMetadata.timezone),
        sql`EXISTS (SELECT 1 FROM ${PushSubscriptions} WHERE ${PushSubscriptions.userId} = ${UserMetadata.userId})`,
      ),
    );
}

/** Users among `ids` who read a chapter or opened a note in the last six hours. */
async function recentlyActiveUserIds(ids: string[], since: Date): Promise<Set<string>> {
  const active = new Set<string>();
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const chunk = ids.slice(i, i + ID_CHUNK);
    if (chunk.length === 0) continue;
    const [reading, visits] = await Promise.all([
      db
        .selectDistinct({ userId: ReadingEvents.userId })
        .from(ReadingEvents)
        .where(and(inArray(ReadingEvents.userId, chunk), gt(ReadingEvents.createdAt, since))),
      db
        .selectDistinct({ userId: NoteVisitEvents.userId })
        .from(NoteVisitEvents)
        .where(and(inArray(NoteVisitEvents.userId, chunk), gt(NoteVisitEvents.createdAt, since))),
    ]);
    for (const row of reading) active.add(row.userId);
    for (const row of visits) active.add(row.userId);
  }
  return active;
}

/**
 * Settle every delivery still waiting on an answer.
 *
 * A banner that was never tapped is not automatically a failure: the reader may have seen
 * "Sunday's verse", put the phone down, and opened the app on the way to church. That counts,
 * and crediting it is what keeps the policy from pausing someone the reminders are working on.
 */
export async function resolveOutcomes(at: Date): Promise<{ opened: number; ignored: number }> {
  const attributionCutoff = new Date(at.getTime() - ATTRIBUTION_WINDOW_MS);
  const ignoredCutoff = new Date(at.getTime() - IGNORED_AFTER_MS);

  const open = await db
    .select({
      id: ReminderDeliveries.id,
      userId: ReminderDeliveries.userId,
      sentAt: ReminderDeliveries.sentAt,
    })
    .from(ReminderDeliveries)
    .where(and(isNull(ReminderDeliveries.outcome), lt(ReminderDeliveries.sentAt, attributionCutoff)));

  if (open.length === 0) return { opened: 0, ignored: 0 };

  const userIds = [...new Set(open.map((row) => row.userId))];
  const actives = new Map<string, Date>();
  for (let i = 0; i < userIds.length; i += ID_CHUNK) {
    const chunk = userIds.slice(i, i + ID_CHUNK);
    const rows = await db
      .select({ userId: UserMetadata.userId, lastActiveAt: UserMetadata.lastActiveAt })
      .from(UserMetadata)
      .where(inArray(UserMetadata.userId, chunk));
    for (const row of rows) if (row.lastActiveAt) actives.set(row.userId, row.lastActiveAt);
  }

  let opened = 0;
  let ignored = 0;
  for (const delivery of open) {
    const lastActive = actives.get(delivery.userId);
    const sentAt = delivery.sentAt.getTime();
    const wasOpened =
      !!lastActive &&
      lastActive.getTime() >= sentAt &&
      lastActive.getTime() - sentAt <= ATTRIBUTION_WINDOW_MS;

    if (wasOpened) {
      await db
        .update(ReminderDeliveries)
        .set({ outcome: 'opened', outcomeAt: lastActive!, outcomeSource: 'attribution' })
        .where(and(eq(ReminderDeliveries.id, delivery.id), isNull(ReminderDeliveries.outcome)));
      opened += 1;
      continue;
    }

    // Not opened — but only call it ignored once the full day has passed, so an evening
    // return still gets counted tomorrow.
    if (delivery.sentAt < ignoredCutoff) {
      await db
        .update(ReminderDeliveries)
        .set({ outcome: 'ignored', outcomeAt: at, outcomeSource: 'attribution' })
        .where(and(eq(ReminderDeliveries.id, delivery.id), isNull(ReminderDeliveries.outcome)));
      ignored += 1;
    }
  }

  return { opened, ignored };
}

/** The policy's view of one user: their recent deliveries, newest first. */
async function loadDeliveryWindow(userId: string): Promise<DeliveryRecord[]> {
  const rows = await db
    .select({
      kind: ReminderDeliveries.kind,
      variant: ReminderDeliveries.variant,
      outcome: ReminderDeliveries.outcome,
      sentAt: ReminderDeliveries.sentAt,
    })
    .from(ReminderDeliveries)
    .where(eq(ReminderDeliveries.userId, userId))
    .orderBy(sql`${ReminderDeliveries.sentAt} DESC`)
    .limit(POLICY_WINDOW * 2);
  return rows.map((row) => ({
    kind: row.kind,
    variant: row.variant,
    outcome: (row.outcome ?? null) as DeliveryRecord['outcome'],
    sentAt: row.sentAt,
  }));
}

/** Distinct local days the user has opened the app on since a pause was written. */
async function distinctActiveDaysSince(userId: string, since: Date, timeZone: string): Promise<number> {
  const rows = await db
    .selectDistinct({ createdAt: ReadingEvents.createdAt })
    .from(ReadingEvents)
    .where(and(eq(ReadingEvents.userId, userId), gte(ReadingEvents.createdAt, since)))
    .limit(64);
  const visits = await db
    .selectDistinct({ createdAt: NoteVisitEvents.createdAt })
    .from(NoteVisitEvents)
    .where(and(eq(NoteVisitEvents.userId, userId), gte(NoteVisitEvents.createdAt, since)))
    .limit(64);
  const days = new Set<string>();
  for (const row of [...rows, ...visits]) {
    days.add(localPartsFor(timeZone, row.createdAt).localDate);
  }
  return days.size;
}

async function writeReminderSettings(userId: string, settings: ReminderSettings): Promise<void> {
  await db
    .update(UserMetadata)
    .set({ reminderSettings: serializeReminderSettings(settings), updatedAt: dbNow() })
    .where(eq(UserMetadata.userId, userId));
}

/**
 * Claim today for this user. Returns false when someone (or some earlier tick) got there
 * first, which is the whole double-send guard.
 */
async function claimLocalDate(userId: string, localDate: string): Promise<boolean> {
  const claimed = await db
    .update(UserMetadata)
    .set({ lastReminderSentOn: localDate })
    .where(
      and(
        eq(UserMetadata.userId, userId),
        sql`${UserMetadata.lastReminderSentOn} IS DISTINCT FROM ${localDate}`,
      ),
    )
    .returning({ userId: UserMetadata.userId });
  return claimed.length > 0;
}

/** Record what went out, so the next tick can ask what became of it. */
async function recordDelivery(params: {
  userId: string;
  kind: ReminderPolicyKind | 'test';
  variant: ReminderVariant;
  sentAt: Date;
  localDate: string;
  localHour: number;
  deviceCount: number;
}): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(ReminderDeliveries).values({
    id,
    userId: params.userId,
    kind: params.kind,
    variant: params.variant,
    sentAt: params.sentAt,
    localDate: params.localDate,
    localHour: params.localHour,
    deviceCount: params.deviceCount,
    outcome: null,
    outcomeAt: null,
    outcomeSource: null,
  });
  return id;
}

/** Insert a delivery row for a test send, so the settings line can reflect it truthfully. */
export async function recordTestDelivery(params: {
  userId: string;
  variant: ReminderVariant;
  sentAt: Date;
  localDate: string;
  localHour: number;
  deviceCount: number;
}): Promise<string> {
  return recordDelivery({ ...params, kind: 'test' });
}

/**
 * One pass. Resolve what happened to old reminders, then send the ones now due.
 *
 * Order matters: resolving first means a reminder ignored last week is already counted when
 * this week's decision is made, so the back-off reacts a cycle sooner.
 */
export async function runReminderTick(
  { now = new Date(), dryRun = false }: ReminderTickOptions = {},
): Promise<ReminderTickSummary> {
  const summary: ReminderTickSummary = {
    considered: 0,
    due: 0,
    sent: 0,
    gone: 0,
    failed: 0,
    paused: 0,
    rearmed: 0,
    resolvedOpened: 0,
    resolvedIgnored: 0,
    dryRun,
    candidates: [],
  };

  if (!isPushConfigured()) {
    console.log('[push-reminders] skipped: VAPID keys are not configured');
    return { ...summary, skipped: 'unconfigured' };
  }

  if (!dryRun) {
    const resolved = await resolveOutcomes(now);
    summary.resolvedOpened = resolved.opened;
    summary.resolvedIgnored = resolved.ignored;
  }

  let candidates: CandidateRow[];
  try {
    candidates = await loadCandidates();
  } catch (error) {
    // Deployed ahead of `npm run push:schema:apply`. One line an hour, not a stack trace.
    if (isPushRemindersSchemaMissing(error)) {
      console.log('[push-reminders] skipped: push schema is not applied yet');
      return { ...summary, skipped: 'schema-missing' };
    }
    throw error;
  }
  summary.considered = candidates.length;

  interface DueEntry {
    row: CandidateRow;
    settings: ReminderSettings;
    kind: ReminderPolicyKind;
    parts: LocalParts;
  }
  const due: DueEntry[] = [];
  const activityCutoff = new Date(now.getTime() - RECENT_ACTIVITY_MS);

  for (const row of candidates) {
    const settings = parseReminderSettings(row.reminderSettings);
    if (!settings || !isReminderEnabled(settings)) continue;
    if (!row.timezone || !isValidIanaTimeZone(row.timezone)) continue;

    const parts = localPartsFor(row.timezone, now);
    const kind = dueKindFor(settings, parts);
    if (!kind) continue;
    if (row.lastReminderSentOn === parts.localDate) continue;
    if (row.lastActiveAt && row.lastActiveAt > activityCutoff) continue;

    due.push({ row, settings, kind, parts });
  }

  if (due.length === 0) return summary;

  // One batched sweep for the event-log half of "were they just here?" — the metadata stamp
  // above only knows about app opens, not about a reading session on another device.
  const active = await recentlyActiveUserIds(
    due.map((entry) => entry.row.userId),
    activityCutoff,
  );

  for (const entry of due) {
    if (active.has(entry.row.userId)) continue;
    summary.due += 1;

    const deliveries = await loadDeliveryWindow(entry.row.userId);
    let settings = entry.settings;

    // A paused account that has been coming back on its own earns the schedule again.
    if (settings.pausedByPolicy) {
      const pausedAt = new Date(settings.pausedByPolicy.at);
      const days = await distinctActiveDaysSince(
        entry.row.userId,
        pausedAt,
        entry.row.timezone ?? 'UTC',
      );
      if (shouldRearm(settings, days)) {
        settings = { ...settings, pausedByPolicy: null };
        if (!dryRun) await writeReminderSettings(entry.row.userId, settings);
        summary.rearmed += 1;
      }
    }

    const decision = decideReminder(settings, entry.kind, deliveries);

    if (!decision.send) {
      if (shouldWritePause(settings, entry.kind, deliveries)) {
        /*
         * Pause only the offending kind when another is still running, otherwise pause
         * everything — a reader with one rhythm left has nothing to be partially paused from.
         * Daily is always the whole of it, since choosing that cadence is the only switch.
         */
        const pausedKind =
          settings.cadence === 'daily' || !(settings.sunday && settings.midweek)
            ? 'all'
            : entry.kind;
        if (!dryRun) {
          await writeReminderSettings(entry.row.userId, {
            ...settings,
            pausedByPolicy: { at: now.toISOString(), kind: pausedKind },
          });
        }
        summary.paused += 1;
      }
      summary.candidates.push({
        userId: entry.row.userId,
        kind: entry.kind,
        localDate: entry.parts.localDate,
        localHour: entry.parts.hour,
        reason: decision.reason,
        variant: null,
      });
      console.log(
        `[push-reminders] skip user=${entry.row.userId} kind=${entry.kind} reason=${decision.reason}`,
      );
      continue;
    }

    if (dryRun) {
      summary.candidates.push({
        userId: entry.row.userId,
        kind: entry.kind,
        localDate: entry.parts.localDate,
        localHour: entry.parts.hour,
        reason: 'ok',
        variant: decision.variant,
      });
      continue;
    }

    // Claim before building anything: if the claim loses, nothing else should have happened.
    const claimed = await claimLocalDate(entry.row.userId, entry.parts.localDate);
    if (!claimed) continue;

    const built = await buildReminderPayload(entry.row.userId, {
      kind: entry.kind,
      now,
      preferVariant: decision.variant,
    });
    const deliveryId = await recordDelivery({
      userId: entry.row.userId,
      kind: entry.kind,
      variant: built.variant,
      sentAt: now,
      localDate: entry.parts.localDate,
      localHour: entry.parts.hour,
      deviceCount: 0,
    });
    built.payload.data.deliveryId = deliveryId;

    const result = await sendToUser(entry.row.userId, built.payload);
    summary.sent += result.sent;
    summary.gone += result.gone;
    summary.failed += result.failed;

    await db
      .update(ReminderDeliveries)
      .set({ deviceCount: result.sent })
      .where(eq(ReminderDeliveries.id, deliveryId));

    // Every device dead means the reminder reached nobody. Clearing the claim lets tomorrow
    // try again rather than recording a send that never happened.
    if (result.sent === 0) {
      await db
        .update(UserMetadata)
        .set({ lastReminderSentOn: entry.row.lastReminderSentOn })
        .where(eq(UserMetadata.userId, entry.row.userId));
      await db.delete(ReminderDeliveries).where(eq(ReminderDeliveries.id, deliveryId));
    }

    summary.candidates.push({
      userId: entry.row.userId,
      kind: entry.kind,
      localDate: entry.parts.localDate,
      localHour: entry.parts.hour,
      reason: 'ok',
      variant: built.variant,
    });
    console.log(
      `[push-reminders] user=${entry.row.userId} kind=${entry.kind} variant=${built.variant} ok=${result.sent} gone=${result.gone} failed=${result.failed}`,
    );
  }

  return summary;
}
