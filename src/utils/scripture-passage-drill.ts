import bibleChaptersData from '@/data/bible-chapters.json';
import { normalizeScriptureReference, parseScriptureReference } from '@/utils/scripture-detector';
import { scriptureReferenceContainsReference } from '@/utils/scripture-verse-keys';

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

export function canonicalBookOrderMap(): Map<string, number> {
  const data = bibleChaptersData as BibleChapterRow[];
  const m = new Map<string, number>();
  let i = 0;
  for (const row of data) {
    if (!m.has(row.book)) {
      m.set(row.book, i++);
    }
  }
  /*
   * Legacy tolerance, no longer a workaround. Both canons now say "Song of Solomon", but an
   * older native build's tag suggester said "Song of Songs", so a thread or tag name written
   * on that build can still arrive carrying it. Without the alias such a reference sorts to
   * the end of the canon instead of between Ecclesiastes and Isaiah.
   */
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

export type ScriptureIndexNoteBriefLike = {
  id: string;
  updatedAt: string | null;
  createdAt: string;
};

export type ScriptureIndexPassageWithNotesLike = ScriptureIndexPassageLike & {
  notes?: ScriptureIndexNoteBriefLike[];
};

export type ScriptureIndexBookWithNotesLike = {
  bookOrder: number;
  passages: ScriptureIndexPassageWithNotesLike[];
};

function noteRecencyMs(note: ScriptureIndexNoteBriefLike): number {
  const updated = note.updatedAt ? Date.parse(note.updatedAt) : NaN;
  if (Number.isFinite(updated)) return updated;
  const created = Date.parse(note.createdAt);
  return Number.isFinite(created) ? created : 0;
}

/** Notes citing a scripture reference, preferring the most recently updated note. */
export function findMostRecentNoteForScriptureReference(
  books: ScriptureIndexBookWithNotesLike[],
  reference: string,
): ScriptureIndexNoteBriefLike | null {
  const trimmed = reference.trim();
  if (!trimmed) return null;

  let best: ScriptureIndexNoteBriefLike | null = null;
  let bestMs = -1;

  for (const book of books) {
    for (const passage of book.passages) {
      if (!passage.notes?.length) continue;
      const exact =
        passage.displayRef.localeCompare(trimmed, undefined, { sensitivity: 'accent' }) === 0;
      const contains = !exact && scriptureReferenceContainsReference(passage.displayRef, trimmed);
      if (!exact && !contains) continue;
      for (const note of passage.notes) {
        const ms = noteRecencyMs(note);
        if (ms >= bestMs) {
          bestMs = ms;
          best = note;
        }
      }
    }
  }

  return best;
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
