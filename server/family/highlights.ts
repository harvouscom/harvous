import { and, asc, eq, sql } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { bookChapterCount } from '../../src/utils/bible-book-chapters';
import { VERSE_HIGHLIGHT_LIMIT, verseHighlightColors, type ChildVerseHighlight } from '../../shared/child-verse-highlights';
import { FamilyChildVerseHighlights } from '../db/schema';
import type { Child, FamilyTx } from './service';

/**
 * Highlights in the child's own Bible — the same shape as verse stickers (see stickers.ts): keyed
 * by book, chapter and verse rather than translation, so a highlight stays put when the child
 * switches translations. One colour per verse; the same colour again clears it on the client.
 */
export const verseHighlightInput = z.object({
  book: z.string().max(35), chapter: z.number().int().positive(),
  // Psalm 119 is the longest chapter at 176 verses.
  verse: z.number().int().positive().max(176),
  color: z.enum(verseHighlightColors).nullable()
}).strict().refine(({ book, chapter }) => chapter <= (bookChapterCount(book) ?? 0));

const own = (child: Child) => eq(FamilyChildVerseHighlights.childId, child.id);

export async function chapterHighlights(tx: FamilyTx, child: Child, book: string, chapter: number): Promise<ChildVerseHighlight[]> {
  const rows = await tx.select({ verse: FamilyChildVerseHighlights.verse, color: FamilyChildVerseHighlights.color })
    .from(FamilyChildVerseHighlights)
    .where(and(own(child), eq(FamilyChildVerseHighlights.book, book), eq(FamilyChildVerseHighlights.chapter, chapter)))
    .orderBy(asc(FamilyChildVerseHighlights.verse));
  // A colour retired from the set is kept for the export but not drawn.
  return rows.filter((row): row is ChildVerseHighlight => (verseHighlightColors as readonly string[]).includes(row.color));
}

export async function setVerseHighlight(tx: FamilyTx, child: Child, input: z.infer<typeof verseHighlightInput>) {
  const { book, chapter, verse, color } = input;
  const at = and(own(child), eq(FamilyChildVerseHighlights.book, book),
    eq(FamilyChildVerseHighlights.chapter, chapter), eq(FamilyChildVerseHighlights.verse, verse));
  if (!color) {
    await tx.delete(FamilyChildVerseHighlights).where(at);
    return { verse, color: null };
  }
  const [count] = await tx.select({ count: sql<number>`count(*)::int` }).from(FamilyChildVerseHighlights).where(own(child));
  if (count.count >= VERSE_HIGHLIGHT_LIMIT) {
    const [existing] = await tx.select({ verse: FamilyChildVerseHighlights.verse }).from(FamilyChildVerseHighlights).where(at);
    if (!existing) throw new HTTPException(409, { message: 'Your Bible is full of highlights. Take one off to add another.' });
  }
  await tx.insert(FamilyChildVerseHighlights).values({ childId: child.id, book, chapter, verse, color, createdAt: new Date() })
    .onConflictDoUpdate({
      target: [FamilyChildVerseHighlights.childId, FamilyChildVerseHighlights.book, FamilyChildVerseHighlights.chapter, FamilyChildVerseHighlights.verse],
      set: { color, createdAt: new Date() }
    });
  return { verse, color };
}

export function exportVerseHighlights(tx: FamilyTx, child: Child) {
  return tx.select({
    book: FamilyChildVerseHighlights.book, chapter: FamilyChildVerseHighlights.chapter, verse: FamilyChildVerseHighlights.verse,
    color: FamilyChildVerseHighlights.color, createdAt: FamilyChildVerseHighlights.createdAt
  }).from(FamilyChildVerseHighlights).where(own(child))
    .orderBy(asc(FamilyChildVerseHighlights.book), asc(FamilyChildVerseHighlights.chapter), asc(FamilyChildVerseHighlights.verse));
}
