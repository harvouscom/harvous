/**
 * Which edit of the Bible text the server is serving.
 *
 * Scripture is cached as if it never changes — offline packs in IndexedDB are read before the
 * network, and the chapter and book endpoints are `immutable` for a day — so a correction to
 * `BibleVerses` reaches nobody who already has the old copy. Bump this when the text itself
 * changes and every one of those copies is treated as missing:
 *
 *   - `/api/scripture/book` stamps it into each pack's `version`, and `bible-pack-store` ignores
 *     books stored under an older one, so the reader refetches and the warm-up re-downloads.
 *   - the client adds it to the chapter and book URLs, so a browser or CDN copy cached under the
 *     old text is never asked for again.
 *
 * History:
 *   1  as first seeded
 *   2  Oct 2026 — spaces restored where poetry line breaks were stripped ("releasedand")
 */
export const BIBLE_TEXT_REVISION = 2;

/** Pack `version` suffix for the current revision: `NLT:31064:r2`. */
export const BIBLE_TEXT_REVISION_TAG = `r${BIBLE_TEXT_REVISION}`;

export function isCurrentBibleTextVersion(version: string | undefined): boolean {
  return typeof version === 'string' && version.endsWith(`:${BIBLE_TEXT_REVISION_TAG}`);
}

/** `/api/scripture/book` for one book, keyed to the current revision so no cached copy answers it. */
export function scriptureBookUrl(book: string, translation: string): string {
  const params = new URLSearchParams({ book, translation, rev: String(BIBLE_TEXT_REVISION) });
  return `/api/scripture/book?${params.toString()}`;
}
