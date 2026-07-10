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

export function buildSaveNoteCopyRequest(homeSpaceId: string, sourceNoteId: string) {
  const sid = normalizedSpaceIdForApi(homeSpaceId);
  return {
    url: `/api/spaces/${encodeURIComponent(sid)}/copy-notes`,
    body: { noteIds: [sourceNoteId] },
  };
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

/** Save an attributed independent copy of a foreign note into the caller's My Home. */
export function useSaveNoteCopy() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      homeSpaceId,
      sourceNoteId,
    }: {
      homeSpaceId: string;
      sourceNoteId: string;
    }) => {
      const request = buildSaveNoteCopyRequest(homeSpaceId, sourceNoteId);
      const response = await api.post<CopyNotesToSpaceResponse>(request.url, request.body);
      const created = response.created.find((row) => row.sourceNoteId === sourceNoteId);
      if (!created) throw new Error(response.errors?.[0] ?? 'Could not save a copy');
      return { ...response, newNoteId: created.noteId };
    },
    onSuccess: (data, variables) => {
      const sid = normalizedSpaceIdForApi(variables.homeSpaceId);
      const source = findSpaceNoteRowInCache(queryClient, variables.sourceNoteId);
      if (source) {
        prependSpaceNoteToCache(queryClient, sid, spaceNoteRowFromCopy(source, data.newNoteId));
      }
      queryClient.invalidateQueries({ queryKey: spaceNotesQueryKey(sid) });
      queryClient.invalidateQueries({ queryKey: ['space', sid, 'bootstrap'] });
      queryClient.invalidateQueries({ queryKey: ['note', data.newNoteId] });
      invalidatePrototypeSpaceDerivedQueries(queryClient, sid);
    },
  });
}
