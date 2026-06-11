import { useQuery } from '@tanstack/react-query';
import { useAuthReady } from '../useAuthReady';
import { normalizePrototypeApiSpaceId } from '../../utils/prototype-space-api-id';
import { api } from '../../lib/api';

export interface StudyThreadCluster {
  id: string;           // representative note id (highest-degree node)
  title: string | null; // display title (manual or auto)
  suggestedTitle: string | null;
  hasCustomTitle: boolean;
  studyThreadPinned?: boolean;
  noteCount: number;
  updatedAt: string | null;
  memberIds: string[];
}

interface StudyThreadsResponse {
  threads: StudyThreadCluster[];
}

/**
 * Returns connected components of the NoteConnections graph as "study threads".
 * Each cluster is labeled by its most-connected note.
 */
export function usePrototypeStudyThreads(spaceId: string | undefined) {
  const authReady = useAuthReady();
  const id = normalizePrototypeApiSpaceId(spaceId);
  return useQuery({
    queryKey: ['prototype', 'space', id, 'study-threads'],
    enabled: authReady && Boolean(id),
    queryFn: async () => {
      const res = await api.get<StudyThreadsResponse>(
        `/api/spaces/${encodeURIComponent(id!)}/study-threads`,
      );
      return res.threads ?? [];
    },
  });
}
