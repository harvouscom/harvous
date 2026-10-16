/**
 * Where a person has been in the Bible, chapter by chapter — the shape behind "My Bible".
 *
 * A map of study, not a reading tracker. The North Star rules out plans and streaks
 * (docs/future/HARVOUS_NORTH_STAR.md), so nothing here knows about dates, targets or a
 * whole-Bible total. A chapter has a level and a book has a count, and that is all.
 *
 * Levels, highest wins:
 *
 *   0  not yet
 *   1  read — a reader session past the glance threshold
 *   2  wrote or highlighted — cited by one of your notes, or marked in the text
 *   3  studied deeply — a level-2 chapter you have kept coming back to
 *
 * Level 3 is scored from the chapter's Study Bible node. Exposure is left out on purpose:
 * every real save of a note re-touches its cited chapters with `exposure`, so it measures how
 * often you pressed keys near a reference, not how much you studied it.
 *
 * Pure. Shared by the server loader and the client, so one definition of a level is all
 * either side ever draws.
 */

import { bookChapterCount, bookFromSlug, orderedCanonBooks } from './bible-book-chapters';

export type CoverageLevel = 0 | 1 | 2 | 3;

export interface ChapterRef {
  book: string;
  chapter: number;
}

/** The orthogonal counters a `chapter:` node carries, minus exposure (see the file comment). */
export interface ChapterDepthCounts {
  revisitCount: number;
  explicitConnectionCount: number;
  expansionCount: number;
  synthesisCount: number;
  reviewCount: number;
}

export interface BibleCoverageInput {
  read: ChapterRef[];
  /** One entry per (note, chapter) — the same chapter from two notes counts toward depth. */
  cited: Array<ChapterRef & { noteId: string }>;
  highlighted: ChapterRef[];
  depth: Array<ChapterRef & ChapterDepthCounts>;
}

export interface BibleCoverageBook {
  book: string;
  chapterCount: number;
  /** One per chapter, chapter 1 first. */
  levels: CoverageLevel[];
}

export interface BibleCoverage {
  /** Only books with at least one chapter above 0, in canon order. */
  books: BibleCoverageBook[];
}

/** A level-2 chapter at or above this is drawn as studied deeply. */
export const DEEP_STUDY_SCORE = 6;

/**
 * Coming back on purpose counts once; doing something about it counts twice. A second note
 * that cites the chapter is doing something about it, too.
 */
export function chapterDepthScore(counts: ChapterDepthCounts, citingNotes = 0): number {
  return (
    counts.revisitCount +
    2 *
      (counts.explicitConnectionCount +
        counts.expansionCount +
        counts.synthesisCount +
        counts.reviewCount) +
    2 * Math.max(0, citingNotes - 1)
  );
}

/** The canonical name for whatever a source stored, or null when it names no book. */
export function canonicalCoverageBook(raw: string): string | null {
  if (!raw) return null;
  return bookFromSlug(raw.trim());
}

/** `${book}|${chapter}` for a chapter that exists in the canon, or null. */
function chapterSlot(ref: ChapterRef): string | null {
  const book = canonicalCoverageBook(ref.book);
  if (!book || !Number.isInteger(ref.chapter) || ref.chapter < 1) return null;
  const count = bookChapterCount(book);
  if (count == null || ref.chapter > count) return null;
  return `${book}|${ref.chapter}`;
}

/** Every chapter a range touches: "Exodus 6:28–7:7" is chapter 6 and chapter 7. */
export function chaptersInRange(book: string, chapter: number, chapterEnd?: number | null): ChapterRef[] {
  const end = chapterEnd && chapterEnd > chapter ? chapterEnd : chapter;
  const out: ChapterRef[] = [];
  for (let c = chapter; c <= end; c++) out.push({ book, chapter: c });
  return out;
}

