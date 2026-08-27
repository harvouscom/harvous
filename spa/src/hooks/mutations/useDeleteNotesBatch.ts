import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { markNotesDeleted, unmarkNotesDeleted } from '../../pages/prototype/proto-deleted-notes';

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
    onMutate: (noteIds) => {
      markNotesDeleted(noteIds);
    },
    onError: (_err, noteIds) => {
      unmarkNotesDeleted(noteIds);
    },
    onSuccess: () => {
      // Broad rather than surgical: a bulk delete can touch folders, threads, highlights
      // and counts across several lists at once, and the selection is already gone from
      // the UI by the time this lands.
      //
      // The prefix has to be `['space', …]` — the sidebar's list is
      // `['space', id, 'notes', …]` (useSpace.ts), not a top-level `spaceNotes` key.
      void queryClient.invalidateQueries({ queryKey: ['space'] });
      void queryClient.invalidateQueries({ queryKey: ['navigation'] });
      // Three that the `['space', …]` prefix cannot reach, because none of them is keyed
      // by space. All three name notes — the first supplies Home's meaning weights, the
      // other two supply Suggested rows whose titles are note titles.
      void queryClient.invalidateQueries({ queryKey: ['note-fingerprints'] });
      void queryClient.invalidateQueries({ queryKey: ['note-connect-suggestions'] });
      void queryClient.invalidateQueries({ queryKey: ['note-crossref-gaps'] });
    },
  });
}
