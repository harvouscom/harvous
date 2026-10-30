/**
 * "Which service do you go to?" — a congregant's one primary service time.
 *
 * Where the times come from:
 *   - **A church on Harvous:** its own `ChurchServiceTimes`. Staff own them.
 *   - **A church only in the directory:** Here's My Church's listing (`/v1/churches/:id/profile`),
 *     read live. When that church later registers, its times are seeded from the same listing,
 *     so a choice made against the directory still lines up — the reason a choice is day + time
 *     rather than a row id (schema.ts, `ChurchServiceChoices`).
 *
 * What a choice drives: the This Sunday card shows that service only; the Sunday church push
 * stays quiet through it; staff see how many people chose each service (small groups
 * suppressed); and the ministry rows lead with what meets during it. Nothing is ever followed
 * on the person's behalf.
 *
 * The tables may not exist yet (the code ships ahead of `npm run church-pilot:schema:apply`):
 * every read treats a missing table as "nothing chosen".
 */
import {
  db,
  first,
  and,
  eq,
  isNotNull,
  or,
  sql,
  ChurchServiceChoices,
  ChurchServiceTimeSpaces,
  ChurchServiceTimes,
  Churches,
  UserMetadata,
} from '../db';
import { isPgUndefinedRelation } from './pg-undefined-relation';
import { hmcGetChurchProfile, isHmcConfigured } from './hmc-partner';
import { SERVICE_TIME_PATTERN } from './church-service-time';

export type ServiceSlot = {
  dayOfWeek: number;
  /** 'HH:MM' 24h, church wall clock. */
  startTime: string;
  label: string | null;
  /** `ChurchServiceTimes.id` — only for a church on Harvous. */
  serviceTimeId: string | null;
};

export type ServiceSlotSource = 'church' | 'directory' | 'none';

export type ServiceChoiceViewer = {
  connectedChurchId: string | null;
  hmcChurchId: string | null;
};

export type ServiceChoiceRow = typeof ChurchServiceChoices.$inferSelect;

export const slotKey = (slot: { dayOfWeek: number; startTime: string }) => `${slot.dayOfWeek}@${slot.startTime}`;

/** Pure: is this a well-formed day + time? */
export function isValidSlotInput(raw: unknown): raw is { dayOfWeek: number; startTime: string } {
  if (!raw || typeof raw !== 'object') return false;
  const { dayOfWeek, startTime } = raw as Record<string, unknown>;
  return (
    typeof dayOfWeek === 'number' &&
    Number.isInteger(dayOfWeek) &&
    dayOfWeek >= 0 &&
    dayOfWeek <= 6 &&
    typeof startTime === 'string' &&
    SERVICE_TIME_PATTERN.test(startTime)
  );
}

/**
 * Pure: does a stored choice still belong to the church this person is at now?
 *
 * Either identity may carry it. A choice made from the directory (hmc id only) holds once the
 * church registers and the person is connected; a choice made at a registered church holds even
 * if the directory link was cleared (an upstream merge). A different church on both counts is
 * someone who moved churches, and their old Sunday means nothing at the new one.
 */
export function choiceBelongsToViewer(
  choice: Pick<ServiceChoiceRow, 'churchId' | 'hmcChurchId'> | null | undefined,
  viewer: ServiceChoiceViewer,
): boolean {
  if (!choice) return false;
  if (choice.churchId && viewer.connectedChurchId && choice.churchId === viewer.connectedChurchId) return true;
  if (choice.hmcChurchId && viewer.hmcChurchId && choice.hmcChurchId === viewer.hmcChurchId) return true;
  return false;
}

/**
 * Pure: the slot a choice names among the church's current times, or null — a service the church
 * no longer holds is no choice at all, and the person is asked again.
 */
export function resolveChoiceSlot(
  choice: Pick<ServiceChoiceRow, 'dayOfWeek' | 'startTime'> | null | undefined,
  slots: readonly ServiceSlot[],
): ServiceSlot | null {
  if (!choice) return null;
  const key = slotKey(choice);
  return slots.find((slot) => slotKey(slot) === key) ?? null;
}

