/**
 * The free history window, as one place that knows every personal source it hides.
 *
 * Free accounts see `FREE_HISTORY_WINDOW_DAYS` of their own study trail and note history, plus
 * a `FREE_HISTORY_GRACE_DAYS` soft landing: anything that turns 90 days old stays in view for
 * a week more, counted down, before it tucks behind Plus. Nothing is deleted.
 *
 * Two questions live here:
 *   - Is anything hidden at all? Every windowed source is probed. The feed's old probe asked
 *     only about notes and saves, so someone whose only older study was highlights or reading
 *     was told "Your study begins here" while that history was hidden.
 *   - How much, and what leaves next? Counted over what the person made — notes and
 *     highlights — so a reminder never says "40 items" because of note visits.
 */

import {
  db,
  Notes,
  NoteVersions,
  StudyThreadEntries,
  ReadingEvents,
  NoteVisitEvents,
  ReviewEvents,
  and,
  eq,
  gte,
  lt,
  asc,
  inArray,
} from '../db';
import {
  FREE_HISTORY_GRACE_DAYS,
  FREE_HISTORY_VISIBLE_DAYS,
  FREE_HISTORY_WINDOW_DAYS,
} from '@/lib/billing-plans';
import {
  isNoteVisitEventsTableMissing,
  isReadingEventsTableMissing,
  isReviewTableMissing,
  isStudyThreadEntriesTableMissing,
} from './pg-undefined-relation';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Above this, counts read "500+": enough to say "a lot" without counting a whole account. */
export const HISTORY_COUNT_CAP = 500;

const REVIEW_OUTCOMES = ['recalled', 'almost', 'revealed'] as const;

/** Oldest moment still in view for a free account. */
export function freeHistoryFloor(now: Date): Date {
  return new Date(now.getTime() - FREE_HISTORY_VISIBLE_DAYS * DAY_MS);
}

/** Start of the grace band: study older than this is in its last week of view. */
export function freeHistoryGraceStart(now: Date): Date {
  return new Date(now.getTime() - FREE_HISTORY_WINDOW_DAYS * DAY_MS);
}

async function tolerant<T>(load: () => Promise<T>, fallback: T, isMissing?: (e: unknown) => boolean): Promise<T> {
  try {
    return await load();
  } catch (error) {
    if (isMissing?.(error)) return fallback;
    throw error;
  }
}

/** Does this account have any personal study older than `before`, in any windowed source? */
export async function hasOlderPersonalHistory(userId: string, before: Date): Promise<boolean> {
  const probes: Array<() => Promise<boolean>> = [
    async () =>
      (await db.select({ id: Notes.id }).from(Notes).where(and(eq(Notes.userId, userId), lt(Notes.createdAt, before))).limit(1))
        .length > 0,
    async () =>
      (
        await db
          .select({ id: NoteVersions.id })
          .from(NoteVersions)
          .where(and(eq(NoteVersions.authorId, userId), eq(NoteVersions.source, 'save'), lt(NoteVersions.createdAt, before)))
          .limit(1)
      ).length > 0,
    () =>
      tolerant(
        async () =>
          (
            await db
              .select({ id: StudyThreadEntries.id })
              .from(StudyThreadEntries)
              .where(
                and(
                  eq(StudyThreadEntries.userId, userId),
                  eq(StudyThreadEntries.isArchived, false),
                  lt(StudyThreadEntries.createdAt, before),
                ),
              )
              .limit(1)
          ).length > 0,
        false,
        isStudyThreadEntriesTableMissing,
      ),
    () =>
      tolerant(
        async () =>
          (
            await db
              .select({ id: ReadingEvents.id })
              .from(ReadingEvents)
              .where(and(eq(ReadingEvents.userId, userId), lt(ReadingEvents.createdAt, before)))
              .limit(1)
          ).length > 0,
        false,
        isReadingEventsTableMissing,
      ),
    () =>
      tolerant(
        async () =>
          (
            await db
              .select({ id: NoteVisitEvents.noteId })
              .from(NoteVisitEvents)
              .where(and(eq(NoteVisitEvents.userId, userId), lt(NoteVisitEvents.createdAt, before)))
              .limit(1)
          ).length > 0,
        false,
        isNoteVisitEventsTableMissing,
      ),
    () =>
      tolerant(
        async () =>
          (
            await db
              .select({ id: ReviewEvents.id })
              .from(ReviewEvents)
              .where(
                and(
                  eq(ReviewEvents.userId, userId),
                  inArray(ReviewEvents.action, [...REVIEW_OUTCOMES]),
                  lt(ReviewEvents.createdAt, before),
                ),
              )
              .limit(1)
          ).length > 0,
        false,
        isReviewTableMissing,
      ),
  ];
  // Short-circuit on the first hit: the common answer for an older account is the first probe.
  for (const probe of probes) {
    if (await probe()) return true;
  }
  return false;
}

