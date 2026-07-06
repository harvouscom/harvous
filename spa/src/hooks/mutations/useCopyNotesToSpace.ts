import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import {
  findSpaceNoteRowInCache,
  prependSpaceNoteToCache,
  spaceNoteRowFromCopy,
  spaceNotesQueryKey,
} from '../../lib/space-notes-cache';
import { invalidatePrototypeSpaceDerivedQueries } from '../../lib/prototype-space-query-keys';

function normalizedSpaceIdForApi(spaceId: string): string {
  return spaceId.startsWith('space_') ? spaceId : `space_${spaceId}`;
}

interface CopyNotesToSpaceVariables {
  targetSpaceId: string;
  noteIds: string[];
}

interface CopyNotesToSpaceResponse {
  success: boolean;
  created: Array<{ sourceNoteId: string; noteId: string }>;
  errors?: string[];
}

/** Copies notes into a space as new independent rows (sources untouched). */
export function useCopyNotesToSpace() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ targetSpaceId, noteIds }: CopyNotesToSpaceVariables) => {
      const sid = normalizedSpaceIdForApi(targetSpaceId);
      return api.post<CopyNotesToSpaceResponse>(`/api/spaces/${sid}/copy-notes`, { noteIds });
    },
    onSuccess: (data, variables) => {
      const sid = normalizedSpaceIdForApi(variables.targetSpaceId);
      let prepended = false;

      for (const { sourceNoteId, noteId } of data.created) {
        const source = findSpaceNoteRowInCache(queryClient, sourceNoteId);
        if (!source) continue;
        prependSpaceNoteToCache(queryClient, sid, spaceNoteRowFromCopy(source, noteId));
        prepended = true;
      }

      if (!prepended && data.created.length > 0) {
        void queryClient.refetchQueries({ queryKey: spaceNotesQueryKey(sid), type: 'active' });
      }

      queryClient.invalidateQueries({ queryKey: spaceNotesQueryKey(sid) });
      queryClient.invalidateQueries({ queryKey: ['space', sid, 'bootstrap'] });
      invalidatePrototypeSpaceDerivedQueries(queryClient, sid);
    },
  });
}
