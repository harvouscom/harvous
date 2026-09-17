import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import type { StudyThreadEntryDetail } from '../queries/useNote';
import { withStudyThreadContext } from '@/utils/study-dock-stack';
import { invalidatePrototypeStudyThreadListQueries } from '@/utils/prototype-study-thread-list-sync';

export type StudyThreadEntryKind =
  | 'workspace'
  | 'miniNote'
  | 'linkedNote'
  | 'scriptureLink'
  | 'reference';

export interface CreateHighlightInput {
  parentNoteId: string;
  spaceId: string;
  contextSpaceId?: string | null;
  entryKind?: StudyThreadEntryKind;
  highlightAccentRaw?: string;
  sourceSnippet?: string;
  focusTitle?: string;
  notesBody?: string;
  miniNoteBody?: string;
  linkedNoteId?: string | null;
  linkedNoteTitle?: string | null;
  anchorLocation?: number | null;
  anchorLength?: number | null;
  anchorTextSnapshot?: string | null;
  scriptureReference?: string | null;
  scripturePassageTranslation?: string | null;
  scripturePassageExcerpt?: string | null;
}

export function buildCreateHighlightRequest(input: CreateHighlightInput): {
  url: string;
  body: Record<string, unknown>;
} {
  const { parentNoteId, spaceId: _spaceId, contextSpaceId, ...rest } = input;
  return {
    url: `/api/notes/${encodeURIComponent(parentNoteId)}/study-threads`,
    body: withStudyThreadContext({ entryKind: 'miniNote', ...rest }, contextSpaceId),
  };
}

interface CreateHighlightResponse {
  success?: boolean;
  studyThread?: StudyThreadEntryDetail | null;
  error?: string;
}

export function useCreateHighlight() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateHighlightInput) => {
      const request = buildCreateHighlightRequest(input);
      return api.post<CreateHighlightResponse>(request.url, request.body);
    },
    /*
     * The shared helper, not a copy of its key list. This hook and `useUpdateHighlight` each
     * spelled out four of its keys by hand and so missed the two it grew later — the painted
     * chapter and Activity — while `useDeleteHighlight` called the helper and got both. Erasing
     * a highlight refreshed Activity and making one did not, which is the shape a hand-copied
     * key list always drifts into.
     */
    onSuccess: (_data, variables) => {
      invalidatePrototypeStudyThreadListQueries(
        queryClient,
        variables.spaceId,
        variables.parentNoteId,
      );
      queryClient.invalidateQueries({
        queryKey: ['noteActivity', variables.parentNoteId, variables.contextSpaceId?.trim() || null],
      });
    },
  });
}
