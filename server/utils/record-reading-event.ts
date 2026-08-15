/**
 * Record that a chapter was read, and move the bookmark. Non-throwing, like recall events.
 *
 * Nothing the reader does should be able to fail because of this. Reading is the one thing in
 * the app that must never wait on the network, so every failure here — a missing table before
 * the migration is applied, a dropped connection, a malformed body — is swallowed and
 * reported as `false`. The caller's answer to the reader is the same either way.
 */

import { db, ReadingEvents, UserMetadata, eq } from '../db';
import { now } from '../db/dates';
import { generateTimestampId } from '@/utils/ids';
import { bookChapterCount } from '@/utils/bible-book-chapters';
import { serializeReadingPosition, type ReadingPosition } from '@/utils/reading-position';
import {
  isLastReadPositionColumnMissing,
  isReadingEventsTableMissing,
} from './pg-undefined-relation';

export interface RecordReadingEventInput {
  book: string;
  chapter: number;
  verse?: number | null;
  translation?: string | null;
}

/**
 * Validate a client-supplied reading event.
 *
 * The book and chapter are checked against the canon rather than merely being non-empty: this
 * table is meant to be aggregated over later, and a log that accepts "Hezekiah 4" is a log
 * that has to be cleaned before it can be counted.
 */
export function validateReadingEventInput(body: unknown): RecordReadingEventInput | null {
  if (!body || typeof body !== 'object') return null;
  const { book, chapter, verse, translation } = body as Record<string, unknown>;

  if (typeof book !== 'string' || !book.trim()) return null;
  if (typeof chapter !== 'number' || !Number.isInteger(chapter) || chapter < 1) return null;

  const trimmedBook = book.trim();
  const chapterCount = bookChapterCount(trimmedBook);
  if (chapterCount == null || chapter > chapterCount) return null;

  const parsedVerse =
    typeof verse === 'number' && Number.isInteger(verse) && verse > 0 ? verse : null;
  const parsedTranslation =
    typeof translation === 'string' && translation.trim() ? translation.trim().slice(0, 16) : null;

  return { book: trimmedBook, chapter, verse: parsedVerse, translation: parsedTranslation };
}

export async function recordReadingEvent(
  userId: string,
  input: RecordReadingEventInput,
): Promise<boolean> {
  /*
   * `nowISO` is a deprecated alias for `now` and returns a Date — right for a timestamp
   * column, wrong for the bookmark, which is JSON and has to carry a string.
   */
  const at = now();
  const atISO = at.toISOString();

  // The log and the bookmark fail independently on purpose. A database that has the table but
  // not the column (or the reverse, mid-migration) should still record whichever half it can,
  // rather than losing both to one missing piece of schema.
  let recorded = false;

  try {
    await db.insert(ReadingEvents).values({
      id: generateTimestampId('readingevent'),
      userId,
      book: input.book,
      chapter: input.chapter,
      translation: input.translation ?? null,
      createdAt: at,
    });
    recorded = true;
  } catch (error) {
    if (isReadingEventsTableMissing(error)) {
      console.warn('[recordReadingEvent] ReadingEvents table missing; skipping. Run `npm run db:push`.');
    } else {
      console.error('[recordReadingEvent] log', error instanceof Error ? error.message : error);
    }
  }

  const position: ReadingPosition = {
    book: input.book,
    chapter: input.chapter,
    ...(input.verse ? { verse: input.verse } : {}),
    ...(input.translation ? { translation: input.translation } : {}),
    at: atISO,
  };

  try {
    await db
      .update(UserMetadata)
      .set({ lastReadPosition: serializeReadingPosition(position), updatedAt: at })
      .where(eq(UserMetadata.userId, userId));
    recorded = true;
  } catch (error) {
    if (isLastReadPositionColumnMissing(error)) {
      console.warn('[recordReadingEvent] lastReadPosition column missing; skipping. Run `npm run db:push`.');
    } else {
      console.error('[recordReadingEvent] bookmark', error instanceof Error ? error.message : error);
    }
  }

  return recorded;
}
