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
 * The rows are identical either way — a book is present or it is not — so the difference is
 * recorded beside them, in `biblePackRequests`. It has to be recorded somewhere: this file
 * used to say the distinction was "a question for the download bookkeeping, not for the
 * reader", and the settings page is exactly a reader asking it. Reading one chapter each in
 * three versions produced three packs of one book, each offering to Finish a download nobody
 * started, and between them they spent the three-translation limit.
 *
 * So `listPacks` reports **requested** translations only. Cached books still answer
 * `readPackedChapter` on a plane, and once a translation *is* requested they count toward its
 * progress — a book already on the device is a book the download can skip.
 */

import { offlineDB, type OfflineBiblePack } from './offline-db';
import { orderedCanonBooks } from './bible-book-chapters';

/**
 * How many translations may be kept offline at once.
 *
 * Not a licensing limit — a storage one. Three is enough for the translation someone reads in,
 * one they compare against, and one for a study they are in.
 *
 * **The reasoning behind the number is weaker than it looks, and the measurements are here so
 * the next person does not have to take it on trust.** Measured Aug 2026 in Chrome: a
 * translation is 4.6MB stored (6.3MB as raw JSON), so all eleven would be ~51MB against a
 * 4.28GB origin quota — 1.2%. The app's own service-worker asset cache was 37.8MB at the time,
 * uncapped, which is 2.75× everything this limit governs.
 *
 * The stated fear — browsers evict whole origins rather than individual records, taking
 * unsynced notes with the scripture — is real, but a cap does not answer it: eviction is a
 * decision about the whole origin under device-wide pressure, and 51MB versus 14MB barely
 * enters into it. The lever that does is `navigator.storage.persist()`, which
 * `usePersistentStorage` now asks for at boot.
 *
 * So this stays at three for now, not because three is defensible on size, but because
 * persistence is not yet granted (Chrome declines it until a site earns engagement or is
 * installed). Raise it when it is — and prefer showing the reader the megabytes, which the
 * settings page now does, over rationing on their behalf.
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

/** Record that this translation is meant to be kept whole. Idempotent. */
export async function requestPack(translationId: string): Promise<void> {
  try {
    /* `put`, not `add`: asking twice for the same translation is what Finish does, and it
       should not throw on the second press. The stamp is refreshed because the newer ask is
       the one that explains why the download is running. */
    await offlineDB.biblePackRequests.put({ translationId, requestedAt: Date.now() });
  } catch {
    // Storage refused. The books still download and still read offline; the page will
    // simply not list the translation as a pack, which is the safe way to be wrong.
  }
}

/** Forget that this translation was asked for. Leaves the books alone. */
export async function unrequestPack(translationId: string): Promise<void> {
  try {
    await offlineDB.biblePackRequests.delete(translationId);
  } catch {
    // See `removePack` — a request that will not delete keeps being listed, so the page
    // never claims the pack is gone when it is not.
  }
}

/**
 * Count the books stored per translation, whoever put them there.
 *
 * Used both to report a requested pack's progress and to seed the request table below.
 */
async function countStoredBooks(): Promise<Map<string, { count: number; savedAt: number }>> {
  const byTranslation = new Map<string, { count: number; savedAt: number }>();
  const rows = await offlineDB.biblePacks.toArray();
  for (const row of rows) {
    const existing = byTranslation.get(row.translationId);
    if (existing) {
      existing.count += 1;
      existing.savedAt = Math.max(existing.savedAt, row.savedAt);
    } else {
      byTranslation.set(row.translationId, { count: 1, savedAt: row.savedAt });
    }
  }
  return byTranslation;
}

/**
 * Adopt pre-existing complete packs the first time the request table is read empty.
 *
 * Someone who downloaded three translations before this table existed must not open the page
 * and find them all gone. A *complete* pack is unambiguous evidence of intent — sixty-six
 * books do not accumulate by reading — so those are adopted.
 *
 * Partial ones are deliberately not: at one or two books they are the incidental caching this
 * whole change is about, and at forty they are an interrupted download that Save offline
 * resumes from exactly where it stopped, since `downloadPack` skips what is already stored.
 * Nothing is deleted either way, so the worst case is a label to re-apply in one press.
 *
 * Runs only against an empty table, which after the first deliberate request it never is.
 */
