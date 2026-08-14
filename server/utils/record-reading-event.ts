/**
 * Record one reading session — a chapter held open for some length of time. Non-throwing:
 * a reading surface must never stall or fail on its own analytics.
 */

import { db, ReadingEvents } from '../db';
import { nowISO } from '../db/dates';
import { generateTimestampId } from '@/utils/ids';
import { getBookChapterCount } from '@/utils/scripture-detector';
import { canonicalBookOrderMap } from '@/utils/scripture-passage-drill';
import {
  isReadingDwellBucket,
  readingDwellStrength,
  type ReadingDwellBucket,
} from '@/utils/reading-event-kinds';
import { isReadingEventsTableMissing } from './pg-undefined-relation';

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
  /** When it was last opened. */
  createdAt: string;
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

    const key = `${row.bookOrder}:${row.chapter}`;
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, {
        book: row.book,
        bookOrder: row.bookOrder,
        chapter: row.chapter,
        dwellBucket: row.dwellBucket,
        createdAt,
      });
      continue;
    }
    if (readingDwellStrength(row.dwellBucket) > readingDwellStrength(existing.dwellBucket)) {
      existing.dwellBucket = row.dwellBucket;
    }
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

  if (typeof book !== 'string' || !book.trim()) return null;
  const trimmedBook = book.trim();
  const bookOrder = canonicalBookOrderMap().get(trimmedBook);
  if (bookOrder === undefined) return null;

  if (typeof chapter !== 'number' || !Number.isInteger(chapter) || chapter < 1) return null;
  const chapterCount = getBookChapterCount(trimmedBook);
  if (!chapterCount || chapter > chapterCount) return null;

  if (typeof translation !== 'string' || !translation.trim()) return null;
  const trimmedTranslation = translation.trim().toUpperCase();
  if (trimmedTranslation.length > 16) return null;

  if (typeof dwellBucket !== 'string' || !isReadingDwellBucket(dwellBucket)) return null;

  return {
    book: trimmedBook,
    bookOrder,
    chapter,
    translation: trimmedTranslation,
    dwellBucket,
  };
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
