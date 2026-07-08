import { useQuery } from '@tanstack/react-query';
import { useAuthReady } from '../useAuthReady';
import { normalizePrototypeApiSpaceId } from '../../utils/prototype-space-api-id';
import { api } from '../../lib/api';

export interface SpaceGroupStudyThread {
  id: string;
  title: string;
  subtitle: string | null;
  color: string | null;
  spaceId: string | null;
  isPinned: boolean;
  createdAt: string;
  updatedAt: string;
  noteCount: number;
  ownerUserId: string;
}

export function useSpaceGroupThreads(spaceId: string | undefined) {
  const authReady = useAuthReady();
  const id = normalizePrototypeApiSpaceId(spaceId);
  return useQuery({
    queryKey: ['space', id, 'group-threads'],
    enabled: authReady && Boolean(id),
    queryFn: async () => {
      const res = await api.get<{ threads?: SpaceGroupStudyThread[] }>(
        `/api/spaces/${encodeURIComponent(id!)}/group-threads`,
      );
      return res.threads ?? [];
    },
  });
}
