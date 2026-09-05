/**
 * What's next — a room's suggestion box.
 *
 * Two reads that never mix: `mine` is what this member proposed (no names,
 * theirs is implied), the queue is what whoever runs the room sees (named,
 * because a leader cannot weigh an anonymous stack). The server gates the
 * queue on the room's Thread rule; a 403 here is an ordinary answer meaning
 * "not a reviewer", and the hub reads `isError` rather than surfacing it.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/clerk-react';
import { api } from '../../lib/api';
import { useAuthReady } from '../useAuthReady';
import { navigationQueryKeyPrefix } from './useNavigation';
import { spaceGroupThreadsQueryKey } from './useSpaceGroupThreads';
import { normalizePrototypeApiSpaceId } from '../../utils/prototype-space-api-id';
import type { StudyPlanningMode } from '@/utils/space-study-planning';

export type SpaceStudySuggestionKind = 'thread' | 'note' | 'scripture' | 'text';
export type SpaceStudySuggestionStatus = 'open' | 'accepted' | 'declined';

/** What the suggester sees of their own row. */
export type MySpaceStudySuggestion = {
  id: string;
  kind: SpaceStudySuggestionKind;
  refId: string | null;
  /** The Thread or Note's current title, resolved at read time. */
  refTitle: string | null;
  scriptureReference: string | null;
  body: string | null;
  status: SpaceStudySuggestionStatus;
  becameThreadId: string | null;
  createdAt: string | null;
  reviewedAt: string | null;
};

/** The queue adds who asked — the one place a member is named. */
export type SpaceStudySuggestionForReview = MySpaceStudySuggestion & {
  suggestedByName: string;
  leaderReadAt: string | null;
};

export const spaceStudySuggestionsMineQueryKey = (
  userId: string | null | undefined,
  spaceId: string | null | undefined,
) => ['space-study-suggestions', 'mine', userId ?? 'none', spaceId ?? 'none'] as const;

export const spaceStudySuggestionsQueueQueryKey = (
  userId: string | null | undefined,
  spaceId: string | null | undefined,
) => ['space-study-suggestions', 'queue', userId ?? 'none', spaceId ?? 'none'] as const;

function base(spaceId: string) {
  return `/api/spaces/${encodeURIComponent(spaceId)}/study-suggestions`;
}

/** What you have proposed in this room, and what became of it. */
export function useMySpaceStudySuggestions(
  spaceId: string | null | undefined,
  options?: { enabled?: boolean },
) {
  const { userId } = useAuth();
  const authReady = useAuthReady();
  const id = normalizePrototypeApiSpaceId(spaceId ?? undefined) ?? null;

  return useQuery({
    queryKey: spaceStudySuggestionsMineQueryKey(userId, id),
    enabled: authReady && !!userId && !!id && options?.enabled !== false,
    queryFn: () =>
      api.get<{ mode: StudyPlanningMode; suggestions: MySpaceStudySuggestion[] }>(
        `${base(id!)}/mine`,
      ),
    staleTime: 60_000,
    retry: false,
  });
}

/** The leader's queue. Server-gated; a refusal means "not a reviewer". */
export function useSpaceStudySuggestionQueue(
  spaceId: string | null | undefined,
  options?: { enabled?: boolean; status?: 'open' | 'all' },
) {
  const { userId } = useAuth();
  const authReady = useAuthReady();
  const id = normalizePrototypeApiSpaceId(spaceId ?? undefined) ?? null;
  const status = options?.status ?? 'open';

  return useQuery({
    queryKey: [...spaceStudySuggestionsQueueQueryKey(userId, id), status] as const,
    enabled: authReady && !!userId && !!id && options?.enabled === true,
    queryFn: () =>
      api.get<{ mode: StudyPlanningMode; suggestions: SpaceStudySuggestionForReview[] }>(
        `${base(id!)}?status=${status}`,
      ),
    staleTime: 30_000,
    retry: false,
  });
}

export type SuggestSpaceStudyInput =
  | { kind: 'thread'; refId: string; body?: string | null }
  | { kind: 'note'; refId: string; body?: string | null }
  | { kind: 'scripture'; scriptureReference: string; body?: string | null }
  | { kind: 'text'; body: string };

