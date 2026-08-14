/**
 * Highlights resting on a chapter — every one of them, whoever made them where.
 *
 * The reader does not own highlights and does not have its own store: this reads the same
 * `StudyThreadEntries` rows a note's scripture dock writes, addressed by book + chapter
 * instead of by parent note. A highlight made on Exodus 5:1 inside a note shows up here, and
 * one made here shows up in that note's dock, because there is only one set of rows.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuthReady } from '../useAuthReady';
import type { StudyHighlightAccentKey } from '@/utils/study-highlight-accents';

export interface ChapterHighlight {
  id: string;
  scriptureReference: string | null;
  highlightAccent: StudyHighlightAccentKey;
  miniNoteBody?: string;
  /** False when it came from a note rather than from reading. */
  madeWhileReading: boolean;
}

export function chapterHighlightsKey(book: string, chapter: number, translation: string) {
  return ['prototype', 'scripture-highlights', book, chapter, translation] as const;
}

export function usePrototypeChapterHighlights(
  book: string,
  chapter: number,
  translation: string,
) {
  // Cold-start 401s are a recurring bug class here; every query waits for auth.
  const authReady = useAuthReady();
  return useQuery({
    queryKey: chapterHighlightsKey(book, chapter, translation),
    enabled: authReady && !!book && Number.isFinite(chapter),
    queryFn: async (): Promise<ChapterHighlight[]> => {
      const params = new URLSearchParams({
        book,
        chapter: String(chapter),
        translation,
      });
      const res = await fetch(`/api/scripture/highlights?${params}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to load highlights');
      const data = await res.json();
      /**
       * The wire field is `highlightAccentRaw` — `mapStudyRow` is shared by every study-thread
       * endpoint, so it is renamed here rather than there.
       *
       * Reading it as `highlightAccent` silently yielded `undefined`, which is not a crash but
       * something worse: the verse dropped its colour attribute and fell back to the CSS
       * default, so every highlight rendered amber no matter what colour was saved. Falling
       * back explicitly keeps that failure visible in one place.
       */
      return ((data.highlights ?? []) as Array<Record<string, unknown>>).map((row) => ({
        id: String(row.id),
        scriptureReference: (row.scriptureReference as string | null) ?? null,
        highlightAccent: (row.highlightAccentRaw ??
          row.highlightAccent ??
          'warmAmber') as StudyHighlightAccentKey,
        miniNoteBody: row.miniNoteBody as string | undefined,
        madeWhileReading: Boolean(row.madeWhileReading),
      }));
    },
  });
}

export function useCreateChapterHighlight(book: string, chapter: number, translation: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      reference: string;
      accent: StudyHighlightAccentKey;
      excerpt?: string;
    }) => {
      const res = await fetch('/api/scripture/highlights', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...input, translation }),
      });
      if (!res.ok) throw new Error('Failed to save highlight');
      return res.json();
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: chapterHighlightsKey(book, chapter, translation),
      });
    },
  });
}
