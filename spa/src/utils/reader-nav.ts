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
  search: { v: string | undefined; t: string };
} | null {
  const parsed = parseScriptureReference(reference);
  if (!parsed?.book || !parsed.chapter) return null;
  const verseStart = Array.isArray(parsed.verse) ? parsed.verse[0] : parsed.verse;
  return {
    to: prototypeReadRouteTo(),
    params: { book: bookSlug(parsed.book), chapter: String(parsed.chapter) },
    search: { v: verseStart ? String(verseStart) : undefined, t: translation },
  };
}
