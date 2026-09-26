import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/clerk-react';
import { api } from '../../lib/api';
import { useAuthReady } from '../useAuthReady';

/** A step's leader notes and discussion questions. Leaders only. */
export type StepGuide = { leaderNotes: string | null; questions: string[] };

export type StudyPlanLeaderKit = {
  /** By step note id. A step with no guide is absent. */
  guides: Record<string, StepGuide>;
};

export function studyPlanLeaderKitQueryKey(userId: string | null | undefined, threadId: string | null | undefined) {
  return ['study-plan-leader-kit', userId ?? 'none', threadId ?? 'none'] as const;
}

/**
 * The leader kit on a study plan (docs/CHURCH_V2_ROADMAP.md §E). Pass `enabled` only when the
 * viewer can manage the plan — the server 403s everyone else, and a member should never fire it.
 */
export function useStudyPlanLeaderKit(threadId: string | null | undefined, options?: { enabled?: boolean }) {
  const { userId } = useAuth();
  const authReady = useAuthReady();
  const id = threadId?.trim() || null;
  return useQuery({
    queryKey: studyPlanLeaderKitQueryKey(userId, id),
    enabled: authReady && !!userId && !!id && options?.enabled === true,
    queryFn: () => api.get<StudyPlanLeaderKit>(`/api/threads/${encodeURIComponent(id!)}/leader-kit`),
    staleTime: 30_000,
    retry: false,
  });
}

/** Save (or, when empty, remove) one step's guide. */
export function useSaveStepGuide(threadId: string | null | undefined) {
  const queryClient = useQueryClient();
  const { userId } = useAuth();
  const id = threadId?.trim() || null;
  return useMutation({
    mutationFn: (input: { noteId: string; leaderNotes: string; questions: string[] }) =>
      api.post<{ success: boolean; guides: Record<string, StepGuide> }>(
        `/api/threads/${encodeURIComponent(id!)}/leader-kit/steps/${encodeURIComponent(input.noteId)}`,
        { leaderNotes: input.leaderNotes, questions: input.questions },
      ),
    onSuccess: (data) => {
      if (data?.guides) queryClient.setQueryData(studyPlanLeaderKitQueryKey(userId, id), { guides: data.guides });
    },
  });
}
