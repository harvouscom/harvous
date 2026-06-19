/**
 * OSIS scripture-reference parsing + book-name normalization.
 *
 * Open biblical datasets (Treasury of Scripture Knowledge, OpenBible.info topics /
 * geocoding) address verses with OSIS book codes like `Gen`, `1Cor`, `Ps`. Harvous stores
 * full canonical book names (`Genesis`, `1 Corinthians`, `Psalms`) on `ScriptureMetadata`.
 * This module maps between the two and validates references against the canonical
 * chapter/verse ranges in `src/data/bible-chapters.json`.
 *
 * Pure and dependency-free so it runs in the app, in Vitest, and in tsx import scripts.
 * See docs/future/SCRIPTURE_KNOWLEDGE_LAYER.md.
 */

import bibleChaptersData from '../data/bible-chapters.json';

/** OSIS book code → canonical Harvous book name (matches src/data/bible-chapters.json). */
export const OSIS_TO_CANONICAL: Record<string, string> = {
  Gen: 'Genesis', Exod: 'Exodus', Lev: 'Leviticus', Num: 'Numbers', Deut: 'Deuteronomy',
  Josh: 'Joshua', Judg: 'Judges', Ruth: 'Ruth', '1Sam': '1 Samuel', '2Sam': '2 Samuel',
  '1Kgs': '1 Kings', '2Kgs': '2 Kings', '1Chr': '1 Chronicles', '2Chr': '2 Chronicles',
  Ezra: 'Ezra', Neh: 'Nehemiah', Esth: 'Esther', Job: 'Job', Ps: 'Psalms', Prov: 'Proverbs',
  Eccl: 'Ecclesiastes', Song: 'Song of Solomon', Isa: 'Isaiah', Jer: 'Jeremiah',
  Lam: 'Lamentations', Ezek: 'Ezekiel', Dan: 'Daniel', Hos: 'Hosea', Joel: 'Joel', Amos: 'Amos',
  Obad: 'Obadiah', Jonah: 'Jonah', Mic: 'Micah', Nah: 'Nahum', Hab: 'Habakkuk', Zeph: 'Zephaniah',
  Hag: 'Haggai', Zech: 'Zechariah', Mal: 'Malachi', Matt: 'Matthew', Mark: 'Mark', Luke: 'Luke',
  John: 'John', Acts: 'Acts', Rom: 'Romans', '1Cor': '1 Corinthians', '2Cor': '2 Corinthians',
  Gal: 'Galatians', Eph: 'Ephesians', Phil: 'Philippians', Col: 'Colossians',
  '1Thess': '1 Thessalonians', '2Thess': '2 Thessalonians', '1Tim': '1 Timothy',
  '2Tim': '2 Timothy', Titus: 'Titus', Phlm: 'Philemon', Heb: 'Hebrews', Jas: 'James',
  '1Pet': '1 Peter', '2Pet': '2 Peter', '1John': '1 John', '2John': '2 John', '3John': '3 John',
  Jude: 'Jude', Rev: 'Revelation',
};

interface BibleChapterRow {
  book: string;
  bookOrder: number;
  chapter: number;
  startVerse: number;
  endVerse: number;
}

// Built once: book → chapter → endVerse, and book → canonical order (1–66).
const chapterEndVerse = new Map<string, Map<number, number>>();
const bookOrder = new Map<string, number>();
for (const row of bibleChaptersData as BibleChapterRow[]) {
  if (!chapterEndVerse.has(row.book)) chapterEndVerse.set(row.book, new Map());
  chapterEndVerse.get(row.book)!.set(row.chapter, row.endVerse);
  if (!bookOrder.has(row.book)) bookOrder.set(row.book, row.bookOrder);
}

/** Canonical Harvous book name for an OSIS code, or null if unknown. */
export function osisBookToCanonical(code: string): string | null {
  return OSIS_TO_CANONICAL[code] ?? null;
}

/** Canonical book ordering (1–66) for stable sorting; Infinity for unknown books. */
export function canonicalBookOrder(book: string): number {
  return bookOrder.get(book) ?? Number.POSITIVE_INFINITY;
}

/** True when (book, chapter, verse) resolves to a real verse in the canon. */
export function isValidVerse(book: string, chapter: number, verse: number): boolean {
  const chapters = chapterEndVerse.get(book);
  if (!chapters) return false;
  const endVerse = chapters.get(chapter);
  if (endVerse === undefined) return false;
  return verse >= 1 && verse <= endVerse;
}

export interface OsisVerse {
  book: string;
  chapter: number;
  verse: number;
}

/** Parse a single OSIS verse like `John.3.16` → canonical { book, chapter, verse }. */
export function parseOsisVerse(ref: string): OsisVerse | null {
  const parts = ref.trim().split('.');
  if (parts.length !== 3) return null;
  const book = osisBookToCanonical(parts[0]);
  const chapter = Number(parts[1]);
  const verse = Number(parts[2]);
  if (!book || !Number.isInteger(chapter) || !Number.isInteger(verse)) return null;
  return { book, chapter, verse };
}

export interface OsisRange {
  book: string;
  chapterStart: number;
  chapterEnd: number;
  verseStart: number;
  verseEnd: number;
}

/**
 * Parse an OSIS "To Verse" cell — either a single verse (`Rom.5.8`) or a range
 * (`John.1.1-John.1.3`). The right side of a range may be a full ref or a bare
 * `chapter.verse` that inherits the start book. Cross-book ranges (rare in TSK) are keyed
 * to the start book.
 */
export function parseOsisRange(ref: string): OsisRange | null {
  const sides = ref.trim().split('-');
  const start = parseOsisVerse(sides[0]);
  if (!start) return null;

  if (sides.length === 1) {
    return {
      book: start.book,
      chapterStart: start.chapter,
      chapterEnd: start.chapter,
      verseStart: start.verse,
      verseEnd: start.verse,
    };
  }

  const endParts = sides[1].split('.');
  let endChapter: number;
  let endVerse: number;
  if (endParts.length === 3) {
    const end = parseOsisVerse(sides[1]);
    if (!end) return null;
    endChapter = end.chapter;
    endVerse = end.verse;
  } else if (endParts.length === 2) {
    endChapter = Number(endParts[0]);
    endVerse = Number(endParts[1]);
    if (!Number.isInteger(endChapter) || !Number.isInteger(endVerse)) return null;
  } else {
    return null;
  }

  return {
    book: start.book,
    chapterStart: start.chapter,
    chapterEnd: endChapter,
    verseStart: start.verse,
    verseEnd: endVerse,
  };
}
