/**
 * Record one reading session — a chapter held open for some length of time. Non-throwing:
 * a reading surface must never stall or fail on its own analytics.
 */

import { db, ReadingEvents } from '../db';
import { nowISO } from '../db/dates';
import { generateTimestampId } from '@/utils/ids';
import {
  normalizeTranslationCode,
  resolveScriptureChapterTarget,
} from '@/utils/scripture-chapter-target';
import {
  isReadingDwellBucket,
  readingDwellCountsAsRead,
  readingDwellStrength,
  type ReadingDwellBucket,
} from '@/utils/reading-event-kinds';
import { isReadingEventsTableMissing } from './pg-undefined-relation';
import { chapterTouch, touchNodes } from './study-bible-layer';
import { readChapterSource } from '@/utils/study-bible-source-copy';

export type RecordReadingEventInput = {
  book: string;
  bookOrder: number;
  chapter: number;
  translation: string;
  dwellBucket: ReadingDwellBucket;
};

/** One chapter's reading history, as returned to the client. */
export type ReadingHistoryEntry = {
  book: string;
  bookOrder: number;
  chapter: number;
  /** The strongest bucket seen for this chapter, not the most recent — see collapse. */
  dwellBucket: ReadingDwellBucket;
  /** When it was last opened, by any dwell — a glance counts as opening it. */
  createdAt: string;
  /**
   * When it was last actually *read*, glances excluded. Null for a chapter only ever glanced at.
   *
   * Separate from `createdAt` because the two answer different questions and one column cannot.
   * A chapter studied last month and glanced at today has `createdAt` of today, and a card
   * saying "you read this today" on the strength of a three-second glance is a card built on
   * nothing. The bucket is the strongest ever seen, so it cannot be asked either.
   */
  lastReadAt: string | null;
};

/**
 * Reduce raw ReadingEvents rows to one entry per chapter.
 *
 * Pure so it can be tested without a database. `rows` must arrive newest-first — the query
 * orders by createdAt desc — so the first row seen carries the timestamp.
 *
 * The bucket is the *strongest* seen rather than the most recent, which is the one place
 * this differs from collapsing recall history. Glancing at a chapter today after studying
 * it last week does not make it unread, and the question every consumer asks of this log
 * is "has this been read", not "how was it opened last time".
 */
export function collapseReadingHistory(
  rows: {
    book: string;
    bookOrder: number;
    chapter: number;
    dwellBucket: string;
    createdAt: string | Date | null;
  }[],
): ReadingHistoryEntry[] {
  const seen = new Map<string, ReadingHistoryEntry>();
  for (const row of rows) {
    if (!row.book || !isReadingDwellBucket(row.dwellBucket)) continue;
    if (!Number.isInteger(row.chapter) || row.chapter < 1) continue;
    const createdAt =
      row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt ?? '');
    if (!createdAt) continue;

    const counts = readingDwellCountsAsRead(row.dwellBucket);
    const key = `${row.bookOrder}:${row.chapter}`;
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, {
        book: row.book,
        bookOrder: row.bookOrder,
        chapter: row.chapter,
        dwellBucket: row.dwellBucket,
        createdAt,
        lastReadAt: counts ? createdAt : null,
      });
      continue;
    }
    if (readingDwellStrength(row.dwellBucket) > readingDwellStrength(existing.dwellBucket)) {
      existing.dwellBucket = row.dwellBucket;
    }
    // Rows arrive newest-first, so the first read-or-better row is the latest one.
    if (counts && !existing.lastReadAt) existing.lastReadAt = createdAt;
  }
  return [...seen.values()];
}

/**
 * Validate a posted reading event against the canon rather than trusting the sender.
 *
 * `bookOrder` is re-derived here instead of being read off the body: it is the key every
 * consumer groups by, and a client that sent a stale or wrong one would quietly split a
 * book's history in two. The book name and chapter must resolve, so a typo lands as a
 * rejected event rather than as an unreadable row in an append-only table.
 */
export function validateReadingEventInput(body: unknown): RecordReadingEventInput | null {
  if (!body || typeof body !== 'object') return null;
  const { book, chapter, translation, dwellBucket } = body as Record<string, unknown>;

  const target = resolveScriptureChapterTarget(book, chapter);
  if (!target) return null;

  const translationCode = normalizeTranslationCode(translation);
  if (!translationCode) return null;

  if (typeof dwellBucket !== 'string' || !isReadingDwellBucket(dwellBucket)) return null;

  return { ...target, translation: translationCode, dwellBucket };
}

export async function recordReadingEvent(
  userId: string,
  input: RecordReadingEventInput,
): Promise<boolean> {
  try {
    await db.insert(ReadingEvents).values({
      id: generateTimestampId('readingevent'),
      userId,
      book: input.book,
      bookOrder: input.bookOrder,
      chapter: input.chapter,
      translation: input.translation,
      dwellBucket: input.dwellBucket,
      createdAt: nowISO(),
    });
    // The reader's Study Bible layer: a chapter turned to is the coarsest node there is, and
    // the only granularity reading gives us — nothing here knows which verse they were on.
    const at = new Date();
    void touchNodes(userId, [
      chapterTouch({
        chapter: { book: input.book, chapter: input.chapter },
        signal: readingDwellCountsAsRead(input.dwellBucket) ? 'revisit' : 'exposure',
        at,
        sourceLabel: readChapterSource(input.book, input.chapter),
        translation: input.translation,
      }),
    ]);
    return true;
  } catch (error) {
    if (isReadingEventsTableMissing(error)) {
      console.warn('[recordReadingEvent] ReadingEvents table missing; skipping. Run `npm run db:push`.');
      return false;
    }
    console.error('[recordReadingEvent]', error instanceof Error ? error.message : error);
    return false;
  }
}
