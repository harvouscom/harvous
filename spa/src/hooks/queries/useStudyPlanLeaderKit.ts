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

// ─── Gathering agendas ─────────────────────────────────────────────────────────

export type AgendaItem = { id?: string; text: string; minutes: number | null };

export type GatheringAgenda = {
  items: AgendaItem[];
  stepThreadId: string | null;
  stepNoteId: string | null;
  updatedAt: string | null;
};

export function gatheringAgendaQueryKey(userId: string | null | undefined, serviceId: string | null | undefined) {
  return ['gathering-agenda', userId ?? 'none', serviceId ?? 'none'] as const;
}

/** A gathering's agenda, for the group's leaders. Pass `enabled` only for someone who leads the room. */
export function useGatheringAgenda(
  spaceId: string | null | undefined,
  serviceId: string | null | undefined,
  options?: { enabled?: boolean },
) {
  const { userId } = useAuth();
  const authReady = useAuthReady();
  return useQuery({
    queryKey: gatheringAgendaQueryKey(userId, serviceId),
    enabled: authReady && !!userId && !!spaceId && !!serviceId && options?.enabled === true,
    queryFn: () =>
      api.get<GatheringAgenda>(
        `/api/spaces/${encodeURIComponent(spaceId!)}/gatherings/${encodeURIComponent(serviceId!)}/agenda`,
      ),
    staleTime: 30_000,
    retry: false,
  });
}

export function useSaveGatheringAgenda(spaceId: string | null | undefined, serviceId: string | null | undefined) {
  const queryClient = useQueryClient();
  const { userId } = useAuth();
  return useMutation({
    mutationFn: (input: { items: AgendaItem[]; stepThreadId: string | null; stepNoteId: string | null }) =>
      api.post<GatheringAgenda & { success: boolean }>(
        `/api/spaces/${encodeURIComponent(spaceId!)}/gatherings/${encodeURIComponent(serviceId!)}/agenda/set`,
        input,
      ),
    onSuccess: (data) => {
      queryClient.setQueryData(gatheringAgendaQueryKey(userId, serviceId), data);
    },
  });
}

/** Pure: a step's discussion questions as agenda lines, skipping any already on it. */
export function agendaItemsFromGuide(existing: readonly AgendaItem[], questions: readonly string[]): AgendaItem[] {
  const have = new Set(existing.map((item) => item.text.trim().toLowerCase()));
  return questions
    .map((q) => q.trim())
    .filter((q) => q && !have.has(q.toLowerCase()))
    .map((text) => ({ text, minutes: null }));
}

/** Pure: the running total, counting only lines with minutes. */
export function agendaTotalMinutes(items: readonly AgendaItem[]): number {
  return items.reduce((sum, item) => sum + (item.minutes ?? 0), 0);
}
