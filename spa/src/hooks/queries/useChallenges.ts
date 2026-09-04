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
export const challengeListQueryKey = (status?: ChallengeStatus | readonly ChallengeStatus[]) =>
  ['challenges', 'list', challengeStatusParam(status) ?? 'all'] as const;
export const challengeQueryKey = (id: string) => ['challenges', 'one', id] as const;

/**
 * One status or several, as the server reads them: comma-separated, in the order given.
 *
 * The order is the caller's and is not sorted, so `['paused', 'active']` and
 * `['active', 'paused']` are two keys for one list. Passing the constant below rather than
 * an inline array is what keeps that from happening.
 */
function challengeStatusParam(
  status?: ChallengeStatus | readonly ChallengeStatus[],
): string | undefined {
  if (!status) return undefined;
  const list = typeof status === 'string' ? [status] : status;
  return list.length > 0 ? list.join(',') : undefined;
}

/**
 * What Home needs, in one request.
 *
 * Two rows on Activity ask about challenges — the Review section wants what is open, and the
 * Strengthen row wants open *and* paused, since a Thread the reader put down is not an offer to
 * make again. Asked separately that was two round trips for two overlapping lists, so they share
 * this one and each filters it. Paused lists are short; the filtering is free next to the fetch.
 */
export const HOME_CHALLENGE_STATUSES: readonly ChallengeStatus[] = ['active', 'paused'];

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

export function useChallenges(status?: ChallengeStatus | readonly ChallengeStatus[]) {
  const authReady = useAuthReady();
  const access = useChallengeAccess();
  const enabled = authReady && access;
  const statusParam = challengeStatusParam(status);
  return useQuery({
    queryKey: challengeListQueryKey(status),
    enabled,
    queryFn: () =>
      api.get<{ challenges: ChallengeView[] }>(
        statusParam ? `/api/challenges?status=${encodeURIComponent(statusParam)}` : '/api/challenges',
      ),
    staleTime: 60_000,
  });
}

/** The shared Home list. See {@link HOME_CHALLENGE_STATUSES}. */
export function useHomeChallenges() {
  return useChallenges(HOME_CHALLENGE_STATUSES);
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