/** Propose what the room studies next. */
export function useSuggestSpaceStudy(spaceId: string | null | undefined) {
  const queryClient = useQueryClient();
  const { userId } = useAuth();
  const id = normalizePrototypeApiSpaceId(spaceId ?? undefined) ?? null;

  return useMutation({
    mutationFn: (input: SuggestSpaceStudyInput) => {
      if (!id) throw new Error('No space');
      return api.post<{ success: boolean; suggestion: MySpaceStudySuggestion }>(
        `${base(id)}/create`,
        input,
      );
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: spaceStudySuggestionsMineQueryKey(userId, id) });
      void queryClient.invalidateQueries({ queryKey: ['space-study-suggestions', 'queue'] });
    },
  });
}

/** Take your own open suggestion back. */
export function useWithdrawSpaceStudySuggestion(spaceId: string | null | undefined) {
  const queryClient = useQueryClient();
  const { userId } = useAuth();
  const id = normalizePrototypeApiSpaceId(spaceId ?? undefined) ?? null;

  return useMutation({
    mutationFn: (input: { suggestionId: string }) => {
      if (!id) throw new Error('No space');
      return api.post<{ success: boolean }>(`${base(id)}/withdraw`, input);
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: spaceStudySuggestionsMineQueryKey(userId, id) });
      void queryClient.invalidateQueries({ queryKey: ['space-study-suggestions', 'queue'] });
    },
  });
}

/**
 * Accept or decline. Accepting pins a Thread, so everything that shows the
 * room's Current Thread is invalidated too — the same list
 * `useSetCurrentSpaceThread` refreshes.
 */
export function useReviewSpaceStudySuggestion(spaceId: string | null | undefined) {
  const queryClient = useQueryClient();
  const id = normalizePrototypeApiSpaceId(spaceId ?? undefined) ?? null;

  return useMutation({
    mutationFn: (input: { suggestionId: string; action: 'accept' | 'decline' }) => {
      if (!id) throw new Error('No space');
      return api.post<{ success: boolean; status: SpaceStudySuggestionStatus; threadId?: string }>(
        `${base(id)}/review`,
        input,
      );
    },
    onSettled: (_data, _error, variables) => {
      void queryClient.invalidateQueries({ queryKey: ['space-study-suggestions'] });
      if (variables.action === 'accept') {
        void queryClient.invalidateQueries({ queryKey: spaceGroupThreadsQueryKey(id ?? undefined) });
        if (id) void queryClient.invalidateQueries({ queryKey: ['space', id, 'bootstrap'] });
        void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
        void queryClient.invalidateQueries({ queryKey: [...navigationQueryKeyPrefix] });
      }
    },
  });
}

/** The leader has looked. Clears the unread count on the Tools row. */
export function useMarkSpaceStudySuggestionsRead(spaceId: string | null | undefined) {
  const queryClient = useQueryClient();
  const id = normalizePrototypeApiSpaceId(spaceId ?? undefined) ?? null;

  return useMutation({
    mutationFn: () => {
      if (!id) throw new Error('No space');
      return api.post<{ success: boolean }>(`${base(id)}/mark-read`, {});
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ['space-study-suggestions', 'queue'] });
    },
  });
}

/**
 * The Tools row's second line.
 *
 * A reviewer reads the queue: how many are waiting, and how many they have not
 * seen. A member reads their own: whether anything of theirs is still waiting,
 * or an invitation to say something.
 */
export function spaceStudySuggestionsToolMeta(input: {
  canReview: boolean;
  queue: readonly Pick<SpaceStudySuggestionForReview, 'leaderReadAt'>[] | undefined;
  mine: readonly Pick<MySpaceStudySuggestion, 'status'>[] | undefined;
}): string {
  if (input.canReview) {
    const waiting = input.queue?.length ?? 0;
    if (waiting === 0) return 'Nothing waiting';
    const unread = input.queue?.filter((row) => !row.leaderReadAt).length ?? 0;
    const count = waiting === 1 ? '1 waiting' : `${waiting} waiting`;
    return unread > 0 ? `${count} · ${unread} new` : count;
  }
  const open = input.mine?.filter((row) => row.status === 'open').length ?? 0;
  if (open === 0) return 'Suggest what we study next';
  return open === 1 ? '1 of yours waiting' : `${open} of yours waiting`;
}
