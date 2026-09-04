/**
 * Review's reads.
 *
 * Every query here is gated three ways — signed in, holds the key, not a guest — because a
 * request that would 403 is a request worth not making. The gate is not a security boundary;
 * `requireFeature` on the server is. It exists so a free account's Activity page does not fire
 * two doomed requests on every load.
 */
import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { ReviewFramingSpec } from '@/utils/review-framing';
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

export interface ReviewItemView {
  id: string;
  kind: ReviewItemKind;
  prompt: string;
  /** The instruction with the subject removed — the row's meta line. */
  task: string;
  /** Why this is here or what it connects to, as a template; render with `fillFraming`. */
  framing: ReviewFramingSpec | null;
  promptKey: string;
  recallState: RecallState;
  status: ReviewItemStatus;
  origin: ReviewItemOrigin;
  dueAt: string;
  reviewCount: number;
  ladderStep: number;
  noteTitle: string | null;
  secondaryNoteTitle: string | null;
  /** Title, else the first passage the note cites — the short answer to "which note?". */
  noteLabel: string | null;
  /** The note's own opening words, shown on the row's context line. */
  noteContext: string | null;
  /** Last resort for a note with neither, formatted client-side where the zone is known. */
  noteWrittenAt: string | null;
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
  /**
   * The verse split at its gaps: `blankLengths.length + 1` pieces of visible text, and how wide
   * each gap was. The tokens and the missing words stay on the server.
   */
  cloze?: { segments: string[]; blankLengths: number[] } | null;
  /** The ordering rung's phrases, shuffled. The order they belong in stays on the server. */
  sequence?: { phrases: string[] } | null;
  /** The locate rung's fragment and four references. Which one is right stays on the server. */
  locate?: { phrase: string; options: string[] } | null;
  /** A note rung's own material and four options. Which is right stays on the server. */
  noteChoice?: {
    fragment: string | null;
    /** The marked span with its run-up, when the stem is one the reader highlighted. */
    span?: { before: string; quote: string; after: string } | null;
    options: string[];
  } | null;
  /** Four openings on "what comes after this?". The next verse's reference is never sent. */
  next?: { options: string[] } | null;
  /** The altered verse. Which word was changed stays on the server. */
  altered?: { tokens: string[] } | null;
  /**
   * The context-step rungs: which note cites this, which theme, who, which cross-reference.
   * Four options; `opening` when they are the first words of passages and should trail off.
   */
  choice?: { options: string[]; opening: boolean } | null;
  /** First letters of every word, and how many words. The verse itself is never sent. */
  initials?: { initials: string; wordCount: number } | null;
  /** How many words to name. Nothing about which. */
  keywords?: { count: number } | null;
  /** Two openings from the same chapter; which comes first stays on the server. */
  before?: { options: string[] } | null;
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
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: reviewSessionQueryKey,
    enabled: enabled && options?.enabled !== false,
    queryFn: async () => {
      const data = await api.get<{
        items: ReviewItemView[];
        firstReveal?: ReviewRevealResponse;
      }>('/api/review/session');
      /*
       * The first question's exercise came with the question, so seed the cache the dock is
       * about to read rather than letting it ask again. Without this the page renders a prompt
       * with no options and fills them in a round trip later.
       */
      if (data.firstReveal && data.items[0]) {
        queryClient.setQueryData(['review', 'reveal', data.items[0].id], data.firstReveal);
      }
      return data;
    },
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
/**
 * Fetch the *next* question's exercise while the reader answers this one.
 *
 * The first question's arrives with the session, so the only remaining wait was between one
 * answer and the next — which is exactly when there is idle time to spend. Same cache key the
 * dock reads, so by the time the card turns over the exercise is already there.
 */
export function usePrefetchReviewReveal(itemId: string | null | undefined) {
  const queryClient = useQueryClient();
  const authReady = useAuthReady();
  const access = useReviewAccess();
  useEffect(() => {
    if (!itemId || !authReady || !access) return;
    void queryClient.prefetchQuery({
      queryKey: ['review', 'reveal', itemId] as const,
      queryFn: () =>
        api.get<ReviewRevealResponse>(`/api/review/items/${encodeURIComponent(itemId)}/reveal`),
      staleTime: 5 * 60_000,
    });
  }, [itemId, authReady, access, queryClient]);
}

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


// ─── The sample, for an account without Review ─────────────────────────────────

export interface ReviewSampleView {
  reference: string;
  /** Whose verse it is: the reader's own study, or a well-known one because nothing of theirs fit. */
  source: 'yours' | 'well-known';
  cloze: { segments: string[]; blankLengths: number[] };
  blankCount: number;
}

/** The reader's local calendar day, which is the seed's half the server cannot know. */
export function reviewSampleDayKey(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Fetched only for a signed-in account *without* the feature: a subscriber has the real
 * thing, and a guest has no account to attach an upgrade to. Auth-gated like every query
 * here, and off until the entitlement is known so nobody is shown a sample for a beat
 * before their real queue.
 */
export function useReviewSample(options: { enabled: boolean }) {
  const authReady = useAuthReady();
  const access = useReviewAccess();
  const day = reviewSampleDayKey();
  return useQuery({
    queryKey: ['review', 'sample', day] as const,
    enabled: authReady && !access && options.enabled,
    queryFn: () =>
      api.get<{ sample: ReviewSampleView | null }>(`/api/review/sample?day=${encodeURIComponent(day)}`),
    staleTime: 5 * 60_000,
  });
}
