/**
 * Challenges' writes. Invalidate the `['challenges']` prefix for the same reason Review does.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { challengesQueryKey, type ChallengeView } from '../queries/useChallenges';
import { reviewQueryKey } from '../queries/useReview';
import type { ChallengeSettableStatus, ChallengeTemplateKey } from '@/utils/review-item-kinds';

export interface CreateChallengeInput {
  templateKey: ChallengeTemplateKey;
  noteId?: string;
  secondaryNoteId?: string;
  repNoteId?: string;
  scriptureReference?: string;
  translation?: string;
  studyThreadEntryId?: string;
}

/**
 * Start a path.
 *
 * A 409 means one is already open, and the server sends its id — so the caller can open the
 * existing challenge instead of showing an error about something the reader cannot see. The
 * error object carries it through; `challengeConflictId` is how a caller reads it.
 */
export function useCreateChallenge() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateChallengeInput) =>
      api.post<{ challenge: ChallengeView }>('/api/challenges', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: challengesQueryKey });
      // A verse path also seeds a review item.
      void queryClient.invalidateQueries({ queryKey: reviewQueryKey });
    },
  });
}

/** The id of the already-open challenge carried on a 409, when there is one. */
export function challengeConflictId(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const data = (error as { data?: unknown }).data;
  if (typeof data === 'object' && data !== null && typeof (data as { existingId?: unknown }).existingId === 'string') {
    return (data as { existingId: string }).existingId;
  }
  const body = (error as { body?: unknown }).body;
  if (typeof body === 'object' && body !== null && typeof (body as { existingId?: unknown }).existingId === 'string') {
    return (body as { existingId: string }).existingId;
  }
  return null;
}

export interface CompleteStepInput {
  challengeId: string;
  stepKey: string;
  status: 'done' | 'skipped';
  artifactNoteId?: string;
  response?: string;
}

export function useCompleteChallengeStep() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ challengeId, stepKey, ...rest }: CompleteStepInput) =>
      api.post<{ challenge: ChallengeView }>(
        `/api/challenges/${encodeURIComponent(challengeId)}/steps/${encodeURIComponent(stepKey)}`,
        rest,
      ),
    onSuccess: (data) => {
      // Seed the single-challenge cache from the response so the page repaints without a
      // second round trip; the lists still refetch.
      queryClient.setQueryData(['challenges', 'one', data.challenge.id], (prev: unknown) =>
        typeof prev === 'object' && prev !== null
          ? { ...(prev as object), challenge: data.challenge }
          : prev,
      );
      void queryClient.invalidateQueries({ queryKey: challengesQueryKey });
    },
  });
}

export function useSetChallengeStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ challengeId, status }: { challengeId: string; status: ChallengeSettableStatus }) =>
      api.post<{ challenge: ChallengeView }>(
        `/api/challenges/${encodeURIComponent(challengeId)}/status`,
        { status },
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: challengesQueryKey });
    },
  });
}
