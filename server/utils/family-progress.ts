/**
 * What a parent sees of a child's study. Counts, a coarse bucket, and book names — nothing
 * else, ever.
 *
 * The rule (docs/future/FAMILY_ACCOUNTS.md, "What parents see"): progress, not content.
 * Notes are where people write prayers and doubts, and a note app that reports to a parent
 * is one nobody writes in honestly. So this file reads:
 *
 *   - ReadingEvents: when, which book, how many distinct chapters (glances never count)
 *   - NoteVisitEvents: when, only
 *   - Notes: when, and how many — never a title, never a body
 *
 * Book names are the one named exception to "only counts", decided with Derek on
 * 2026-10-09. Which chapters stays private.
 *
 * Never here: Review (a person's Review is never shared — docs/CHURCH_V2_ROADMAP.md),
 * searches, Recall, highlights, threads, spaces, exact times. A contract test scans this
 * file's source and fails if it reaches for any of them.
 *
 * The child sees exactly this payload about themselves, so nothing about the arrangement
 * rests on trust.
 */

import {
  db,
  Notes,
  NoteVisitEvents,
  ReadingEvents,
  and,
  eq,
  gte,
  inArray,
  max,
  sql,
} from '../db';

export const FAMILY_PROGRESS_WINDOW_DAYS = 30;

export type LastActiveBucket = 'day' | 'week' | 'month' | 'earlier' | 'never';

export interface FamilyProgressEntry {
  userId: string;
  lastActive: LastActiveBucket;
  chaptersRead: number;
  /** Canonical order, Genesis first. */
  booksRead: string[];
  notesWritten: number;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Rolling windows, not calendar days — the server doesn't know the child's time zone. */
export function lastActiveBucket(latest: Date | null, now: Date): LastActiveBucket {
  if (!latest) return 'never';
  const age = now.getTime() - latest.getTime();
  if (age < DAY_MS) return 'day';
  if (age < 7 * DAY_MS) return 'week';
  if (age < FAMILY_PROGRESS_WINDOW_DAYS * DAY_MS) return 'month';
  return 'earlier';
}

function latestOf(...dates: Array<Date | string | null | undefined>): Date | null {
  let best: Date | null = null;
  for (const value of dates) {
    if (!value) continue;
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) continue;
    if (!best || d > best) best = d;
  }
  return best;
}

/** Glances are a page passing by; only reading counts as reading. */
const READ_BUCKETS = ['read', 'study'];

export async function familyProgressFor(userIds: readonly string[], now: Date = new Date()): Promise<FamilyProgressEntry[]> {
  const ids = [...new Set(userIds)];
  if (ids.length === 0) return [];
  const since = new Date(now.getTime() - FAMILY_PROGRESS_WINDOW_DAYS * DAY_MS);

  const [readingLatest, visitLatest, noteLatest, chapterCounts, books, noteCounts] = await Promise.all([
    db
      .select({ userId: ReadingEvents.userId, at: max(ReadingEvents.createdAt) })
      .from(ReadingEvents)
      .where(inArray(ReadingEvents.userId, ids))
      .groupBy(ReadingEvents.userId),
    db
      .select({ userId: NoteVisitEvents.userId, at: max(NoteVisitEvents.createdAt) })
      .from(NoteVisitEvents)
      .where(inArray(NoteVisitEvents.userId, ids))
      .groupBy(NoteVisitEvents.userId),
    db
      .select({ userId: Notes.userId, at: max(Notes.createdAt) })
      .from(Notes)
      .where(and(inArray(Notes.userId, ids), eq(Notes.addedBy, 'user')))
      .groupBy(Notes.userId),
    db
      .select({
        userId: ReadingEvents.userId,
        chapters: sql<number>`count(distinct (${ReadingEvents.bookOrder}, ${ReadingEvents.chapter}))`,
      })
      .from(ReadingEvents)
      .where(
        and(
          inArray(ReadingEvents.userId, ids),
          gte(ReadingEvents.createdAt, since),
          inArray(ReadingEvents.dwellBucket, READ_BUCKETS),
        ),
      )
      .groupBy(ReadingEvents.userId),
    db
      .selectDistinct({
        userId: ReadingEvents.userId,
        book: ReadingEvents.book,
        bookOrder: ReadingEvents.bookOrder,
      })
      .from(ReadingEvents)
      .where(
        and(
          inArray(ReadingEvents.userId, ids),
          gte(ReadingEvents.createdAt, since),
          inArray(ReadingEvents.dwellBucket, READ_BUCKETS),
        ),
      ),
    db
      .select({ userId: Notes.userId, notes: sql<number>`count(*)` })
      .from(Notes)
      .where(and(inArray(Notes.userId, ids), gte(Notes.createdAt, since), eq(Notes.addedBy, 'user')))
      .groupBy(Notes.userId),
  ]);

  const byUser = <T extends { userId: string }>(rows: T[]) => new Map(rows.map((r) => [r.userId, r]));
  const reading = byUser(readingLatest);
  const visits = byUser(visitLatest);
  const notes = byUser(noteLatest);
  const chapters = byUser(chapterCounts);
  const noteCount = byUser(noteCounts);

  const booksByUser = new Map<string, Array<{ book: string; bookOrder: number }>>();
  for (const row of books) {
    const list = booksByUser.get(row.userId) ?? [];
    if (!list.some((b) => b.bookOrder === row.bookOrder)) list.push({ book: row.book, bookOrder: row.bookOrder });
    booksByUser.set(row.userId, list);
  }

  return ids.map((userId) => ({
    userId,
    lastActive: lastActiveBucket(
      latestOf(reading.get(userId)?.at, visits.get(userId)?.at, notes.get(userId)?.at),
      now,
    ),
    chaptersRead: Number(chapters.get(userId)?.chapters ?? 0),
    booksRead: (booksByUser.get(userId) ?? []).sort((a, b) => a.bookOrder - b.bookOrder).map((b) => b.book),
    notesWritten: Number(noteCount.get(userId)?.notes ?? 0),
  }));
}