/** Fewer than this many people at a service is reported as "a few", never a number. */
export const SERVICE_HEADCOUNT_MIN = 3;

/** Pure: per-service counts with small groups suppressed. Zero is not a group, so it stays 0. */
export function suppressSmallCounts<T extends { count: number }>(
  rows: readonly T[],
): Array<Omit<T, 'count'> & { count: number | null }> {
  return rows.map((row) => ({
    ...row,
    count: row.count > 0 && row.count < SERVICE_HEADCOUNT_MIN ? null : row.count,
  }));
}

// ─── Reads ───────────────────────────────────────────────────────────────────

/** Directory profiles barely change; a person opening Settings twice should not ask HMC twice. */
const DIRECTORY_CACHE_MS = 10 * 60_000;
const directoryCache = new Map<string, { at: number; slots: ServiceSlot[] }>();

async function directorySlots(hmcChurchId: string): Promise<ServiceSlot[]> {
  const cached = directoryCache.get(hmcChurchId);
  if (cached && Date.now() - cached.at < DIRECTORY_CACHE_MS) return cached.slots;
  if (!isHmcConfigured()) return [];
  let slots: ServiceSlot[] = [];
  try {
    const profile = await hmcGetChurchProfile(hmcChurchId);
    slots = (profile?.serviceTimes?.slots ?? []).map((slot) => ({ ...slot, serviceTimeId: null }));
  } catch (error) {
    // The directory being down is not the person's problem: no times, no picker, try later.
    console.warn('[church-service-choice] directory profile failed', error instanceof Error ? error.message : error);
    return cached?.slots ?? [];
  }
  directoryCache.set(hmcChurchId, { at: Date.now(), slots });
  return slots;
}

/** The church's own times, as slots. */
export async function churchSlots(churchId: string): Promise<ServiceSlot[]> {
  const rows = await db
    .select({
      id: ChurchServiceTimes.id,
      dayOfWeek: ChurchServiceTimes.dayOfWeek,
      startTime: ChurchServiceTimes.startTime,
      label: ChurchServiceTimes.label,
    })
    .from(ChurchServiceTimes)
    .where(eq(ChurchServiceTimes.churchId, churchId));
  return rows
    .map((row) => ({ dayOfWeek: row.dayOfWeek, startTime: row.startTime, label: row.label, serviceTimeId: row.id }))
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime));
}

/**
 * The times this person can choose from, and where they came from. A registered church with no
 * times entered yet falls back to the directory's, so a church mid-setup still offers something.
 */
export async function serviceSlotsForViewer(
  viewer: ServiceChoiceViewer,
): Promise<{ source: ServiceSlotSource; slots: ServiceSlot[] }> {
  if (viewer.connectedChurchId) {
    const own = await churchSlots(viewer.connectedChurchId);
    if (own.length) return { source: 'church', slots: own };
  }
  if (viewer.hmcChurchId) {
    const fromDirectory = await directorySlots(viewer.hmcChurchId);
    if (fromDirectory.length) return { source: 'directory', slots: fromDirectory };
  }
  return { source: 'none', slots: [] };
}

export async function loadServiceChoiceViewer(userId: string): Promise<ServiceChoiceViewer> {
  const meta = first(
    await db
      .select({ connectedChurchId: UserMetadata.connectedChurchId, hmcChurchId: UserMetadata.hmcChurchId })
      .from(UserMetadata)
      .where(eq(UserMetadata.userId, userId))
      .limit(1),
  );
  return { connectedChurchId: meta?.connectedChurchId ?? null, hmcChurchId: meta?.hmcChurchId ?? null };
}

/** The stored row, or null — including when the table does not exist yet. */
export async function getServiceChoiceRow(userId: string): Promise<ServiceChoiceRow | null> {
  try {
    return (
      first(await db.select().from(ChurchServiceChoices).where(eq(ChurchServiceChoices.userId, userId)).limit(1)) ??
      null
    );
  } catch (error) {
    if (isPgUndefinedRelation(error, 'ChurchServiceChoices')) return null;
    throw error;
  }
}

