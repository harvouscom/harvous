import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { MIN_SEARCH_QUERY_LENGTH } from '@/utils/search-query';
import { isResolvableScriptureReference } from '@/utils/scripture-detector';

export type VerseSearchHit = {
  book: string;
  chapter: number;
  verse: number;
  reference: string;
  /** Verse text with matches marked — render with `splitVerseSnippet`. */
  snippet: string;
  translation: string;
};

export type VerseSearchResponse = {
  results: VerseSearchHit[];
  hasMore: boolean;
  query: string;
  translation: string;
};

/** Enough for a tab of its own; the All tab shows the first few of the same answer. */
export const VERSE_SEARCH_PAGE = 25;

/**
 * Pure: whether a query should search verse text at all.
 *
 * Not a reference: "John 3:16" already gets the passage row, which is the exact answer, and the
 * words "John" and "3" matched against every verse would bury it under noise.
 */
export function shouldSearchVerseText(query: string): boolean {
  const trimmed = query.trim();
  return trimmed.length >= MIN_SEARCH_QUERY_LENGTH && !isResolvableScriptureReference(trimmed);
}

/**
 * Word search over the whole Bible in one translation — the Library panel's "In the Bible".
 *
 * Holds the previous answer while the next one loads, the same bargain the note search makes,
 * so the group does not blink out and back on every debounced keystroke.
 */
export function useScriptureVerseSearch(query: string, translation: string) {
  const trimmed = query.trim();
  const enabled = shouldSearchVerseText(trimmed);
  // auth-gate-exempt: /api/scripture/search has no requireAuth and no user scope — Scripture is
  // the same text for every reader, and a guest looking for a verse is who this is for.
  return useQuery({
    queryKey: ['scripture', 'verse-search', translation, trimmed.toLowerCase()] as const,
    enabled,
    staleTime: Infinity,
    gcTime: 10 * 60 * 1000,
    placeholderData: (previous, previousQuery) =>
      enabled && previousQuery?.queryKey[2] === translation ? previous : undefined,
    retry: (failureCount, error) => {
      const status = (error as { status?: number } | null)?.status;
      if (status === 400 || status === 429) return false;
      return failureCount < 1;
    },
    queryFn: () => {
      const params = new URLSearchParams({
        q: trimmed,
        translation,
        limit: String(VERSE_SEARCH_PAGE),
      });
      return api.get<VerseSearchResponse>(`/api/scripture/search?${params.toString()}`);
    },
  });
}
