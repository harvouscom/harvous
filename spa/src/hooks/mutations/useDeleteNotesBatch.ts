import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';

interface DeleteNotesBatchResponse {
  success?: boolean;
  deletedNoteIds: string[];
  requestedCount: number;
}

/**
 * Delete several of your own notes in one request.
 *
 * One call rather than N: writes are rate limited per endpoint (20/min), so looping the
 * single-note route would 429 partway through a larger selection and leave it half
 * deleted. See `POST /api/notes/delete-batch`.
 */
export function useDeleteNotesBatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (noteIds: string[]) =>
      api.post<DeleteNotesBatchResponse>('/api/notes/delete-batch', { noteIds }),
    onSuccess: () => {
      // Broad rather than surgical: a bulk delete can touch folders, threads, highlights
      // and counts across several lists at once, and the selection is already gone from
      // the UI by the time this lands.
      //
      // The prefix has to be `['space', …]` — the sidebar's list is
      // `['space', id, 'notes', …]` (useSpace.ts), not a top-level `spaceNotes` key.
      void queryClient.invalidateQueries({ queryKey: ['space'] });
      void queryClient.invalidateQueries({ queryKey: ['navigation'] });
    },
  });
}
