import { and, asc, eq, sql } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { bookChapterCount } from '../../src/utils/bible-book-chapters';
import { VERSE_STICKER_LIMIT, verseStickers, type ChildVerseSticker } from '../../shared/child-verse-stickers';
import { FamilyChildVerseStickers } from '../db/schema';
import type { Child, FamilyTx } from './service';

/**
 * Verse stickers in the child's own Bible. Keyed by book, chapter and verse rather than by
 * translation, so a sticker stays put when the child switches between approved translations.
 * Only the child's session reads or writes them; the parent sees them in the export only.
 */
const chapterInput = z.object({ book: z.string().max(35), chapter: z.number().int().positive() })
  .refine(({ book, chapter }) => chapter <= (bookChapterCount(book) ?? 0));
export const verseStickerInput = z.object({
  book: z.string().max(35), chapter: z.number().int().positive(),
  // Psalm 119 is the longest chapter at 176 verses.
  verse: z.number().int().positive().max(176),
  sticker: z.enum(verseStickers).nullable()
}).strict().refine(({ book, chapter }) => chapterInput.safeParse({ book, chapter }).success);

const own = (child: Child) => eq(FamilyChildVerseStickers.childId, child.id);

export async function chapterStickers(tx: FamilyTx, child: Child, book: string, chapter: number): Promise<ChildVerseSticker[]> {
  const rows = await tx.select({ verse: FamilyChildVerseStickers.verse, sticker: FamilyChildVerseStickers.sticker })
    .from(FamilyChildVerseStickers)
    .where(and(own(child), eq(FamilyChildVerseStickers.book, book), eq(FamilyChildVerseStickers.chapter, chapter)))
    .orderBy(asc(FamilyChildVerseStickers.verse));
  // A sticker retired from the set is kept for the export but not drawn.
  return rows.filter((row): row is ChildVerseSticker => (verseStickers as readonly string[]).includes(row.sticker));
}

export async function setVerseSticker(tx: FamilyTx, child: Child, input: z.infer<typeof verseStickerInput>) {
  const { book, chapter, verse, sticker } = input;
  const at = and(own(child), eq(FamilyChildVerseStickers.book, book),
    eq(FamilyChildVerseStickers.chapter, chapter), eq(FamilyChildVerseStickers.verse, verse));
  if (!sticker) {
    await tx.delete(FamilyChildVerseStickers).where(at);
    return { verse, sticker: null };
  }
  const [count] = await tx.select({ count: sql<number>`count(*)::int` }).from(FamilyChildVerseStickers).where(own(child));
  if (count.count >= VERSE_STICKER_LIMIT) {
    const [existing] = await tx.select({ verse: FamilyChildVerseStickers.verse }).from(FamilyChildVerseStickers).where(at);
    if (!existing) throw new HTTPException(409, { message: 'Your Bible is full of stickers. Take one off to add another.' });
  }
  await tx.insert(FamilyChildVerseStickers).values({ childId: child.id, book, chapter, verse, sticker, createdAt: new Date() })
    .onConflictDoUpdate({
      target: [FamilyChildVerseStickers.childId, FamilyChildVerseStickers.book, FamilyChildVerseStickers.chapter, FamilyChildVerseStickers.verse],
      set: { sticker, createdAt: new Date() }
    });
  return { verse, sticker };
}

export function exportVerseStickers(tx: FamilyTx, child: Child) {
  return tx.select({
    book: FamilyChildVerseStickers.book, chapter: FamilyChildVerseStickers.chapter, verse: FamilyChildVerseStickers.verse,
    sticker: FamilyChildVerseStickers.sticker, createdAt: FamilyChildVerseStickers.createdAt
  }).from(FamilyChildVerseStickers).where(own(child))
    .orderBy(asc(FamilyChildVerseStickers.book), asc(FamilyChildVerseStickers.chapter), asc(FamilyChildVerseStickers.verse));
}
