import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { navigationQueryKeyPrefix } from '../queries/useNavigation';
import { spaceNotesQueryKey } from '../../lib/space-notes-cache';
import { invalidatePrototypeSpaceDerivedQueries } from '../../lib/prototype-space-query-keys';
import type { ReaderChapterResponse } from '../queries/useReaderChapter';

export interface CreateReaderHighlightInput {
  book: string;
  chapter: number;
  verseStart: number;
  verseEnd?: number | null;
  translation: string;
  accent: string;
  annotation?: string | null;
  /** Home space, so the note lists that gain the passage note can be refreshed. */
  homeSpaceId?: string | null;
}

interface CreateReaderHighlightResponse {
  success?: boolean;
  noteId?: string;
  studyThreadId?: string;
  reference?: string;
  /** True when this highlight created the chapter's passage note. */
  createdNote?: boolean;
  error?: string;
}

export const OPTIMISTIC_ID_PREFIX = 'optimistic_reader_highlight_';

function readerChapterKey(input: CreateReaderHighlightInput) {
  return ['reader', 'chapter', input.book, input.chapter, input.translation] as const;
}

/**
 * Add the pending highlight to a cached chapter so the mark paints before the round trip.
 *
 * Pure so the verse arithmetic can be tested directly — painting the wrong verses is the
 * failure that would actually be visible here.
 */
export function applyOptimisticReaderHighlight(
  previous: ReaderChapterResponse,
  input: CreateReaderHighlightInput,
): ReaderChapterResponse {
  const last = input.verseEnd != null && input.verseEnd > input.verseStart ? input.verseEnd : input.verseStart;
  const study = { ...previous.study };
  const span = last > input.verseStart ? `${input.verseStart}-${last}` : `${input.verseStart}`;
  for (let verse = input.verseStart; verse <= last; verse++) {
    const slot = study[String(verse)] ?? { notes: [], highlights: [] };
    study[String(verse)] = {
      notes: slot.notes,
      highlights: [
        ...slot.highlights,
        {
          id: `${OPTIMISTIC_ID_PREFIX}${verse}`,
          parentNoteId: '',
          parentNoteTitle: null,
          accent: input.accent,
          entryKind: 'scriptureLink',
          reference: `${input.book} ${input.chapter}:${span}`,
          excerpt: null,
        },
      ],
    };
  }
  return {
    ...previous,
    study,
    counts: { ...previous.counts, highlights: previous.counts.highlights + 1 },
  };
}

/**
 * Highlight a verse span from the passage pane.
 *
 * The highlight lands on the chapter's passage note, created server-side on the first
 * highlight in that chapter, so it exports and re-imports like any other highlight.
 */
export function useCreateReaderHighlight() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateReaderHighlightInput) => {
      const { homeSpaceId: _homeSpaceId, ...body } = input;
      return api.post<CreateReaderHighlightResponse>('/api/reader/highlight', body);
    },
    // Paint the mark straight away — the round trip creates a note on the first highlight
    // in a chapter, which is slow enough to feel like a dropped tap otherwise.
    onMutate: async (input) => {
      const key = readerChapterKey(input);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ReaderChapterResponse>(key);
      if (previous) {
        queryClient.setQueryData<ReaderChapterResponse>(key, applyOptimisticReaderHighlight(previous, input));
      }
      return { previous, key };
    },
    onError: (_error, _input, context) => {
      if (context?.previous) queryClient.setQueryData(context.key, context.previous);
    },
    onSuccess: (data, input) => {
      if (data.noteId) queryClient.invalidateQueries({ queryKey: ['note', data.noteId] });
      // A new passage note has to appear in the note lists and navigation.
      if (data.createdNote) {
        queryClient.invalidateQueries({ queryKey: [...navigationQueryKeyPrefix] });
        if (input.homeSpaceId) {
          queryClient.invalidateQueries({ queryKey: spaceNotesQueryKey(input.homeSpaceId) });
          invalidatePrototypeSpaceDerivedQueries(queryClient, input.homeSpaceId);
        }
      }
    },
    // Replace the optimistic mark with the server's row either way.
    onSettled: (_data, _error, input) => {
      queryClient.invalidateQueries({ queryKey: readerChapterKey(input) });
    },
  });
}
