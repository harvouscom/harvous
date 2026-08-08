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
  /** 'collection' | 'sequence' — a sequence is an authored study plan. */
  mode: string;
  /** 1-based step the cohort is on; 0 when this isn't a sequence. */
  sequenceCurrentIndex: number;
  /** Steps in the plan; 0 when this isn't a sequence. */
  sequenceTotal: number;
}

/** "Step 3 of 8", or null when there is no plan to be partway through. */
export function sequenceStepLabel(
  thread: Pick<SpaceGroupStudyThread, 'mode' | 'sequenceCurrentIndex' | 'sequenceTotal'>,
): string | null {
  if (thread.mode !== 'sequence' || thread.sequenceTotal <= 0) return null;
  if (thread.sequenceCurrentIndex <= 0) return `${thread.sequenceTotal} steps`;
  return `Step ${thread.sequenceCurrentIndex} of ${thread.sequenceTotal}`;
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