/** createdAt of the notes and highlights a person made in [from, to), oldest first, capped. */
async function madeInRange(userId: string, from: Date | null, to: Date): Promise<Date[]> {
  const noteBounds = [eq(Notes.userId, userId), lt(Notes.createdAt, to)];
  if (from) noteBounds.push(gte(Notes.createdAt, from));
  const notes = await db
    .select({ at: Notes.createdAt })
    .from(Notes)
    .where(and(...noteBounds))
    .orderBy(asc(Notes.createdAt))
    .limit(HISTORY_COUNT_CAP + 1);

  const highlights = await tolerant(
    async () => {
      const bounds = [
        eq(StudyThreadEntries.userId, userId),
        eq(StudyThreadEntries.isArchived, false),
        lt(StudyThreadEntries.createdAt, to),
      ];
      if (from) bounds.push(gte(StudyThreadEntries.createdAt, from));
      return db
        .select({ at: StudyThreadEntries.createdAt })
        .from(StudyThreadEntries)
        .where(and(...bounds))
        .orderBy(asc(StudyThreadEntries.createdAt))
        .limit(HISTORY_COUNT_CAP + 1);
    },
    [] as Array<{ at: Date }>,
    isStudyThreadEntriesTableMissing,
  );

  return [...notes, ...highlights]
    .map((r) => (r.at instanceof Date ? r.at : new Date(r.at as unknown as string)))
    .sort((a, b) => a.getTime() - b.getTime());
}

export interface HistoryWindowStatus {
  windowDays: number;
  graceDays: number;
  /** Notes and highlights already out of view. Capped at HISTORY_COUNT_CAP; `hiddenCapped` says so. */
  hiddenCount: number;
  hiddenCapped: boolean;
  /** Something is hidden in any source, made or not (reading, visits, review answers too). */
  hasHidden: boolean;
  /** Notes and highlights in their last week of view, or null when nothing is leaving. */
  leavingSoon: {
    count: number;
    /** Oldest of them; it is the first to leave. */
    oldestAt: string;
    newestAt: string;
    /** When the first of them leaves view. */
    firstLeavesAt: string;
  } | null;
}

/** The free account's picture of its own window. Callers check `full_history` first. */
export async function freeHistoryWindowStatus(userId: string, now = new Date()): Promise<HistoryWindowStatus> {
  const floor = freeHistoryFloor(now);
  const graceStart = freeHistoryGraceStart(now);
  const [hidden, leaving, hasHidden] = await Promise.all([
    madeInRange(userId, null, floor),
    madeInRange(userId, floor, graceStart),
    hasOlderPersonalHistory(userId, floor),
  ]);
  const hiddenCapped = hidden.length > HISTORY_COUNT_CAP;
  const leavingSoon =
    leaving.length > 0
      ? {
          count: Math.min(leaving.length, HISTORY_COUNT_CAP),
          oldestAt: leaving[0].toISOString(),
          newestAt: leaving[leaving.length - 1].toISOString(),
          firstLeavesAt: new Date(leaving[0].getTime() + FREE_HISTORY_VISIBLE_DAYS * DAY_MS).toISOString(),
        }
      : null;
  return {
    windowDays: FREE_HISTORY_WINDOW_DAYS,
    graceDays: FREE_HISTORY_GRACE_DAYS,
    hiddenCount: Math.min(hidden.length, HISTORY_COUNT_CAP),
    hiddenCapped,
    hasHidden: hasHidden || hidden.length > 0,
    leavingSoon,
  };
}
