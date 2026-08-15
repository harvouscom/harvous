import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { api } from '../../lib/api';
import { adjacentChapter } from '@/utils/bible-book-chapters';

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
      try {
        const response = await api.get<BibleChapterResponse>(
          `/api/scripture/chapter?${params.toString()}`,
        );
        // Keep the book on the way past. The bytes for this chapter were already paid for;
        // fetching its neighbours costs one background request and means the chapters
        // someone actually reads are the ones most likely to be there offline.
        void cacheBookInBackground(book!, translation);
        return response;
      } catch (error) {
        /*
         * Fall back to the offline copy, if there is one.
         *
         * The test is whether the server ANSWERED, not whether an HTTP status came back. A 4xx
         * is an answer about this chapter — a 404 means the translation genuinely lacks it, and
         * serving stale text there would hide a real gap behind old words. A 5xx is not an
         * answer at all; it is the server saying it cannot produce one, which is the same
         * situation as the network being down.
         *
         * That distinction used to be drawn at "is there a status", which put 5xx on the wrong
         * side: with a complete pack in IndexedDB and the API returning 502, the reader spent
         * 10.8s over 12 requests to reach "That chapter didn't load", while the verses sat
         * 0.2ms away on disk.
         */
        const status = (error as { status?: number } | null)?.status;
        if (status != null && status < 500) throw error;

        const offline = await readOfflineChapter(book!, chapter!, translation);
        if (offline) return offline;
        throw error;
      }
    },
  };
}

/** A chapter assembled from the offline pack, shaped exactly like the endpoint's answer. */
async function readOfflineChapter(
  book: string,
  chapter: number,
  translation: string,
): Promise<BibleChapterResponse | null> {
  const { readPackedChapter } = await import('@/utils/bible-pack-store');
  const { bookChapterCount } = await import('@/utils/bible-book-chapters');

  const verses = await readPackedChapter(translation, book, chapter);
  if (!verses || verses.length === 0) return null;

  const chapterCount = bookChapterCount(book);
  return {
    book,
    chapter,
    translation,
    chapterCount,
    hasPrevChapter: chapter > 1,
    hasNextChapter: chapterCount != null ? chapter < chapterCount : false,
    verses,
  };
}

/**
 * Store the book this chapter belongs to, quietly, once.
 *
 * Deliberately not awaited by the query: the reader has its text and must not wait on a
 * megabyte of neighbouring chapters. `inFlight` keeps paging through a book from queuing the
 * same download once per chapter.
 */
const inFlight = new Set<string>();

async function cacheBookInBackground(book: string, translation: string): Promise<void> {
  const key = `${translation}:${book}`;
  if (inFlight.has(key)) return;
  inFlight.add(key);

  try {
    const { readPackedBook, writePackedBook } = await import('@/utils/bible-pack-store');
    if (await readPackedBook(translation, book)) return;

    const params = new URLSearchParams({ book, translation });
    const payload = await api.get<{
      book: string;
      translation: string;
      version: string;
      chapters: { chapter: number; verses: { number: number; text: string }[] }[];
    }>(`/api/scripture/book?${params.toString()}`);
    await writePackedBook(payload);
  } catch {
    // A book that did not cache is a book that is not offline. Nothing else changes.
  } finally {
    inFlight.delete(key);
  }
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
) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!book || !Number.isInteger(chapter)) return;
    /*
     * Follows the canon, not the book. The neighbour of Exodus 40 is Leviticus 1, and warming
     * only within a book would leave exactly the boundary crossings cold — the one place a
     * reader is most likely to hesitate.
     */
    for (const dir of [1, -1] as const) {
      const target = adjacentChapter(book, chapter as number, dir);
      if (!target) continue;
      /*
       * `retry: false` is the one option a prefetch may differ on. Nobody is waiting for a
       * neighbour, so its failure has no consequence worth three attempts — and with the
       * default policy the two prefetches retried alongside the real query, turning one
       * failing chapter into twelve requests and a ten-second wait. Key, fetcher and caching
       * stay identical; only how hard it tries changes.
       */
      void queryClient.prefetchQuery({
        ...bibleChapterQueryOptions(target.book, target.chapter, translation),
        retry: false,
      });
    }
  }, [queryClient, book, chapter, translation]);
}
