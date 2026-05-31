import { useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { patchSpaceNotesInfiniteCache, spaceNotesQueryKey, type SpaceNotesPage } from '../../lib/space-notes-cache';

function normalizeSpaceId(spaceId: string): string {
  const t = (spaceId ?? '').trim();
  return t.startsWith('space_') ? t : t ? `space_${t}` : '';
}

interface PinSpaceNoteVariables {
  spaceId: string;
  noteId: string;
  isPinned: boolean;
}

/**
 * Toggle note pin for a space (owner-only API). Optimistically patches paginated space notes list.
 */
export function usePinSpaceNote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ spaceId, noteId, isPinned }: PinSpaceNoteVariables) => {
      const sid = normalizeSpaceId(spaceId);
      if (!sid) throw new Error('Space ID is required');
      return api.post<{ success?: boolean; error?: string }>(`/api/spaces/${encodeURIComponent(sid)}/pin-item`, {
        itemId: noteId,
        itemType: 'note',
        isPinned,
      });
    },
    onMutate: async (variables) => {
      const sid = normalizeSpaceId(variables.spaceId);
      if (!sid) return;
      const key = spaceNotesQueryKey(sid);
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<InfiniteData<SpaceNotesPage, number>>(key);
      patchSpaceNotesInfiniteCache(queryClient, sid, (note) =>
        note.id === variables.noteId ? { ...note, isPinned: variables.isPinned } : note,
      );
      return { previous, sid };
    },
    onError: (_err, variables, context) => {
      if (context?.previous && context.sid) {
        queryClient.setQueryData(spaceNotesQueryKey(context.sid), context.previous);
      }
    },
    onSettled: (_data, _err, variables) => {
      const sid = normalizeSpaceId(variables.spaceId);
      if (sid) {
        queryClient.invalidateQueries({ queryKey: ['space', sid, 'notes'] });
      }
    },
  });
}
