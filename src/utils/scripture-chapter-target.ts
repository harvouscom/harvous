/**
 * Resolve an untrusted (book, chapter) pair against the canon.
 *
 * Shared by everything that records *a chapter someone was on* — reading events and
 * last-read position — because both take the pair from a client and both key on the
 * canonical book order. Resolving in one place is what keeps those two records
 * describing the same chapter.
 */

import { getBookChapterCount } from './scripture-detector';
import { canonicalBookOrderMap } from './scripture-passage-drill';

export type ScriptureChapterTarget = {
  /** Canonical book name, e.g. "John". */
  book: string;
  /** Canonical position (0-based, Genesis = 0), matching the space scripture index. */
  bookOrder: number;
  chapter: number;
};

/**
 * Null unless the book is canonical and the chapter exists inside it.
 *
 * `bookOrder` is always derived here rather than accepted from the caller: it is the key
 * consumers group by, so a stale or invented one would quietly split a book's history in
 * two rather than failing where it could be noticed.
 */
export function resolveScriptureChapterTarget(
  book: unknown,
  chapter: unknown,
): ScriptureChapterTarget | null {
  if (typeof book !== 'string' || !book.trim()) return null;
  const trimmedBook = book.trim();

  const bookOrder = canonicalBookOrderMap().get(trimmedBook);
  if (bookOrder === undefined) return null;

  if (typeof chapter !== 'number' || !Number.isInteger(chapter) || chapter < 1) return null;
  const chapterCount = getBookChapterCount(trimmedBook);
  if (!chapterCount || chapter > chapterCount) return null;

  return { book: trimmedBook, bookOrder, chapter };
}

/** Normalize a translation code, or null when it isn't one. */
export function normalizeTranslationCode(translation: unknown): string | null {
  if (typeof translation !== 'string' || !translation.trim()) return null;
  const code = translation.trim().toUpperCase();
  return code.length > 16 ? null : code;
}
