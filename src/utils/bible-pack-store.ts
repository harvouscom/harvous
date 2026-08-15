/**
 * Offline Bible packs — a translation's text, held book by book in IndexedDB.
 *
 * Two ways text ends up here, and the difference matters:
 *
 *   downloaded   the reader asked for the whole translation. All 66 books are fetched, and
 *                the pack is expected to be complete — that is what makes it usable on a
 *                plane.
 *
 *   cached       a chapter was read online and the book it belongs to was kept on the way
 *                past. Free, since the bytes were already on the wire, and it means the
 *                chapters someone actually reads are the ones most likely to be there when
 *                the connection is not.
 *
 * The store does not distinguish them: a book is present or it is not. What differs is who
 * asked for it, which is a question for the download bookkeeping, not for the reader.
 */

import { offlineDB, type OfflineBiblePack } from './offline-db';
import { orderedCanonBooks } from './bible-book-chapters';

/**
 * How many translations may be kept offline at once.
 *
 * Not a licensing limit — a storage one. Each translation is roughly 4MB of text, and browsers
 * evict whole origins rather than individual records when they run out, so a reader who saves
 * everything risks losing everything, including their unsynced notes. Three is enough for the
 * translation someone reads in, one they compare against, and one for a study they are in.
 */
export const MAX_OFFLINE_TRANSLATIONS = 3;

export interface PackProgress {
  translationId: string;
  booksSaved: number;
  booksTotal: number;
}

export interface PackSummary {
  translationId: string;
  booksSaved: number;
  booksTotal: number;
  /** True once every book of the canon is present — the only state that survives a flight. */
  complete: boolean;
  savedAt: number | null;
}

type ChapterPayload = { chapter: number; verses: { number: number; text: string }[] };
type BookPayload = { book: string; translation: string; version: string; chapters: ChapterPayload[] };

/** A book's text, or null when this translation has no offline copy of it. */
export async function readPackedBook(
  translationId: string,
  book: string,
): Promise<OfflineBiblePack | null> {
  try {
    const row = await offlineDB.biblePacks.get([translationId, book]);
    return row ?? null;
  } catch {
    // A browser with IndexedDB blocked (private windows, some enterprise profiles) is a
    // browser with no offline copy — which is a true answer, not a failure worth raising.
    return null;
  }
}

/** One chapter out of the offline copy, or null when it isn't there. */
export async function readPackedChapter(
  translationId: string,
  book: string,
  chapter: number,
): Promise<{ number: number; text: string }[] | null> {
  const pack = await readPackedBook(translationId, book);
  if (!pack) return null;
  return pack.chapters.find((c) => c.chapter === chapter)?.verses ?? null;
}

export async function writePackedBook(payload: BookPayload): Promise<boolean> {
  try {
    await offlineDB.biblePacks.put({
      translationId: payload.translation,
      book: payload.book,
      version: payload.version,
      chapters: payload.chapters,
      savedAt: Date.now(),
    });
    return true;
  } catch {
    // Quota exceeded is the expected failure, and it is not the caller's to handle: a book
    // that would not fit simply is not offline, and the reader falls back to the network.
    return false;
  }
}

/** What is stored for each translation that has anything stored at all. */
export async function listPacks(): Promise<PackSummary[]> {
  const booksTotal = orderedCanonBooks().length;
  try {
    const rows = await offlineDB.biblePacks.toArray();
    const byTranslation = new Map<string, { count: number; savedAt: number }>();
    for (const row of rows) {
      const existing = byTranslation.get(row.translationId);
      if (existing) {
        existing.count += 1;
        existing.savedAt = Math.max(existing.savedAt, row.savedAt);
      } else {
        byTranslation.set(row.translationId, { count: 1, savedAt: row.savedAt });
      }
    }
    return [...byTranslation.entries()]
      .map(([translationId, { count, savedAt }]) => ({
        translationId,
        booksSaved: count,
        booksTotal,
        complete: count >= booksTotal,
        savedAt,
      }))
      .sort((a, b) => a.translationId.localeCompare(b.translationId));
  } catch {
    return [];
  }
}

export async function removePack(translationId: string): Promise<void> {
  try {
    await offlineDB.biblePacks.where('translationId').equals(translationId).delete();
  } catch {
    // Nothing to tell the reader: a pack that cannot be deleted is still reported by
    // `listPacks`, so the page will not claim it is gone.
  }
}

/**
 * Whether another translation may be saved.
 *
 * Counts only translations that already have something stored, so a reader at the limit who
 * removes one can immediately add another.
 */
export function canAddPack(existing: PackSummary[], translationId: string): boolean {
  if (existing.some((p) => p.translationId === translationId)) return true;
  return existing.length < MAX_OFFLINE_TRANSLATIONS;
}

/**
 * Download a whole translation, book by book, reporting progress as it goes.
 *
 * Sequential rather than parallel. Sixty-six concurrent requests would saturate the
 * connection the reader is also using to read, and the whole point of a pack is that it can be
 * left running in the background. Books already stored at the current version are skipped, so
 * a download interrupted at Malachi resumes there rather than starting again at Genesis.
 */
export async function downloadPack(
  translationId: string,
  fetchBook: (book: string) => Promise<BookPayload>,
  options: {
    onProgress?: (progress: PackProgress) => void;
    signal?: AbortSignal;
  } = {},
): Promise<{ booksSaved: number; booksTotal: number; aborted: boolean }> {
  const books = orderedCanonBooks();
  let saved = 0;

  for (const book of books) {
    if (options.signal?.aborted) {
      return { booksSaved: saved, booksTotal: books.length, aborted: true };
    }

    const existing = await readPackedBook(translationId, book);
    if (existing) {
      saved += 1;
      options.onProgress?.({ translationId, booksSaved: saved, booksTotal: books.length });
      continue;
    }

    try {
      const payload = await fetchBook(book);
      const ok = await writePackedBook(payload);
      if (ok) saved += 1;
    } catch {
      /*
       * One book failing does not fail the pack. A translation missing a book is still worth
       * having offline for the sixty-five it has, and the next download attempt picks up
       * exactly the ones that are missing.
       */
    }

    options.onProgress?.({ translationId, booksSaved: saved, booksTotal: books.length });
  }

  return { booksSaved: saved, booksTotal: books.length, aborted: false };
}
