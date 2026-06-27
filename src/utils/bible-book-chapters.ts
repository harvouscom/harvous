/**
 * Canonical chapter count per book, derived once from bible-chapters.json (a flat list of
 * { book, bookOrder, chapter, ... } records). Used by the "continue the book" generative recall card
 * to know when a book is finished and what the next chapter is.
 */

import bibleChaptersData from '@/data/bible-chapters.json';

interface ChapterRecord {
  book: string;
  bookOrder: number;
  chapter: number;
}

let cache: Map<string, number> | null = null;

/** Map of book name → highest (canonical) chapter number. Built once and memoized. */
export function bibleBookChapterCounts(): Map<string, number> {
  if (cache) return cache;
  const counts = new Map<string, number>();
  for (const record of bibleChaptersData as ChapterRecord[]) {
    const current = counts.get(record.book) ?? 0;
    if (record.chapter > current) counts.set(record.book, record.chapter);
  }
  cache = counts;
  return counts;
}

/** Number of chapters in a book, or null when the book name isn't recognized. */
export function bookChapterCount(book: string): number | null {
  return bibleBookChapterCounts().get(book) ?? null;
}