/**
 * The person's chosen service at their current church, resolved against its current times, or
 * null. One call for every consumer (This Sunday, push, the picker), so they never disagree.
 */
export async function resolveViewerServiceChoice(
  userId: string,
  viewer?: ServiceChoiceViewer,
): Promise<{ slot: ServiceSlot | null; stale: boolean }> {
  const row = await getServiceChoiceRow(userId);
  if (!row) return { slot: null, stale: false };
  const who = viewer ?? (await loadServiceChoiceViewer(userId));
  if (!choiceBelongsToViewer(row, who)) return { slot: null, stale: false };
  const { slots } = await serviceSlotsForViewer(who);
  const slot = resolveChoiceSlot(row, slots);
  return { slot, stale: !slot };
}

// ─── Writes ──────────────────────────────────────────────────────────────────

export type SetChoiceResult =
  | { ok: true; slot: ServiceSlot }
  | { ok: false; status: 400 | 404 | 409 | 503; code: string; error: string };

/** Choose a service. Validated against the times this person is offered right now. */
export async function setServiceChoice(
  userId: string,
  input: { dayOfWeek: number; startTime: string },
  now: Date = new Date(),
): Promise<SetChoiceResult> {
  const viewer = await loadServiceChoiceViewer(userId);
  if (!viewer.connectedChurchId && !viewer.hmcChurchId) {
    return { ok: false, status: 409, code: 'CHURCH_REQUIRED', error: 'Add your church first' };
  }
  const { slots } = await serviceSlotsForViewer(viewer);
  const slot = resolveChoiceSlot(input, slots);
  if (!slot) {
    return { ok: false, status: 404, code: 'SERVICE_TIME_NOT_FOUND', error: 'That service isn’t listed for your church' };
  }
  try {
    await db
      .insert(ChurchServiceChoices)
      .values({
        userId,
        churchId: viewer.connectedChurchId,
        hmcChurchId: viewer.hmcChurchId,
        dayOfWeek: slot.dayOfWeek,
        startTime: slot.startTime,
        createdAt: now,
      })
      .onConflictDoUpdate({
        target: ChurchServiceChoices.userId,
        set: {
          churchId: viewer.connectedChurchId,
          hmcChurchId: viewer.hmcChurchId,
          dayOfWeek: slot.dayOfWeek,
          startTime: slot.startTime,
          updatedAt: now,
        },
      });
  } catch (error) {
    if (isPgUndefinedRelation(error, 'ChurchServiceChoices')) {
      return { ok: false, status: 503, code: 'SERVICE_CHOICE_UNAVAILABLE', error: 'Choosing a service isn’t available yet' };
    }
    throw error;
  }
  return { ok: true, slot };
}

/** Forget the choice. Harmless when there is none, or no table yet. */
export async function clearServiceChoice(userId: string): Promise<void> {
  try {
    await db.delete(ChurchServiceChoices).where(eq(ChurchServiceChoices.userId, userId));
  } catch (error) {
    if (!isPgUndefinedRelation(error, 'ChurchServiceChoices')) throw error;
  }
}

// ─── What meets during a service ─────────────────────────────────────────────

/** Space ids tagged as meeting during each of a church's service times. */
export async function spacesByServiceTime(churchId: string): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  try {
    const rows = await db
      .select({ serviceTimeId: ChurchServiceTimeSpaces.serviceTimeId, spaceId: ChurchServiceTimeSpaces.spaceId })
      .from(ChurchServiceTimeSpaces)
      .where(eq(ChurchServiceTimeSpaces.churchId, churchId));
    for (const row of rows) out.set(row.serviceTimeId, [...(out.get(row.serviceTimeId) ?? []), row.spaceId]);
  } catch (error) {
    if (!isPgUndefinedRelation(error, 'ChurchServiceTimeSpaces')) throw error;
  }
  return out;
}

