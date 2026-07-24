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

export const spaceGroupThreadsQueryKey = (spaceId: string | undefined) =>
  ['space', normalizePrototypeApiSpaceId(spaceId), 'group-threads'] as const;

/** A shared space has a current Thread only when the owner explicitly pinned it. */
export function selectCurrentSpaceThread<T extends Pick<SpaceGroupStudyThread, 'isPinned'>>(
  threads: T[],
): T | null {
  return threads.find((thread) => thread.isPinned) ?? null;
}

export function useSpaceGroupThreads(spaceId: string | undefined) {
  const authReady = useAuthReady();
  const id = normalizePrototypeApiSpaceId(spaceId);
  return useQuery({
    queryKey: spaceGroupThreadsQueryKey(id),
    enabled: authReady && Boolean(id),
    queryFn: async () => {
      const res = await api.get<{ threads?: SpaceGroupStudyThread[] }>(
        `/api/spaces/${encodeURIComponent(id!)}/group-threads`,
      );
      return res.threads ?? [];
    },
  });
}
