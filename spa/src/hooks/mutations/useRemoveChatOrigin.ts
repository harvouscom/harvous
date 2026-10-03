import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { toast } from '@/utils/toast';
import type { NoteDetail } from '../queries/useNote';

/**
 * "Remove card" on a note an AI app started. Optimistic: the card goes on tap, and comes back
 * with a toast if the server refuses. The note itself is untouched.
 */
export function useRemoveChatOrigin(noteId: string) {
  const queryClient = useQueryClient();
  const key = ['note', noteId] as const;
  return useMutation({
    mutationFn: () => api.delete<{ removed: boolean }>(`/api/notes/${encodeURIComponent(noteId)}/chat-origin`),
    onMutate: async () => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueriesData<NoteDetail>({ queryKey: key });
      queryClient.setQueriesData<NoteDetail>({ queryKey: key }, (note) => (note ? { ...note, chatOrigin: null } : note));
      return { previous };
    },
    onError: (_error, _vars, context) => {
      for (const [queryKey, data] of context?.previous ?? []) queryClient.setQueryData(queryKey, data);
      toast.error('Could not remove the card. Try again.');
    },
  });
}
