import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { normalizePrototypeApiSpaceId } from '../../utils/prototype-space-api-id';
import type { StudyThreadEntryDetail } from '../queries/useNote';
import { withStudyThreadContext } from '@/utils/study-dock-stack';

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
    onSuccess: (_data, variables) => {
      const sid = normalizePrototypeApiSpaceId(variables.spaceId);
      queryClient.invalidateQueries({
        queryKey: ['prototype', 'space', sid, 'study-thread-highlights'],
      });
      queryClient.invalidateQueries({
        queryKey: ['prototype', 'space', sid, 'study-threads-by-scripture'],
      });
      queryClient.invalidateQueries({ queryKey: ['note', variables.parentNoteId] });
      queryClient.invalidateQueries({
        queryKey: ['noteActivity', variables.parentNoteId, variables.contextSpaceId?.trim() || null],
      });
    },
  });
}
