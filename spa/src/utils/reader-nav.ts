import { parseScriptureReference } from '@/utils/scripture-detector';
import { bookSlug } from '@/utils/bible-book-chapters';
import { prototypeReadRouteTo } from '@/lib/prototype-path';

/**
 * The reader's own route + params/search for a canonical reference — the same shape
 * `PrototypeNotePage`'s `warmReaderForPassage` and `handleExpandScriptureToReader` build
 * inline for `router.preloadRoute()` / `navigate()`. Pulled out here because retiring the
 * standalone scripture-passage pane (see `spa/src/pages/prototype/
 * PrototypeStandaloneScripturePassagePane.tsx`, now deleted) gave this conversion a third,
 * fourth and fifth call site — the sidebar's Highlights fallback, the Home "passage you keep
 * returning to" card, and the note page's unresolved-scripture-dock handler all now open the
 * reader instead of that pane.
 *
 * Returns null when the reference does not parse — callers should no-op rather than navigate
 * to a malformed route.
 */
export function readerRouteForReference(
  reference: string,
  translation: string,
): {
  to: ReturnType<typeof prototypeReadRouteTo>;
  params: { book: string; chapter: string };
  search: { v: string | undefined; vEnd: string | undefined; t: string };
} | null {
  const parsed = parseScriptureReference(reference);
  if (!parsed?.book || !parsed.chapter) return null;
  /*
   * Both ends, not just the first verse. `parseScriptureReference` has always returned a
   * tuple for a range, and every caller here used to drop `[1]` on the floor — so opening
   * "John 3:16-18" landed on 16 and left 17-18 dimmed with the rest of the chapter, which
   * is precisely the context the reference was naming.
   */
  const verseStart = Array.isArray(parsed.verse) ? parsed.verse[0] : parsed.verse;
  const verseEnd = Array.isArray(parsed.verse) ? parsed.verse[1] : parsed.verse;
  /*
   * A chapter-only reference singles out nothing, so it should focus nothing.
   *
   * `parseScriptureReference` expands "John 3" to verses 1-36 for lookup, and putting that
   * back on the URL would both scroll the reader to verse 1 for no reason and bake this
   * chapter's verse count into a link that outlives it. A colon is the only verse separator
   * the parser accepts, so its absence is exactly "no verse was named".
   */
  const namesAVerse = reference.includes(':');
  return {
    to: prototypeReadRouteTo(),
    params: { book: bookSlug(parsed.book), chapter: String(parsed.chapter) },
    search: {
      v: namesAVerse && verseStart ? String(verseStart) : undefined,
      // Omitted when it would only repeat `v` — a single verse should not carry a range.
      vEnd: namesAVerse && verseEnd && verseEnd !== verseStart ? String(verseEnd) : undefined,
      t: translation,
    },
  };
}
