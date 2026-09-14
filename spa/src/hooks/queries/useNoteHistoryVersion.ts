import { useQuery } from '@tanstack/react-query';
import { useAuthReady } from '../useAuthReady';
import { api } from '../../lib/api';
import { noteHistoryQueryKey } from './useNoteHistory';

export type NoteHistoryVersionWire = {
  id: string;
  noteId: string;
  version: number;
  title: string | null;
  content: string;
  contentEncrypted: boolean;
  source: string;
  createdAt: string;
  editedBy: string | null;
};

export function useNoteHistoryVersion(noteId: string, versionId: string | null) {
  const authReady = useAuthReady();
  return useQuery({
    queryKey: [...noteHistoryQueryKey(noteId), 'version', versionId] as const,
    queryFn: () =>
      api.get<{ success: boolean; version: NoteHistoryVersionWire }>(
        `/api/notes/${noteId}/versions/${versionId}`,
      ),
    enabled: authReady && Boolean(noteId) && Boolean(versionId),
    // A version never changes once written.
    staleTime: Infinity,
    retry: false,
  });
}
