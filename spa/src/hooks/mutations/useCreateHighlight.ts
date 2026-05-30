import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { normalizePrototypeApiSpaceId } from '../../utils/prototype-space-api-id';
import type { StudyThreadEntryDetail } from '../queries/useNote';

export type StudyThreadEntryKind =
  | 'workspace'
  | 'miniNote'
  | 'linkedNote'
  | 'scriptureLink'
  | 'reference';

interface CreateHighlightInput {
  parentNoteId: string;
  spaceId: string;
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

interface CreateHighlightResponse {
  success?: boolean;
  studyThread?: StudyThreadEntryDetail | null;
  error?: string;
}

export function useCreateHighlight() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateHighlightInput) => {
      const { parentNoteId, spaceId: _spaceId, ...rest } = input;
      return api.post<CreateHighlightResponse>(
        `/api/notes/${encodeURIComponent(parentNoteId)}/study-threads`,
        { entryKind: 'miniNote', ...rest },
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
      queryClient.invalidateQueries({ queryKey: ['note', variables.parentNoteId] });
    },
  });
}
