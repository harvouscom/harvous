/**
 * "Did you mean John 3:16?" for a reference the detector can't read.
 *
 * The detector only knows each book's full name and a short list of abbreviations, so
 * `rom 8:28` becomes a draft but `roma 8:28`, `joh 3:16`, `1 co 13:4` and `song 2:1` stay
 * plain text with no feedback. This reads the text before the caret, finds a book-ish word
 * followed by a chapter (and maybe a verse), and offers the books it could be.
 *
 * Suggestions only — nothing is rewritten until the person accepts one. Each candidate is
 * checked against the canon (`Amos 5:30` doesn't exist), which is also what keeps a time like
 * "am 5:30" from offering Amos.
 */

import { BIBLE_STUDY_KEYWORDS } from './bible-study-keywords';
import { orderedCanonBooks } from './bible-book-chapters';
import {
  checkScriptureReferenceValidity,
  detectScriptureReferences,
  getBookNameVariations,
  resolveCanonicalBookName,
} from './scripture-detector';

export interface BookSuggestion {
  /** Offset in the input text where the typed book starts. */
  bookStart: number;
  /** Offset just past the typed book (exclusive). */
  bookEnd: number;
  /** The book exactly as typed, e.g. "joh". */
  typedBook: string;
  /** The chapter/verse tail as typed, e.g. "3:16". */
  tail: string;
  /** Canonical book names, best first. */
  books: string[];
}

const MAX_SUGGESTIONS = 3;
/** A book is at most three words: "song of sol", "first co". */
const MAX_BOOK_WORDS = 3;

const TAIL_AT_END = /(?:^|\s)(\d{1,3}(?::\d{1,3}(?:[-–—]\d{0,3})?)?)$/;

/** Lowercase, collapse spaces, and split a numbered prefix off its book: "1co" → "1 co". */
function normalizeBookText(text: string): string {
  return text
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/\s+/g, ' ')
    .replace(/^([1-3])\s?(?=[a-z])/, '$1 ')
    .trim();
}

type BookNames = { book: string; names: string[] };

let bookNamesCache: BookNames[] | null = null;

function bookNames(): BookNames[] {
  if (bookNamesCache) return bookNamesCache;
  bookNamesCache = BIBLE_STUDY_KEYWORDS.filter((k) => k.category === 'book').map((k) => ({
    book: k.name,
    // "first book" / "second book" are keyword synonyms for Genesis/Exodus, not things anyone
    // types in front of a chapter number.
    names: [k.name, ...k.synonyms.filter((s) => !/\bbook\b/i.test(s))].map(normalizeBookText),
  }));
  return bookNamesCache;
}

/** Enough letters to mean something: one after a book number ("1c"), two otherwise ("ge"). */
function isLongEnough(normalized: string): boolean {
  const numbered = /^[1-3] /.test(normalized);
  const letters = normalized.replace(/[^a-z]/g, '').length;
  return numbered ? letters >= 1 : letters >= 2;
}

function booksMatching(typed: string, tail: string): string[] {
  const normalized = normalizeBookText(typed);
  if (!isLongEnough(normalized)) return [];

  const matches = bookNames()
    .filter(({ names }) => names.some((name) => name.startsWith(normalized)))
    .map(({ book }) => book)
    // A trailing dash is mid-typing ("3:16-"); judge the reference without it.
    .filter((book) => checkScriptureReferenceValidity(`${book} ${tail.replace(/[-–—]$/, '')}`).ok);
  if (matches.length === 0) return [];

  // The detector's own pick goes first, so accepting with Tab agrees with how the same text
  // would resolve elsewhere; the rest stay in canon order.
  const preferred = resolveCanonicalBookName(typed, getBookNameVariations());
  const canon = orderedCanonBooks();
  const order = (book: string) => {
    const i = canon.indexOf(book);
    return i === -1 ? canon.length : i;
  };
  return [...matches]
    .sort((a, b) => {
      if (a === preferred) return -1;
      if (b === preferred) return 1;
      return order(a) - order(b);
    })
    .slice(0, MAX_SUGGESTIONS);
}

/**
 * Books the reference ending at the end of `textBeforeCaret` could mean, or null when there is
 * nothing to suggest — including when the detector already reads it (that path drafts it).
 */
export function suggestBooksForTypedReference(textBeforeCaret: string): BookSuggestion | null {
  const tailMatch = TAIL_AT_END.exec(textBeforeCaret);
  if (!tailMatch) return null;
  const tail = tailMatch[1];
  const beforeTail = textBeforeCaret.slice(0, textBeforeCaret.length - tail.length);
  if (!/\s$/.test(beforeTail)) return null;
  const bookText = beforeTail.replace(/\s+$/, '');

  // Shortest candidate first, so "I read joh 3:16" tries "joh" before "read joh".
  for (let words = 1; words <= MAX_BOOK_WORDS; words++) {
    const pattern = new RegExp(
      `(?:^|[^A-Za-z0-9])((?:[1-3]\\s?)?[A-Za-z]+(?:\\s+[A-Za-z]+){${words - 1}})$`,
    );
    const m = pattern.exec(bookText);
    if (!m) break;
    const typedBook = m[1];
    const bookStart = bookText.length - typedBook.length;

    // Already a reference the detector reads — the draft path owns it.
    if (detectScriptureReferences(`${typedBook} ${tail}`).length > 0) return null;

    const books = booksMatching(typedBook, tail);
    if (books.length > 0) {
      return { bookStart, bookEnd: bookText.length, typedBook, tail, books };
    }
  }
  return null;
}
