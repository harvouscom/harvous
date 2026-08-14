import { useQuery } from '@tanstack/react-query';
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
  return useQuery({
    queryKey: ['prototype', 'bible-chapter', book, chapter, translation],
    enabled: Boolean(book) && Number.isInteger(chapter) && (chapter ?? 0) > 0,
    staleTime: Infinity,
    gcTime: 60 * 60 * 1000,
    retry: (failureCount, error) => {
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
  });
}
