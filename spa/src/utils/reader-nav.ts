import { parseScriptureReference } from '@/utils/scripture-detector';
import { bookSlug } from '@/utils/bible-book-chapters';
import {
  matchPrototypeNoteId,
  prototypeNoteRouteTo,
  prototypeReadRouteTo,
} from '@/lib/prototype-path';

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
  const verseStart = Array.isArray(parsed.verse) ? parsed.verse[0] : parsed.verse;
  const verseEnd = Array.isArray(parsed.verse) ? parsed.verse[1] : parsed.verse;
  const namesAVerse = reference.includes(':');
  return {
    to: prototypeReadRouteTo(),
    params: { book: bookSlug(parsed.book), chapter: String(parsed.chapter) },
    search: {
      v: namesAVerse && verseStart ? String(verseStart) : undefined,
      vEnd: namesAVerse && verseEnd && verseEnd !== verseStart ? String(verseEnd) : undefined,
      t: translation,
    },
  };
}

export type ReadRouteSearch = {
  v?: string;
  vEnd?: string;
  t?: string;
  c?: string;
  ref?: string;
  req?: string;
};

export function sanitizeReadSearch(search: ReadRouteSearch): ReadRouteSearch {
  const rawRef = search.ref?.trim();
  if (!rawRef) return search;
  const parsed = parseScriptureReference(rawRef);
  if (!parsed) return search;
  const route = readerRouteForReference(rawRef, search.t || 'NET');
  return {
    ...search,
    v: search.v || route?.search.v,
    vEnd: search.vEnd || route?.search.vEnd,
    ref: undefined,
  };
}

let landingRequests = 0;

function stayOnStackedReaderNote(): {
  to: ReturnType<typeof prototypeNoteRouteTo>;
  params: { noteId: string };
  search: { req: string };
  replace: true;
} | null {
  if (typeof window === 'undefined') return null;
  const noteId = matchPrototypeNoteId(window.location.pathname);
  if (!noteId) return null;
  if (!new URLSearchParams(window.location.search).has('scriptureRef')) return null;
  if (!document.querySelector('.pds-paper-stack[data-origin-kind="reader"]')) return null;
  landingRequests += 1;
  return {
    to: prototypeNoteRouteTo(),
    params: { noteId },
    search: { req: `${Date.now()}-${landingRequests}` },
    replace: true,
  };
}

/**
 * The same route, stamped so it lands again even when you are already on it.
 *
 * Exception: a margin-bar note opens with `?scriptureRef=` while the chapter is stacked
 * behind it. If that passage has no pill in the note, the dock falls back through this
 * helper to the reader — which is the bounce `/fZLESFI?scriptureRef=Exodus+5:1` →
 * `/read/exodus/5?req=`. When the stacked origin is already that chapter, stay on the
 * note and drop the deep-link instead.
 */
export function landAgain<T extends { search: Record<string, unknown> }>(
  route: T,
): (Omit<T, 'search'> & { search: T['search'] & { req: string } }) | {
  to: ReturnType<typeof prototypeNoteRouteTo>;
  params: { noteId: string };
  search: { req: string };
  replace: true;
} {
  const destTo = String((route as { to?: unknown }).to ?? '');
  if (destTo.includes('read')) {
    const stay = stayOnStackedReaderNote();
    if (stay) return stay;
  }
  landingRequests += 1;
  return { ...route, search: { ...route.search, req: `${Date.now()}-${landingRequests}` } };
}