/** Tag or untag a space as meeting during a service. Caller has proven staff + the space is the church's. */
export async function setServiceTimeSpace(input: {
  churchId: string;
  serviceTimeId: string;
  spaceId: string;
  on: boolean;
  actorUserId: string;
  now?: Date;
}): Promise<void> {
  if (!input.on) {
    await db
      .delete(ChurchServiceTimeSpaces)
      .where(
        and(
          eq(ChurchServiceTimeSpaces.serviceTimeId, input.serviceTimeId),
          eq(ChurchServiceTimeSpaces.spaceId, input.spaceId),
        ),
      );
    return;
  }
  await db
    .insert(ChurchServiceTimeSpaces)
    .values({
      id: `csts_${crypto.randomUUID()}`,
      churchId: input.churchId,
      serviceTimeId: input.serviceTimeId,
      spaceId: input.spaceId,
      createdByUserId: input.actorUserId,
      createdAt: input.now ?? new Date(),
    })
    .onConflictDoNothing();
}

/** Drop every tag on a service time — called when the time itself is deleted. */
export async function clearServiceTimeSpaces(serviceTimeId: string): Promise<void> {
  try {
    await db.delete(ChurchServiceTimeSpaces).where(eq(ChurchServiceTimeSpaces.serviceTimeId, serviceTimeId));
  } catch (error) {
    if (!isPgUndefinedRelation(error, 'ChurchServiceTimeSpaces')) throw error;
  }
}

// ─── Staff view: how many at each service ────────────────────────────────────

/**
 * How many connected congregants chose each of the church's services. Counts only, never who,
 * and fewer than {@link SERVICE_HEADCOUNT_MIN} reads as null — at a small church "2 at the
 * evening service" names people.
 */
export async function serviceHeadcount(
  church: Pick<typeof Churches.$inferSelect, 'id'>,
): Promise<Array<{ dayOfWeek: number; startTime: string; label: string | null; count: number | null }>> {
  const slots = await churchSlots(church.id);
  if (!slots.length) return [];
  let counts = new Map<string, number>();
  try {
    const rows = await db
      .select({
        dayOfWeek: ChurchServiceChoices.dayOfWeek,
        startTime: ChurchServiceChoices.startTime,
        count: sql<number>`count(*)::int`,
      })
      .from(ChurchServiceChoices)
      .innerJoin(UserMetadata, eq(UserMetadata.userId, ChurchServiceChoices.userId))
      .where(
        and(
          eq(UserMetadata.connectedChurchId, church.id),
          // The choice must have been made for this church (choiceBelongsToViewer, in SQL) — someone
          // who moved here from a church that also had a 9:00 has not chosen this one's.
          or(
            eq(ChurchServiceChoices.churchId, church.id),
            and(isNotNull(ChurchServiceChoices.hmcChurchId), eq(ChurchServiceChoices.hmcChurchId, UserMetadata.hmcChurchId)),
          ),
        ),
      )
      .groupBy(ChurchServiceChoices.dayOfWeek, ChurchServiceChoices.startTime);
    counts = new Map(rows.map((row) => [slotKey(row), Number(row.count)]));
  } catch (error) {
    if (!isPgUndefinedRelation(error, 'ChurchServiceChoices')) throw error;
  }
  return suppressSmallCounts(
    slots.map((slot) => ({
      dayOfWeek: slot.dayOfWeek,
      startTime: slot.startTime,
      label: slot.label,
      count: counts.get(slotKey(slot)) ?? 0,
    })),
  );
}

/** Seed a newly registered church's times from its directory listing. Skips any already there. */
export async function seedServiceTimesFromDirectory(
  churchId: string,
  slots: readonly { dayOfWeek: number; startTime: string; label: string | null }[],
  now: Date = new Date(),
): Promise<number> {
  if (!slots.length) return 0;
  const inserted = await db
    .insert(ChurchServiceTimes)
    .values(
      slots.map((slot, index) => ({
        id: `cstm_${crypto.randomUUID()}`,
        churchId,
        dayOfWeek: slot.dayOfWeek,
        startTime: slot.startTime,
        label: slot.label,
        sortOrder: index,
        createdAt: now,
      })),
    )
    .onConflictDoNothing()
    .returning({ id: ChurchServiceTimes.id });
  return inserted.length;
}

/** Test hook: forget cached directory profiles. */
export function __resetServiceChoiceCacheForTests(): void {
  directoryCache.clear();
}
