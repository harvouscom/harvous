import { useQuery } from '@tanstack/react-query';
import { useAuthReady } from '../useAuthReady';
import { normalizePrototypeApiSpaceId } from '../../utils/prototype-space-api-id';
import { api } from '../../lib/api';
import type { StudyThreadEntryDetail } from './useNote';

export type PrototypeHighlightStudyThreadRow = StudyThreadEntryDetail & { parentNoteTitle: string };

export function usePrototypeSpaceStudyThreadHighlights(spaceId: string | undefined) {
  const authReady = useAuthReady();
  const id = normalizePrototypeApiSpaceId(spaceId);
  return useQuery({
    queryKey: ['prototype', 'space', id, 'study-thread-highlights'],
    enabled: authReady && Boolean(id),
    queryFn: async () => {
      const res = await api.get<{ success: boolean; studyThreads: PrototypeHighlightStudyThreadRow[] }>(
        `/api/spaces/${encodeURIComponent(id!)}/study-thread-highlights`,
      );
      return res.studyThreads ?? [];
    },
  });
}
