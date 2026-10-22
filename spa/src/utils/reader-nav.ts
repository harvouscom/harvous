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
 *
 * **Leave `translation` out unless the passage has one of its own.** No `t` means the reader
 * opens in My Bible — the account default, followed live — and that is what almost every
 * internal door wants. `?t=` pins a version, which is right for a shared link (it reads in
 * what it was shared in), a pill set to a translation, or a highlight made in one. It is wrong
 * for "open the reader here": Home, Continue reading and Today's passage each passed the
 * default along explicitly, and a cold cache or a stale reading position turned that into a
 * pinned NET that the My Bible setting could not override.
 */
export function readerRouteForReference(
  reference: string,
  /** Omitted, the reader opens in the account's default translation. */
  translation?: string | null,
): {
  to: ReturnType<typeof prototypeReadRouteTo>;
  params: { book: string; chapter: string };
  search: { v: string | undefined; vEnd: string | undefined; t: string | undefined };
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
      t: translation || undefined,
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
  const route = readerRouteForReference(rawRef, search.t);
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
