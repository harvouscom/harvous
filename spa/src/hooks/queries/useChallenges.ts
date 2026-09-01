/**
 * Challenges' reads. Same three-way gate as Review — see `useReview.ts`.
 */
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useAuthReady } from '../useAuthReady';
import { useHasFeature } from '../useHasFeature';
import { useHarvousIdentity } from '../useHarvousIdentity';
import type { ChallengeStatus, ChallengeTemplateKey } from '@/utils/review-item-kinds';
import type { ChallengeStep } from '@/utils/challenge-templates';
import type { VerseCloze } from '@/utils/verse-cloze';

export interface ChallengeView {
  id: string;
  templateKey: ChallengeTemplateKey;
  title: string;
  status: ChallengeStatus;
  steps: ChallengeStep[];
  currentStepIndex: number;
  resolvedSteps: number;
  totalSteps: number;
  sourceNoteId: string | null;
  sourceSecondaryNoteId: string | null;
  scriptureReference: string | null;
  startedAt: string;
  completedAt: string | null;
}

export interface ChallengeContext {
  members?: { id: string; title: string }[];
  verseText?: string | null;
  cloze?: VerseCloze | null;
}

export const challengesQueryKey = ['challenges'] as const;
export const challengeListQueryKey = (status?: ChallengeStatus) =>
  ['challenges', 'list', status ?? 'all'] as const;
export const challengeQueryKey = (id: string) => ['challenges', 'one', id] as const;

/** Holds the key and is a real account. See the note in useReview.ts on why auth is separate. */
function useChallengeAccess(): boolean {
  const { has } = useHasFeature('challenges');
  const { isGuest } = useHarvousIdentity();
  return has && !isGuest;
}

export function useChallengesEnabled(): boolean {
  const authReady = useAuthReady();
  return authReady && useChallengeAccess();
}

export function useChallenges(status?: ChallengeStatus) {
  const authReady = useAuthReady();
  const enabled = authReady && useChallengeAccess();
  return useQuery({
    queryKey: challengeListQueryKey(status),
    enabled,
    queryFn: () =>
      api.get<{ challenges: ChallengeView[] }>(
        status ? `/api/challenges?status=${encodeURIComponent(status)}` : '/api/challenges',
      ),
    staleTime: 60_000,
  });
}

export function useChallenge(id: string | null) {
  const authReady = useAuthReady();
  const enabled = authReady && useChallengeAccess();
  return useQuery({
    queryKey: challengeQueryKey(id ?? 'none'),
    enabled: enabled && Boolean(id),
    queryFn: () =>
      api.get<{ challenge: ChallengeView; context: ChallengeContext }>(
        `/api/challenges/${encodeURIComponent(id!)}`,
      ),
    staleTime: 30_000,
  });
}
