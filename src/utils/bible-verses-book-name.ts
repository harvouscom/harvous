/**
 * Translate a detector-canonical book name into the spelling `BibleVerses` stores.
 *
 * The app has two canons: `parseScriptureReference` resolves to the name in
 * `BIBLE_STUDY_KEYWORDS`, while the verse rows — and `bible-chapters.json`, and therefore
 * every book list in the UI — use the spelling the translations shipped with. They agree on
 * all sixty-six today, so this is currently the identity function.
 *
 * It is kept because they have not always agreed, and the failure was invisible. The detector
 * said "Song of Songs" where the text was filed under "Song of Solomon", so
 * `WHERE book = 'Song of Songs'` matched nothing and the book was simply unreachable — no
 * chapter, no pack, and a 404 that read like missing data rather than a missing translation
 * step. Three separate places grew hand-written aliases before anyone noticed the cause.
 *
 * The mapping is derived, not declared: the storage name is whichever book in the chapters
 * data the detector itself canonicalises to the name in hand. So a future divergence — a
 * reseed under a different spelling, a renamed keyword — is absorbed here instead of
 * silently removing a book.
 */

import { orderedCanonBooks } from './bible-book-chapters';
import { parseScriptureReference } from './scripture-detector';

let map: Map<string, string> | null = null;

function buildMap(): Map<string, string> {
  const built = new Map<string, string>();
  for (const storageName of orderedCanonBooks()) {
    const parsed = parseScriptureReference(`${storageName} 1`);
    // Identity while the canons agree; a divergent name lands under its own key.
    built.set(parsed?.book ?? storageName, storageName);
  }
  return built;
}

/**
 * The name to query `BibleVerses` with. Returns the input unchanged when it is already the
 * storage spelling, so this is safe to apply to any book name.
 */
export function bibleVersesBookName(canonicalBook: string): string {
  if (!map) map = buildMap();
  return map.get(canonicalBook) ?? canonicalBook;
}
