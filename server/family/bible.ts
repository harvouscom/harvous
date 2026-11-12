import { and, asc, desc, eq, sql } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { bookChapterCount } from '../../src/utils/bible-book-chapters';
import { allChildBibleTranslations, type ChildPassage } from '../../shared/child-notebook';
import { BibleVerses, FamilyChildBibleReadings, FamilyChildBibleThoughts } from '../db/schema';
import type { Child, FamilyTx } from './service';

export const translationInput = z.enum(allChildBibleTranslations);

/** Whether this environment's database has text for a translation at all (Genesis 1 is enough). */
export async function hasTranslationText(tx: FamilyTx, translation: string) {
  const [row] = await tx.select({ verse: BibleVerses.verse }).from(BibleVerses)
    .where(and(eq(BibleVerses.translationId, translation), eq(BibleVerses.book, 'Genesis'), eq(BibleVerses.chapter, 1))).limit(1);
  return !!row;
}
export const passageInput = z.object({
  book: z.string().max(35), chapter: z.number().int().positive(), translation: translationInput
}).strict().refine(({ book, chapter, translation }) => chapter <= (bookChapterCount(book, translation) ?? 0));
export const thoughtInput = z.object({ verse: z.number().int().positive(), text: z.string().trim().min(1).max(800) }).strict();

export function requireApprovedTranslation(child: Child, translation: ChildPassage['translation']) {
  if (!child.bibleTranslations.includes(translation)) {
    throw new HTTPException(404, { message: 'This translation is not available in the notebook.' });
  }
}

function chapterWhere(passage: ChildPassage) {
  return and(eq(BibleVerses.translationId, passage.translation), eq(BibleVerses.book, passage.book), eq(BibleVerses.chapter, passage.chapter));
}

export async function readChapter(tx: FamilyTx, passage: ChildPassage) {
  const verses = await tx.select({ verse: BibleVerses.verse, text: BibleVerses.text })
    .from(BibleVerses).where(chapterWhere(passage)).orderBy(asc(BibleVerses.verse));
  if (!verses.length) throw new HTTPException(404, { message: 'This chapter is unavailable. Try another chapter or translation.' });
  return { verses };
}

const readingFields = {
  id: FamilyChildBibleReadings.id, book: FamilyChildBibleReadings.book,
  chapter: FamilyChildBibleReadings.chapter, translation: FamilyChildBibleReadings.translation
};
const thoughtFields = {
  id: FamilyChildBibleThoughts.id, verse: FamilyChildBibleThoughts.verse,
  role: FamilyChildBibleThoughts.role, text: FamilyChildBibleThoughts.text
};

export function familyReadings(tx: FamilyTx, child: Child) {
  return tx.select(readingFields).from(FamilyChildBibleReadings)
    .where(eq(FamilyChildBibleReadings.childId, child.id))
    .orderBy(desc(FamilyChildBibleReadings.sharedAt), asc(FamilyChildBibleReadings.id));
}

export async function getFamilyReading(tx: FamilyTx, child: Child, readingId: string) {
  const [reading] = await tx.select(readingFields).from(FamilyChildBibleReadings).where(and(
    eq(FamilyChildBibleReadings.id, readingId), eq(FamilyChildBibleReadings.childId, child.id)
  ));
  if (!reading) throw new HTTPException(404, { message: 'This reading is no longer shared.' });
  return reading;
}

export function familyThoughts(tx: FamilyTx, readingId: string) {
  return tx.select(thoughtFields).from(FamilyChildBibleThoughts).where(eq(FamilyChildBibleThoughts.readingId, readingId))
    .orderBy(asc(FamilyChildBibleThoughts.createdAt), asc(FamilyChildBibleThoughts.id));
}

export async function shareFamilyReading(tx: FamilyTx, child: Child, passage: ChildPassage) {
  requireApprovedTranslation(child, passage.translation);
  await readChapter(tx, passage);
  const readings = await familyReadings(tx, child);
  const existing = readings.find(reading => reading.book === passage.book && reading.chapter === passage.chapter && reading.translation === passage.translation);
  if (existing) return existing;
  if (readings.length >= 25) throw new HTTPException(409, { message: 'Remove a family reading before adding another.' });
  const [reading] = await tx.insert(FamilyChildBibleReadings).values({
    id: crypto.randomUUID(), childId: child.id, ...passage, sharedAt: new Date()
  }).returning(readingFields);
  return reading;
}

export async function addFamilyThought(tx: FamilyTx, child: Child, readingId: string, role: 'child' | 'parent', input: z.infer<typeof thoughtInput>) {
  const reading = await getFamilyReading(tx, child, readingId);
  requireApprovedTranslation(child, reading.translation);
  const [verse] = await tx.select({ verse: BibleVerses.verse }).from(BibleVerses)
    .where(and(chapterWhere(reading), eq(BibleVerses.verse, input.verse)));
  if (!verse) throw new HTTPException(404, { message: 'This verse is not in the reading.' });
  const [count] = await tx.select({ count: sql<number>`count(*)::int` }).from(FamilyChildBibleThoughts)
    .where(eq(FamilyChildBibleThoughts.readingId, readingId));
  if (count.count >= 100) throw new HTTPException(409, { message: 'This reading has room for 100 thoughts.' });
  const [thought] = await tx.insert(FamilyChildBibleThoughts).values({
    id: crypto.randomUUID(), readingId, role, ...input, createdAt: new Date()
  }).returning(thoughtFields);
  return thought;
}
