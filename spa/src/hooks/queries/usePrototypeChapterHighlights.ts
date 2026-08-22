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
import { notifyStudyThreadListChanged } from '@/utils/prototype-study-thread-list-sync';

export interface ChapterHighlight {
  id: string;
  scriptureReference: string | null;
  highlightAccent: StudyHighlightAccentKey;
  miniNoteBody?: string;
  /** False when it came from a note rather than from reading. */
  madeWhileReading: boolean;
  /**
   * Null for a whole-verse highlight — which is every highlight made before sub-verse existed.
   * Non-null means this covers a span inside the verse, and `excerpt` is the text to find.
   */
  spanKey: string | null;
  /** The text this highlight is of. Only meaningful alongside a non-null `spanKey`. */
  excerpt: string;
}

export function chapterHighlightsKey(book: string, chapter: number, translation: string) {
  return ['prototype', 'scripture-highlights', book, chapter, translation] as const;
}

const OPTIMISTIC_ID_PREFIX = 'optimistic_';

/**
 * A row `useCreateChapterHighlight` painted into the cache ahead of the network — real for
 * colouring the verse, but not a row the server knows about yet. Callers that need to act on
 * the id itself (PATCH a note onto it, treat it as "already annotated") must wait for the
 * real one instead.
 */
export function isOptimisticChapterHighlightId(id: string | null | undefined): boolean {
  return !!id && id.startsWith(OPTIMISTIC_ID_PREFIX);
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
      /*
       * References are anchored to a verse but they are not highlights of it. Saving the
       * dictionary entry for a word should not repaint the whole verse — the endpoint
       * deliberately returns every kind of row, so the narrowing belongs here, at the one
       * caller that paints.
       */
      return ((data.highlights ?? []) as Array<Record<string, unknown>>)
        .filter((row) => row.entryKind !== 'reference' && row.entryKindRaw !== 'reference')
        .map((row) => ({
          id: String(row.id),
          scriptureReference: (row.scriptureReference as string | null) ?? null,
          highlightAccent: (row.highlightAccentRaw ??
            row.highlightAccent ??
            'warmAmber') as StudyHighlightAccentKey,
          miniNoteBody: row.miniNoteBody as string | undefined,
          madeWhileReading: Boolean(row.madeWhileReading),
          spanKey: (row.scriptureSpanKey as string | null) ?? null,
          excerpt: (row.scripturePassageExcerpt as string | null) ?? '',
        }));
    },
  });
}

/**
 * @param spaceId The reader's home space — required by the server (see `POST
 *   /api/scripture/highlights`) so the row can be found again. A highlight is a
 *   `StudyThreadEntries` row exactly like one made from a note's scripture dock, and the
 *   sidebar's Highlights list (`usePrototypeSpaceStudyThreadHighlights`) reads the same table
 *   scoped to one space — a row with no space matched none of them, so a highlight made here
 *   was invisible everywhere but the chapter that made it. Also used to invalidate that list
 *   below: without it, the query's global 60s `staleTime` (see `App.tsx`) meant a revisit
 *   inside that window still served the stale list even once the row itself was fixed.
 */
export function useCreateChapterHighlight(
  book: string,
  chapter: number,
  translation: string,
  spaceId: string | null | undefined,
) {
  const queryClient = useQueryClient();
  const key = chapterHighlightsKey(book, chapter, translation);
  return useMutation({
    mutationFn: async (input: {
      reference: string;
      accent: StudyHighlightAccentKey;
      excerpt?: string;
      /** Null (or absent) for a whole-verse highlight; see `src/utils/scripture-span-key.ts`. */
      spanKey?: string | null;
    }) => {
      if (!spaceId) throw new Error('No space to save this highlight to yet');
      const res = await fetch('/api/scripture/highlights', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...input, translation, spaceId }),
      });
      if (!res.ok) throw new Error('Failed to save highlight');
      return res.json();
    },
    /**
     * Paint the verse the moment the tap happens. Without this, a colour only ever showed up
     * after the POST resolved AND the refetch it kicked off finished — two round trips before
     * anything moved, which reads as "the colour doesn't update right away" (worse from the
     * Annotate dock's swatch, sitting behind the newly-opened card with nothing else to look
     * at while it waits).
     */
    onMutate: async (input) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ChapterHighlight[]>(key);
      const spanKey = input.spanKey ?? null;
      queryClient.setQueryData<ChapterHighlight[]>(key, (rows = []) => {
        /*
         * Matched on reference AND span, not reference alone.
         *
         * Two phrases in one verse share a reference and are different highlights, so matching
         * on the reference would have the second drag recolour the first instead of adding one —
         * the same collision the server upsert had to be taught about, arriving one layer up.
         */
        const idx = rows.findIndex(
          (r) => r.scriptureReference === input.reference && (r.spanKey ?? null) === spanKey,
        );
        if (idx === -1) {
          return [
            ...rows,
            {
              id: `${OPTIMISTIC_ID_PREFIX}${Date.now()}`,
              scriptureReference: input.reference,
              highlightAccent: input.accent,
              miniNoteBody: '',
              madeWhileReading: true,
              spanKey,
              // Carried so the optimistic paint can find the span before the network answers.
              excerpt: input.excerpt ?? '',
            },
          ];
        }
        const next = rows.slice();
        next[idx] = { ...next[idx], highlightAccent: input.accent };
        return next;
      });
      return { previous };
    },
    onError: (_err, _input, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSuccess: () => {
      notifyStudyThreadListChanged(spaceId, null);
    },
    // Reconciles the optimistic row with the real one (id, any server-side normalisation)
    // whether the mutation succeeded or the rollback above needs a fresh copy of truth.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: key });
    },
  });
}

