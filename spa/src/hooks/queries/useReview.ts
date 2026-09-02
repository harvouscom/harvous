/**
 * Review's reads.
 *
 * Every query here is gated three ways — signed in, holds the key, not a guest — because a
 * request that would 403 is a request worth not making. The gate is not a security boundary;
 * `requireFeature` on the server is. It exists so a free account's Activity page does not fire
 * two doomed requests on every load.
 */
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useAuthReady } from '../useAuthReady';
import { useHasFeature } from '../useHasFeature';
import { useHarvousIdentity } from '../useHarvousIdentity';
import type {
  RecallState,
  ReviewItemKind,
  ReviewItemOrigin,
  ReviewItemStatus,
} from '@/utils/review-item-kinds';
import type { VerseCloze } from '@/utils/verse-cloze';

export interface ReviewItemView {
  id: string;
  kind: ReviewItemKind;
  prompt: string;
  promptKey: string;
  recallState: RecallState;
  status: ReviewItemStatus;
  origin: ReviewItemOrigin;
  dueAt: string;
  reviewCount: number;
  ladderStep: number;
  noteTitle: string | null;
  secondaryNoteTitle: string | null;
  scriptureReference: string | null;
  noteId: string | null;
  challengeId: string | null;
  /** Why this row is here, in the reader's words. Null on items they added themselves. */
  sourceLabel: string | null;
  sourceAt: string | null;
}

export interface ReviewInboxResponse {
  items: ReviewItemView[];
  /** A boolean, never a count — see the route's docblock. */
  hasMore: boolean;
}

export interface ReviewRevealResponse {
  note?: { id: string; title: string | null; content: string } | null;
  secondaryNote?: { id: string; title: string | null; content: string } | null;
  verseText?: string | null;
  cloze?: VerseCloze | null;
  /** The ordering rung's phrases, shuffled. The order they belong in stays on the server. */
  sequence?: { phrases: string[] } | null;
  /** The locate rung's fragment and four references. Which one is right stays on the server. */
  locate?: { phrase: string; options: string[] } | null;
  thread?: { title: string | null; members: { id: string; title: string | null }[] } | null;
}

export const reviewQueryKey = ['review'] as const;
export const reviewInboxQueryKey = ['review', 'inbox'] as const;
export const reviewSessionQueryKey = ['review', 'session'] as const;
export const reviewItemsQueryKey = (status?: ReviewItemStatus) =>
  ['review', 'items', status ?? 'all'] as const;

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
/**
 * Holds the key and is a real account — the half of the gate that is not session readiness.
 *
 * Session readiness is deliberately *not* folded in here. `check:auth-gated-queries` reads
 * each hook on its own and wants `useAuthReady()` visible at the call site, and it is right
 * to: burying the gate one call deep is exactly how fourteen hooks lost it before, and a
 * reader skimming a query cannot see a gate that lives in another function.
 */
function useReviewAccess(): boolean {
  const { has } = useHasFeature('review');
  const { isGuest } = useHarvousIdentity();
  return has && !isGuest;
}

/** True when Review is worth asking the server about at all. */
export function useReviewEnabled(): boolean {
  const authReady = useAuthReady();
  const access = useReviewAccess();
  return authReady && access;
}

export function useReviewInbox() {
  const authReady = useAuthReady();
  const access = useReviewAccess();
  const enabled = authReady && access;
  return useQuery({
    queryKey: reviewInboxQueryKey,
    enabled,
    queryFn: () => api.get<ReviewInboxResponse>('/api/review/inbox'),
    staleTime: 60_000,
  });
}

export function useReviewItems(status?: ReviewItemStatus, options?: { enabled?: boolean }) {
  const authReady = useAuthReady();
  const access = useReviewAccess();
  const enabled = authReady && access;
  return useQuery({
    queryKey: reviewItemsQueryKey(status),
    // The caller's `enabled` narrows, never widens: the dock only wants this list when the
    // session cannot answer, and no caller may bypass the auth/entitlement gate.
    enabled: enabled && options?.enabled !== false,
    queryFn: () =>
      api.get<{ items: ReviewItemView[] }>(
        status ? `/api/review/items?status=${encodeURIComponent(status)}` : '/api/review/items',
      ),
    staleTime: 30_000,
  });
}

/**
 * A sitting's worth of questions.
 *
 * `staleTime: Infinity` and no refetch on focus: the session is a fixed set once it starts.
 * Tabbing away mid-answer and coming back to a reshuffled queue would lose the reader's place
 * in the one place where losing it costs them an answer they had already thought of.
 */
export function useReviewSession(options?: { enabled?: boolean }) {
  const authReady = useAuthReady();
  const access = useReviewAccess();
  const enabled = authReady && access;
  return useQuery({
    queryKey: reviewSessionQueryKey,
    enabled: enabled && options?.enabled !== false,
    queryFn: () => api.get<{ items: ReviewItemView[] }>('/api/review/session'),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

/**
 * The answer behind the question, fetched only when asked for.
 *
 * Disabled until `enabled` flips, which is what makes the reveal a deliberate act rather than
 * something already sitting in the page while the question is on screen.
 */
export function useReviewReveal(itemId: string | null, options?: { enabled?: boolean }) {
  const authReady = useAuthReady();
  const access = useReviewAccess();
  const featureEnabled = authReady && access;
  return useQuery({
    queryKey: ['review', 'reveal', itemId ?? 'none'] as const,
    enabled: featureEnabled && Boolean(itemId) && options?.enabled === true,
    queryFn: () => api.get<ReviewRevealResponse>(`/api/review/items/${encodeURIComponent(itemId!)}/reveal`),
    staleTime: 5 * 60_000,
  });
}
