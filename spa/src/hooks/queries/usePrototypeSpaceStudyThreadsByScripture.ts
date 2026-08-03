import { useQuery } from '@tanstack/react-query';
import { normalizePrototypeApiSpaceId } from '../../utils/prototype-space-api-id';
import { api } from '../../lib/api';
import { useAuthReady } from '../useAuthReady';
import type { StudyThreadEntryDetail } from './useNote';

export type PrototypeStudyThreadByScriptureRow = StudyThreadEntryDetail & { parentNoteTitle: string };

export function usePrototypeSpaceStudyThreadsByScripture(
  spaceId: string | undefined,
  reference: string | undefined,
  translation: string | undefined,
  enabled: boolean,
) {
  const authReady = useAuthReady();
  const id = normalizePrototypeApiSpaceId(spaceId);
  return useQuery({
    queryKey: ['prototype', 'space', id, 'study-threads-by-scripture', reference, translation],
    enabled: Boolean(authReady && id && reference && translation && enabled),
    queryFn: async () => {
      const res = await api.get<{ success: boolean; studyThreads: PrototypeStudyThreadByScriptureRow[] }>(
        `/api/spaces/${encodeURIComponent(id!)}/study-threads/by-scripture`,
        {
          reference: reference!,
          translation: translation!,
        },
      );
      return res.studyThreads ?? [];
    },
  });
}