export interface ChapterReference {
  id: string;
  scriptureReference: string | null;
  /** The looked-up word this reference is for — `sourceSnippet` on the row. */
  word: string;
  /** The colour it was kept in, so the reader can underline it in that colour rather than
      in the server-side default every row happens to share most of the time. */
  accent: StudyHighlightAccentKey;
}

export function chapterReferencesKey(book: string, chapter: number, translation: string) {
  return ['prototype', 'scripture-references', book, chapter, translation] as const;
}

/**
 * Same (word, reference) pair on both ends of a save — the reader builds this once to look a
 * word up before opening its dock, and again to index what `usePrototypeChapterReferences`
 * returns, so the two only ever miss each other if the reference string itself differs.
 */
export function chapterReferenceLookupKey(reference: string, word: string): string {
  return `${reference}::${word.trim().toLowerCase()}`;
}

/**
 * What the reader keeps per saved look-up: the row to act on, and the colour to draw it in.
 *
 * The accent rides along because the underline is painted imperatively onto DOM the memoised
 * verse HTML owns — there is no second lookup at paint time to go and fetch it from.
 */
export interface SavedReference {
  id: string;
  accent: StudyHighlightAccentKey;
}

/**
 * Saved word look-ups on this chapter — same rows `usePrototypeChapterHighlights` reads, the
 * opposite half of its filter. A highlight/annotation paints a verse; a reference does not, so
 * the reader needs to know about these separately to tell a word it's already kept from one it
 * isn't — otherwise every tap opens "Save" again, whether or not that tap already did.
 */
export function usePrototypeChapterReferences(
  book: string,
  chapter: number,
  translation: string,
) {
  const authReady = useAuthReady();
  return useQuery({
    queryKey: chapterReferencesKey(book, chapter, translation),
    enabled: authReady && !!book && Number.isFinite(chapter),
    queryFn: async (): Promise<ChapterReference[]> => {
      const params = new URLSearchParams({ book, chapter: String(chapter), translation });
      const res = await fetch(`/api/scripture/highlights?${params}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to load references');
      const data = await res.json();
      return ((data.highlights ?? []) as Array<Record<string, unknown>>)
        .filter((row) => row.entryKind === 'reference' || row.entryKindRaw === 'reference')
        .map((row) => ({
          id: String(row.id),
          scriptureReference: (row.scriptureReference as string | null) ?? null,
          word: ((row.sourceSnippet as string | undefined) || (row.focusTitle as string | undefined) || '').trim(),
          // Same wire-field rename as the highlights half above, and the same explicit
          // fallback: reading the wrong one yields `undefined`, which shows up not as a
          // crash but as every reference silently rendering in the default colour.
          accent: (row.highlightAccentRaw ??
            row.highlightAccent ??
            'warmAmber') as StudyHighlightAccentKey,
        }))
        .filter((row) => row.word);
    },
  });
}

/**
 * Removes a highlight (or its annotation — same row) from the reader's own dock.
 *
 * Mirrors `useCreateChapterHighlight`'s invalidation: the row may have come from reading or
 * from a note's scripture dock, but either way this chapter's view and the sidebar's
 * Highlights list both need to drop it.
 */
export function useDeleteChapterHighlight(
  book: string,
  chapter: number,
  translation: string,
  spaceId: string | null | undefined,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (studyThreadEntryId: string) => {
      const res = await fetch(`/api/study-threads/${studyThreadEntryId}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to remove highlight');
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: chapterHighlightsKey(book, chapter, translation),
      });
      notifyStudyThreadListChanged(spaceId, null);
    },
  });
}
