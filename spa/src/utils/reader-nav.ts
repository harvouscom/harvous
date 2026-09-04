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

/**
 * The same route, stamped so it lands again even when you are already on it.
 *
 * Two things conspire without this. The router treats an identical URL as no navigation at
 * all, and the reader's landing — the focus that singles the verse out from the rest of the
 * chapter — is dismissible by a stray tap anywhere in the page. So following the same row,
 * pill or cross-reference a second time did nothing at all, which reads as the link having
 * quietly stopped working.
 *
 * `req` is what `PrototypeBibleReaderPane` keys its landing off (`landRequestKey`), so the
 * value only has to differ between taps — it never has to mean anything.
 *
 * Separate from `readerRouteForReference` rather than folded into it: that function answers
 * "where does this reference live", which is a fact and worth keeping pure and preloadable.
 * This one answers "and I am asking again now", which is about the gesture.
 */
let landingRequests = 0;

export function landAgain<T extends { search: Record<string, unknown> }>(
  route: T,
): Omit<T, 'search'> & { search: T['search'] & { req: string } } {
  /*
   * A counter, not `Date.now()` alone. The clock is only millisecond-resolution, so two asks
   * inside the same millisecond produce the same stamp and the second one is silently not a
   * navigation — the exact failure this function exists to prevent. The time is kept because
   * it makes a stamp legible in a URL someone is looking at; the counter is what makes it true.
   */
  landingRequests += 1;
  /*
   * The return type widens `search` rather than echoing `T`.
   *
   * It used to say it returned `T` unchanged, which was a lie in the one way that mattered:
   * this function's entire purpose is to add `req`, so every caller was handed a type with no
   * `req` on it. Nothing broke at the call sites — they pass the result straight to
   * `navigate`, and the read route's `validateSearch` accepts `req` — so the only place it
   * surfaced was a test reading the field back, which is exactly where a stamp should be
   * checked.
   */
  return { ...route, search: { ...route.search, req: `${Date.now()}-${landingRequests}` } };
}
