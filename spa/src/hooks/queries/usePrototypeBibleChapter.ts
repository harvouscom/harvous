import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { api } from '../../lib/api';

export interface BibleChapterVerse {
  number: number;
  text: string;
}

export interface BibleChapterResponse {
  book: string;
  chapter: number;
  translation: string;
  chapterCount: number | null;
  hasPrevChapter: boolean;
  hasNextChapter: boolean;
  verses: BibleChapterVerse[];
}

/**
 * A chapter of Scripture as structured verses.
 *
 * No `useAuthReady()` gate: Scripture is the same text for everyone and the route carries no
 * user scope, so gating it would delay the reader's only content behind a session that has no
 * bearing on it. Margins and highlights layered over the chapter are per-user and gate
 * themselves.
 *
 * Chapter text never changes, so it is cached hard — re-reading a chapter you were in five
 * minutes ago should not refetch.
 */
export function usePrototypeBibleChapter(
  book: string | undefined,
  chapter: number | undefined,
  translation: string,
) {
  // auth-gate-exempt: /api/scripture/chapter has no requireAuth and no user scope — Scripture is
  // the same text for every reader. Gating it would hold the reader's only content behind a
  // session it does not consult.
  return useQuery(bibleChapterQueryOptions(book, chapter, translation));
}

/**
 * One definition of the chapter query, shared by the hook and by prefetching.
 *
 * Kept in a single place on purpose: a prefetch that builds its own key or its own fetcher
 * warms a cache entry the hook never reads, which looks like it works and silently does
 * nothing. Same key, same function, same caching — or the prefetch is a lie.
 */
export function bibleChapterQueryOptions(
  book: string | undefined,
  chapter: number | undefined,
  translation: string,
) {
  return {
    queryKey: ['prototype', 'bible-chapter', book, chapter, translation] as const,
    enabled: Boolean(book) && Number.isInteger(chapter) && (chapter ?? 0) > 0,
    staleTime: Infinity,
    gcTime: 60 * 60 * 1000,
    retry: (failureCount: number, error: unknown) => {
      // A missing chapter/translation is an answer, not a blip — retrying just delays
      // the empty state the reader already knows how to show.
      const status = (error as { status?: number } | null)?.status;
      if (status === 404 || status === 400) return false;
      return failureCount < 2;
    },
    queryFn: async () => {
      const params = new URLSearchParams({
        book: book!,
        chapter: String(chapter),
        translation,
      });
      return api.get<BibleChapterResponse>(`/api/scripture/chapter?${params.toString()}`);
    },
  };
}

/**
 * Warm the chapters either side of the one being read.
 *
 * Chapter text is immutable and already cached forever, so the only time a reader ever waits
 * is the first visit to a given chapter — and the overwhelmingly likely next chapter is the
 * one after this. Fetching both neighbours the moment a chapter settles turns next/previous
 * into a cache read, which is the difference between paging through a book and requesting it.
 *
 * Deliberately only ±1: prefetching a whole book would trade a spinner nobody sees for
 * bandwidth everybody pays.
 */
export function usePrefetchAdjacentChapters(
  book: string | undefined,
  chapter: number | undefined,
  translation: string,
  opts: { hasPrev?: boolean; hasNext?: boolean } = {},
) {
  const queryClient = useQueryClient();
  const { hasPrev, hasNext } = opts;
  useEffect(() => {
    if (!book || !Number.isInteger(chapter)) return;
    const targets: number[] = [];
    if (hasNext) targets.push((chapter as number) + 1);
    if (hasPrev) targets.push((chapter as number) - 1);
    for (const target of targets) {
      if (target < 1) continue;
      void queryClient.prefetchQuery(bibleChapterQueryOptions(book, target, translation));
    }
  }, [queryClient, book, chapter, translation, hasPrev, hasNext]);
}