async function adoptLegacyCompletePacks(
  stored: Map<string, { count: number; savedAt: number }>,
  booksTotal: number,
): Promise<string[]> {
  const complete = [...stored.entries()]
    .filter(([, { count }]) => count >= booksTotal)
    .map(([translationId]) => translationId);
  if (complete.length === 0) return [];
  await offlineDB.biblePackRequests.bulkPut(
    complete.map((translationId) => ({
      translationId,
      /* Stamped from the pack rather than now, so "saved on" does not become "the day the
         table was added" for every one of them at once. */
      requestedAt: stored.get(translationId)?.savedAt ?? Date.now(),
    })),
  );
  return complete;
}

/**
 * The translations the reader asked to keep, and how far each has got.
 *
 * A requested translation with nothing stored yet is still listed, at 0 — that is a download
 * about to start or one that failed, and either way the page has to be able to say so.
 */
export async function listPacks(): Promise<PackSummary[]> {
  const booksTotal = orderedCanonBooks().length;
  try {
    const stored = await countStoredBooks();
    let requested = (await offlineDB.biblePackRequests.toArray()).map((r) => r.translationId);
    if (requested.length === 0) requested = await adoptLegacyCompletePacks(stored, booksTotal);

    return requested
      .map((translationId) => {
        const found = stored.get(translationId);
        const count = found?.count ?? 0;
        return {
          translationId,
          booksSaved: count,
          booksTotal,
          complete: count >= booksTotal,
          savedAt: found?.savedAt ?? null,
        };
      })
      .sort((a, b) => a.translationId.localeCompare(b.translationId));
  } catch {
    return [];
  }
}

/**
 * How much of the device the offline copies are actually using, in bytes.
 *
 * Measured rather than estimated from a per-translation constant: the packs differ in size
 * (the largest is about 13% bigger than the smallest), a partial pack is worth whatever it
 * has, and a number the reader can check has to be the real one.
 *
 * `navigator.storage.estimate()` is not used for this — it reports the whole origin, which
 * includes the service worker's asset cache and every note, and would answer a question about
 * translations with a number mostly about something else.
 *
 * Serialising every book to measure it is not free, so this is for the settings page that
 * asked, not for a render that happens to be nearby.
 */
export async function packStorageBytes(): Promise<number> {
  try {
    const rows = await offlineDB.biblePacks.toArray();
    /* Nothing stored is nothing used. Without this the empty case reports 2 bytes — the
       brackets of `JSON.stringify([])` — which is the kind of number that survives all the
       way to a reader being told their empty library takes up space. */
    if (rows.length === 0) return 0;
    /* `Blob` rather than a character count: the text is scripture in many languages and a
       `length` would under-report every multi-byte character in it. The array's own commas
       and brackets ride along, which at this scale is a rounding error on a megabyte. */
    return new Blob([JSON.stringify(rows)]).size;
  } catch {
    return 0;
  }
}

/** Drop the request and every book stored for it. */
export async function removePack(translationId: string): Promise<void> {
  await unrequestPack(translationId);
  try {
    await offlineDB.biblePacks.where('translationId').equals(translationId).delete();
  } catch {
    // Nothing to tell the reader: books that cannot be deleted are still readable offline,
    // and the request is gone either way, so the page will not claim a pack it does not show.
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
  /*
   * The intent is recorded here, before the first book, because this is the only function
   * that means "keep the whole translation" — and putting it anywhere else makes it possible
   * to forget. A pack that downloaded all 66 books with no request behind it would finish and
   * then not be listed at all: 4MB of Bible on the device under a row offering to save it.
   *
   * Before the loop rather than after it, so a download interrupted at book three comes back
   * as a pack to finish rather than three books nobody can see.
   */
  await requestPack(translationId);

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
