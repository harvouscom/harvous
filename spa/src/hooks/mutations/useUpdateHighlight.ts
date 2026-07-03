import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { normalizePrototypeApiSpaceId } from '../../utils/prototype-space-api-id';
import type { StudyThreadEntryDetail } from '../queries/useNote';
import type { StudyThreadEntryKind } from './useCreateHighlight';
import { runOfflineFirst } from './withOfflineQueue';
import { updateStudyThreadEntryOffline } from '@/utils/offline-mutations';

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
    mutationFn: async (input: UpdateHighlightInput) => {
      const { id, spaceId: _spaceId, parentNoteId: _parentNoteId, ...patch } = input;
      const outcome = await runOfflineFirst({
        online: () =>
          api.patch<UpdateHighlightResponse>(`/api/study-threads/${encodeURIComponent(id)}`, patch),
        offline: (userId) => updateStudyThreadEntryOffline(userId, id, patch).then(() => undefined),
      });
      if (outcome.queued) {
        return { success: true } satisfies UpdateHighlightResponse;
      }
      return outcome.online!;
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
