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

/*
 * Called unconditionally, then combined — never `authReady && useAccess()`.
 *
 * `&&` short-circuits, so the access hook is skipped while auth is still resolving and called
 * once it settles. That changes the number of hooks between two renders of the same component,
 * which is a Rules of Hooks violation, and React tears the tree down with an error that names
 * neither this file nor the real cause.
 *
 * It only fires on the false-to-true auth transition, so every signed-out path looks fine —
 * which is exactly how it reached a signed-in browser. Keep the call on its own line.
 */
/** Holds the key and is a real account. See the note in useReview.ts on why auth is separate. */
function useChallengeAccess(): boolean {
  const { has } = useHasFeature('challenges');
  const { isGuest } = useHarvousIdentity();
  return has && !isGuest;
}

export function useChallengesEnabled(): boolean {
  const authReady = useAuthReady();
  const access = useChallengeAccess();
  return authReady && access;
}

export function useChallenges(status?: ChallengeStatus) {
  const authReady = useAuthReady();
  const access = useChallengeAccess();
  const enabled = authReady && access;
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
  const access = useChallengeAccess();
  const enabled = authReady && access;
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