export function buildBibleCoverage(input: BibleCoverageInput): BibleCoverage {
  const level = new Map<string, CoverageLevel>();
  const raise = (slot: string | null, to: CoverageLevel) => {
    if (!slot) return;
    if ((level.get(slot) ?? 0) < to) level.set(slot, to);
  };

  for (const ref of input.read) raise(chapterSlot(ref), 1);
  for (const ref of input.highlighted) raise(chapterSlot(ref), 2);

  const citingNotes = new Map<string, Set<string>>();
  for (const ref of input.cited) {
    const slot = chapterSlot(ref);
    if (!slot) continue;
    raise(slot, 2);
    const notes = citingNotes.get(slot) ?? new Set<string>();
    notes.add(ref.noteId);
    citingNotes.set(slot, notes);
  }

  const depthBySlot = new Map<string, ChapterDepthCounts>();
  for (const row of input.depth) {
    const slot = chapterSlot(row);
    if (slot) depthBySlot.set(slot, row);
  }

  // Depth only ever deepens a chapter you wrote on or marked. Reading it twenty times is
  // reading it, and stays level 1.
  for (const [slot, current] of level) {
    if (current !== 2) continue;
    const counts = depthBySlot.get(slot) ?? {
      revisitCount: 0,
      explicitConnectionCount: 0,
      expansionCount: 0,
      synthesisCount: 0,
      reviewCount: 0,
    };
    if (chapterDepthScore(counts, citingNotes.get(slot)?.size ?? 0) >= DEEP_STUDY_SCORE) {
      level.set(slot, 3);
    }
  }

  const books: BibleCoverageBook[] = [];
  for (const book of orderedCanonBooks()) {
    const count = bookChapterCount(book) ?? 0;
    let any = false;
    const levels: CoverageLevel[] = [];
    for (let c = 1; c <= count; c++) {
      const l = level.get(`${book}|${c}`) ?? 0;
      if (l > 0) any = true;
      levels.push(l);
    }
    if (any) books.push({ book, chapterCount: count, levels });
  }

  return { books };
}

// ─── Reading the shape (client and copy) ─────────────────────────────────────

/** Chapters at level 1 or above — the "12" in "12 of 21". */
export function chaptersBeenIn(levels: readonly CoverageLevel[]): number {
  let n = 0;
  for (const l of levels) if (l > 0) n++;
  return n;
}

/** The deepest level anywhere in the book — the spine's tone. */
export function deepestLevel(levels: readonly CoverageLevel[]): CoverageLevel {
  let max: CoverageLevel = 0;
  for (const l of levels) if (l > max) max = l;
  return max;
}

/**
 * The book you have spent the most on: the sum of its levels, so a book you wrote through
 * outweighs one you skimmed end to end. Ties go to canon order, which is at least stable.
 */
export function mostStudiedBook(books: readonly BibleCoverageBook[]): string | null {
  let best: { book: string; weight: number } | null = null;
  for (const b of books) {
    const weight = b.levels.reduce<number>((sum, l) => sum + l, 0);
    if (weight > 0 && (!best || weight > best.weight)) best = { book: b.book, weight };
  }
  return best?.book ?? null;
}

/** A book's levels, or all zeros for a book the payload left out. */
export function levelsForBook(coverage: BibleCoverage | undefined, book: string): CoverageLevel[] {
  const found = coverage?.books.find((b) => b.book === book);
  if (found) return found.levels;
  return Array.from({ length: bookChapterCount(book) ?? 0 }, () => 0 as CoverageLevel);
}

/**
 * A map drawn from book names alone — the family's Bible, which never carries chapters. Every
 * chapter of a book the household has been in reads as "been in", so a spine is simply full or
 * empty and the section dots still count books. Unknown names are dropped.
 */
export function coverageFromBooks(books: readonly string[]): BibleCoverage {
  const wanted = new Set(books.map((b) => canonicalCoverageBook(b)).filter((b): b is string => !!b));
  return {
    books: orderedCanonBooks()
      .filter((book) => wanted.has(book))
      .map((book) => {
        const chapterCount = bookChapterCount(book) ?? 0;
        return { book, chapterCount, levels: Array.from({ length: chapterCount }, () => 1 as CoverageLevel) };
      }),
  };
}
