import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';

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
 * Toggle note pin for a space (owner-only API). Invalidates paginated space notes list.
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
    onSuccess: (_data, variables) => {
      const sid = normalizeSpaceId(variables.spaceId);
      if (sid) {
        queryClient.invalidateQueries({ queryKey: ['space', sid, 'notes'] });
      }
    },
  });
}
