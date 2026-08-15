/**
 * Translate a detector-canonical book name into the spelling `BibleVerses` stores.
 *
 * The app has two canons and they do not quite agree. `parseScriptureReference` resolves to
 * the name in `BIBLE_STUDY_KEYWORDS`, while the verse rows — and `bible-chapters.json`, and
 * therefore every book list in the UI — use the spelling the translations shipped with. For
 * sixty-five books these are the same string. For one they are not: the detector says "Song of
 * Songs" and the text is filed under "Song of Solomon", so `WHERE book = 'Song of Songs'`
 * matched nothing and the book was simply unreachable — no chapter, no pack, no error beyond
 * a 404 that looked like missing data rather than a missing translation step.
 *
 * Resolved by asking the question backwards: the storage name is whichever book in the
 * chapters data the detector *itself* canonicalises to the name in hand. That keeps working if
 * another spelling drifts, and needs no hand-maintained alias list to be kept in step.
 */

import { orderedCanonBooks } from './bible-book-chapters';
import { parseScriptureReference } from './scripture-detector';

let map: Map<string, string> | null = null;

function buildMap(): Map<string, string> {
  const built = new Map<string, string>();
  for (const storageName of orderedCanonBooks()) {
    const parsed = parseScriptureReference(`${storageName} 1`);
    // Identity for the sixty-five that agree; the divergent one lands under its own key.
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
