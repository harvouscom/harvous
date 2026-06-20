import bibleChaptersData from '@/data/bible-chapters.json';
import { normalizeScriptureReference, parseScriptureReference } from '@/utils/scripture-detector';

type BibleChapterRow = { book: string };

export type ScripturePassageDrillTarget = {
  bookOrder: number;
  passageKey: string;
};

export type ScriptureIndexPassageLike = {
  passageKey: string;
  displayRef: string;
  bookOrder: number;
  noteCount: number;
};

export type ScriptureIndexBookLike = {
  bookOrder: number;
  passages: ScriptureIndexPassageLike[];
};

function canonicalBookOrderMap(): Map<string, number> {
  const data = bibleChaptersData as BibleChapterRow[];
  const m = new Map<string, number>();
  let i = 0;
  for (const row of data) {
    if (!m.has(row.book)) {
      m.set(row.book, i++);
    }
  }
  const song = m.get('Song of Solomon');
  if (song !== undefined && !m.has('Song of Songs')) {
    m.set('Song of Songs', song);
  }
  return m;
}

function computePassageKey(reference: string): ScripturePassageDrillTarget | null {
  const norm = normalizeScriptureReference(reference.trim()) ?? reference.trim();
  const parsed = parseScriptureReference(norm);
  if (!parsed) return null;

  const bookOrder = canonicalBookOrderMap().get(parsed.book);
  if (bookOrder === undefined) return null;

  const chapter = parsed.chapter;
  const verse = parsed.verse;
  const verseStart = Array.isArray(verse) ? verse[0] : verse;
  const verseEnd = Array.isArray(verse) ? verse[1] : verse;
  const passageKey = `${bookOrder}:${chapter}:${verseStart}:${verseEnd}`;
  return { bookOrder, passageKey };
}

function refsMatch(a: string, b: string): boolean {
  return a.localeCompare(b, undefined, { sensitivity: 'accent' }) === 0;
}

function findIndexedPassage(
  books: ScriptureIndexBookLike[],
  reference: string,
): ScriptureIndexPassageLike | null {
  const trimmed = reference.trim();
  if (!trimmed) return null;

  const normalized = normalizeScriptureReference(trimmed) ?? trimmed;

  for (const book of books) {
    for (const passage of book.passages) {
      if (refsMatch(passage.displayRef, normalized) || refsMatch(passage.displayRef, trimmed)) {
        return { ...passage, bookOrder: book.bookOrder };
      }
    }
  }

  const computed = computePassageKey(trimmed);
  if (!computed) return null;

  for (const book of books) {
    if (book.bookOrder !== computed.bookOrder) continue;
    const match = book.passages.find((p) => p.passageKey === computed.passageKey);
    if (match) {
      return { ...match, bookOrder: book.bookOrder };
    }
  }

  return null;
}

/**
 * Resolve a scripture reference to sidebar Scripture drill coordinates.
 * Prefers displayRef matches in the loaded index; falls back to computed passageKey.
 */
export function findScripturePassageDrill(
  books: ScriptureIndexBookLike[],
  reference: string,
): ScripturePassageDrillTarget | null {
  const indexed = findIndexedPassage(books, reference);
  if (indexed) {
    return { bookOrder: indexed.bookOrder, passageKey: indexed.passageKey };
  }
  return computePassageKey(reference.trim());
}

/** Drill coordinates only when the index lists at least one note for the passage. */
export function findScripturePassageWithNotes(
  books: ScriptureIndexBookLike[],
  reference: string,
): ScripturePassageDrillTarget | null {
  const passage = findIndexedPassage(books, reference);
  if (!passage || passage.noteCount <= 0) return null;
  return { bookOrder: passage.bookOrder, passageKey: passage.passageKey };
}
