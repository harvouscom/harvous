import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { noteHistoryQueryKey } from '../queries/useNoteHistory';
import { chainNoteSave, getCurrentCachedNoteVersion } from './useUpdateNote';

/** The note page remounts its editor on this, since an open editor ignores server bodies once typed in. */
export const NOTE_HISTORY_RESTORED_EVENT = 'noteHistoryRestored';

type RestoreNoteVersionResponse = {
  success: boolean;
  currentVersion: number;
  currentVersionId: string;
};

/** Callable outside a component, so Undo still works from a toast after the sheet has closed. */
export async function restoreNoteVersion(
  queryClient: QueryClient,
  { noteId, versionId }: { noteId: string; versionId: string },
): Promise<RestoreNoteVersionResponse> {
  // Queued behind any in-flight save, reading the version only once that save lands.
  const result = await chainNoteSave(noteId, () =>
    api.post<RestoreNoteVersionResponse>(`/api/notes/${noteId}/versions/${versionId}/restore`, {
      expectedVersion: getCurrentCachedNoteVersion(queryClient, noteId),
    }),
  );
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ['note', noteId] }),
    queryClient.invalidateQueries({ queryKey: noteHistoryQueryKey(noteId) }),
  ]);
  window.dispatchEvent(new CustomEvent(NOTE_HISTORY_RESTORED_EVENT, { detail: { noteId } }));
  return result;
}

export function useRestoreNoteVersion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { noteId: string; versionId: string }) => restoreNoteVersion(queryClient, vars),
  });
}
