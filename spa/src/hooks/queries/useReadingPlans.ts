/**
 * The viewer's own reading plans, and only where they are up to in each.
 *
 * A personal plan is a sequence Thread with no space. The server has always
 * built them; nothing rendered them until Aug 2026, because `useThreadNotes`
 * was gated on a `spaceId` it never actually needed.
 *
 * Home takes the current step only — see the route's docblock for why. The full
 * plan is the Threads list's job.
 */
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@clerk/clerk-react';
import { api } from '../../lib/api';
import { useAuthReady } from '../useAuthReady';

export type ReadingPlanStep = {
  threadId: string;
  title: string;
  color: string | null;
  currentNoteId: string | null;
  currentNoteTitle: string | null;
  /** 1-based. 0 when the plan has no steps yet. */
  currentIndex: number;
  total: number;
};

export function readingPlansQueryKey(userId: string | null | undefined) {
  return ['reading-plans', userId ?? 'none'] as const;
}

export function useReadingPlans(options?: { enabled?: boolean }) {
  const { userId } = useAuth();
  const authReady = useAuthReady();

  return useQuery({
    queryKey: readingPlansQueryKey(userId),
    enabled: authReady && !!userId && options?.enabled !== false,
    queryFn: () => api.get<{ plans: ReadingPlanStep[] }>('/api/threads/reading-plans'),
    staleTime: 60_000,
  });
}
