import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { normalizePrototypeApiSpaceId } from '../../utils/prototype-space-api-id';
import type { StudyThreadEntryDetail } from '../queries/useNote';
import type { StudyThreadEntryKind } from './useCreateHighlight';

interface UpdateHighlightInput {
  id: string;
  spaceId: string;
  parentNoteId?: string;
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
  scriptureReference?: string;
  scripturePassageTranslation?: string;
  scripturePassageExcerpt?: string;
  isArchived?: boolean;
  entryKind?: StudyThreadEntryKind;
}

interface UpdateHighlightResponse {
  success?: boolean;
  studyThread?: StudyThreadEntryDetail | null;
  error?: string;
}

export function useUpdateHighlight() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: UpdateHighlightInput) => {
      const { id, spaceId: _spaceId, parentNoteId: _parentNoteId, ...patch } = input;
      return api.patch<UpdateHighlightResponse>(
        `/api/study-threads/${encodeURIComponent(id)}`,
        patch,
      );
    },
    onSuccess: (_data, variables) => {
      const sid = normalizePrototypeApiSpaceId(variables.spaceId);
      queryClient.invalidateQueries({
        queryKey: ['prototype', 'space', sid, 'study-thread-highlights'],
      });
      queryClient.invalidateQueries({
        queryKey: ['prototype', 'space', sid, 'study-threads-by-scripture'],
      });
      if (variables.parentNoteId) {
        queryClient.invalidateQueries({ queryKey: ['note', variables.parentNoteId] });
      }
    },
  });
}
