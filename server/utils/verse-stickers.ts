/**
 * Verse stickers in the Harvous Bible reader.
 *
 * Their own table (`VerseStickers`), one row per verse, rather than another kind of
 * `StudyThreadEntries` row. A highlight there is per translation and per span, and every row in
 * that table is read by the sidebar's Highlights list, Review, the Study Bible layer and native
 * sync. A sticker is none of those things: it is decoration on the verse itself, so it is keyed
 * by book, chapter and verse and survives a translation switch, the way a child's
 * `FamilyChildVerseStickers` already does. The two tables share a shape so a child notebook moving
 * into a teen's own account converts row for row (server/family/notebook-move.ts).
 */
import { and, asc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { bookChapterCount } from '@/utils/bible-book-chapters';
import { VERSE_STICKER_LIMIT, isReaderSticker, readerStickers, type ReaderSticker } from '../../shared/verse-stickers';
import { VerseStickers } from '../db/schema';
import { db as defaultDb } from '../db/client';
import { isPgUndefinedRelation } from './pg-undefined-relation';

type Db = Pick<typeof defaultDb, 'select' | 'insert' | 'delete'>;

const chapterShape = z.object({ book: z.string().trim().min(1).max(35), chapter: z.number().int().positive() })
  .refine(({ book, chapter }) => chapter <= (bookChapterCount(book) ?? 0), { message: 'Unknown chapter' });
export const chapterStickersQuery = chapterShape;
export const verseStickerInput = z.object({
  book: z.string().trim().min(1).max(35),
  chapter: z.number().int().positive(),
  // Psalm 119 is the longest chapter at 176 verses.
  verse: z.number().int().positive().max(176),
  // The reader's whole set: the stickers child notebooks share, and the themes only it offers.
  sticker: z.enum(readerStickers).nullable(),
}).strict().refine(({ book, chapter }) => chapterShape.safeParse({ book, chapter }).success, { message: 'Unknown chapter' });

export type ChapterSticker = { verse: number; sticker: ReaderSticker };

export class VerseStickerLimitError extends Error {
  constructor() { super('Your Bible is full of stickers. Take one off to add another.'); }
}
export class VerseStickersUnavailableError extends Error {
  constructor() { super('Stickers aren’t available yet.'); }
}

const missing = (error: unknown) => isPgUndefinedRelation(error, 'VerseStickers');

/** A chapter's stickers for one account. Before the table exists, there are none. */
export async function listChapterStickers(userId: string, book: string, chapter: number, db: Db = defaultDb): Promise<ChapterSticker[]> {
  try {
    const rows = await db.select({ verse: VerseStickers.verse, sticker: VerseStickers.sticker }).from(VerseStickers)
      .where(and(eq(VerseStickers.userId, userId), eq(VerseStickers.book, book), eq(VerseStickers.chapter, chapter)))
      .orderBy(asc(VerseStickers.verse));
    // A sticker retired from the set stays in the row but is not drawn.
    return rows.filter((row): row is ChapterSticker => isReaderSticker(row.sticker));
  } catch (error) {
    if (missing(error)) return [];
    throw error;
  }
}

/** Sticks one on (replacing whatever was there) or, with `sticker: null`, takes it off. */
export async function setVerseSticker(userId: string, input: z.infer<typeof verseStickerInput>, db: Db = defaultDb) {
  const { book, chapter, verse, sticker } = input;
  const at = and(eq(VerseStickers.userId, userId), eq(VerseStickers.book, book),
    eq(VerseStickers.chapter, chapter), eq(VerseStickers.verse, verse));
  try {
    if (!sticker) {
      await db.delete(VerseStickers).where(at);
      return { verse, sticker: null };
    }
    const [count] = await db.select({ count: sql<number>`count(*)::int` }).from(VerseStickers).where(eq(VerseStickers.userId, userId));
    if (count.count >= VERSE_STICKER_LIMIT) {
      const [existing] = await db.select({ verse: VerseStickers.verse }).from(VerseStickers).where(at);
      if (!existing) throw new VerseStickerLimitError();
    }
    const now = new Date();
    await db.insert(VerseStickers).values({ userId, book, chapter, verse, sticker, createdAt: now, updatedAt: now })
      .onConflictDoUpdate({
        target: [VerseStickers.userId, VerseStickers.book, VerseStickers.chapter, VerseStickers.verse],
        set: { sticker, updatedAt: now },
      });
    return { verse, sticker };
  } catch (error) {
    if (missing(error)) throw new VerseStickersUnavailableError();
    throw error;
  }
}
