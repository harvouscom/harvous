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
import { reviewRungIsGraded } from '@/utils/review-prompts';
import { api } from '../../lib/api';
import { useAuthReady } from '../useAuthReady';
import { useHasFeature } from '../useHasFeature';
import { useHarvousIdentity } from '../useHarvousIdentity';
import { isQuerySettled } from '@/utils/prototype-home-ready';
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
  task: string;
  /** Which kind of exercise this is, resolved server-side so the client never re-derives a rung. */
  exercise?: { id: string; label: string; icon: string; typed: boolean } | null;
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
  noteLabel: string | null;
  noteContext: string | null;
  noteWrittenAt: string | null;
  scriptureReference: string | null;
  noteId: string | null;
  challengeId: string | null;
  sourceLabel: string | null;
  sourceAt: string | null;
  cue: string | null;
  /**
   * The wording this question is asked in — the item's own, or the account's default, resolved
   * server-side. Never optional: a question always has a wording, and the dock must not re-derive
   * one from the profile.
   */
  translation: string;
}

export interface ReviewItemSummary {
  id: string;
  kind: ReviewItemKind;
  status: ReviewItemStatus;
  recallState: RecallState;
  dueAt: string;
  scriptureReference: string | null;
  noteId: string | null;
}

export interface ReviewInboxResponse {
  items: ReviewItemView[];
  hasMore: boolean;
  coldStart: {
    ready: number;
    needed: number;
    opensAt: string | null;
  } | null;
}

export interface ReviewRevealResponse {
  note?: { id: string; title: string | null; content: string } | null;
  secondaryNote?: { id: string; title: string | null; content: string } | null;
  verseText?: string | null;
  cloze?: { segments: string[]; blankLengths: number[] } | null;
  sequence?: { phrases: string[] } | null;
  locate?: { phrase: string; options: string[] } | null;
  noteChoice?: {
    fragment: string | null;
    span?: { before: string; quote: string; after: string } | null;
    /** The stem is a clause cut from a longer sentence; the card marks it as partial. */
    truncated?: boolean;
    options: string[];
  } | null;
  next?: { options: string[] } | null;
  altered?: { tokens: string[] } | null;
  choice?: { options: string[]; opening: boolean } | null;
  initials?: {
    initials: string;
    wordCount: number;
    /** 0 and 1 reduce a share of the words and carry `segments`; 2 is the whole-verse skeleton. */
    tier: number;
    segments?: { segments: string[]; blankLengths: number[]; letters: string[] } | null;
  } | null;
  /** How much of the verse the recall rung gives away before the reader writes the rest. */
  recall?: { shown: string | null; mode: string } | null;
  /** Where in the reader's Harvous this question came from, for the card shown after it. */
  context?: {
    sourceLabel: string | null;
    sourceAt: string | null;
    annotation: { quote: string | null; thought: string | null } | null;
  } | null;
  keywords?: { count: number } | null;
  before?: { options: string[] } | null;
  thread?: { title: string | null; members: { id: string; title: string | null }[] } | null;
}

export const reviewQueryKey = ['review'] as const;
export const reviewInboxQueryKey = ['review', 'inbox'] as const;
export const reviewSessionQueryKey = ['review', 'session'] as const;
export const reviewItemsQueryKey = (status?: ReviewItemStatus, view: 'full' | 'summary' = 'full') =>
  ['review', 'items', status ?? 'all', view] as const;

/**
 * One key for a reveal, built in one place.
 *
 * It was written out by hand at three sites and two of them were a different key: the prefetch
 * and the session's `firstReveal` seeding wrote three elements, while `useReviewReveal` read four
 * — the translation the rung was asked in, defaulting to `'default'`. So neither warm path ever
 * hit the cache the card reads, and every graded question paid a full round trip and showed its
 * loading dots with the answer already sitting in the query client under a neighbouring key.
 */
export const reviewRevealQueryKey = (itemId: string | null | undefined, translation?: string) =>
  ['review', 'reveal', itemId ?? 'none', translation ?? 'default'] as const;

function useReviewAccess(): boolean {
  const { has } = useHasFeature('review');
  const { isGuest } = useHarvousIdentity();
  return has && !isGuest;
}

export function useReviewEnabled(): boolean {
  const authReady = useAuthReady();
  const access = useReviewAccess();
  return authReady && access;
}

export function useReviewAccessSettled(): boolean {
  const { ready } = useHasFeature('review');
  const { isGuest } = useHarvousIdentity();
  return isGuest || ready;
}

export function useReviewInbox() {
  const authReady = useAuthReady();
  const access = useReviewAccess();
  const accessSettled = useReviewAccessSettled();
  const enabled = authReady && access;
  const query = useQuery({
    queryKey: reviewInboxQueryKey,
    enabled,
    queryFn: () => api.get<ReviewInboxResponse>('/api/review/inbox'),
    staleTime: 60_000,
  });
  return {
    ...query,
    isSettled:
      accessSettled && isQuerySettled(query.isPending, query.data != null, query.isEnabled),
  };
}

export function useReviewItems(status?: ReviewItemStatus, options?: { enabled?: boolean }) {
  const authReady = useAuthReady();
  const access = useReviewAccess();
  const accessSettled = useReviewAccessSettled();
  const enabled = authReady && access;
  const query = useQuery({
    queryKey: reviewItemsQueryKey(status),
    enabled: enabled && options?.enabled !== false,
    queryFn: () =>
      api.get<{ items: ReviewItemView[] }>(
        status ? `/api/review/items?status=${encodeURIComponent(status)}` : '/api/review/items',
      ),
    staleTime: 30_000,
  });
  return {
    ...query,
    isSettled:
      accessSettled && isQuerySettled(query.isPending, query.data != null, query.isEnabled),
  };
}

export function useReviewItemsSummary(status?: ReviewItemStatus, options?: { enabled?: boolean }) {
  const authReady = useAuthReady();
  const access = useReviewAccess();
  const accessSettled = useReviewAccessSettled();
  const enabled = authReady && access;
  const query = useQuery({
    queryKey: reviewItemsQueryKey(status, 'summary'),
    enabled: enabled && options?.enabled !== false,
    queryFn: () =>
      api.get<{ items: ReviewItemSummary[] }>(
        status
          ? `/api/review/items?status=${encodeURIComponent(status)}&view=summary`
          : '/api/review/items?view=summary',
      ),
    staleTime: 30_000,
  });
  return {
    ...query,
    isSettled:
      accessSettled && isQuerySettled(query.isPending, query.data != null, query.isEnabled),
  };
}

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
        nextDueAt?: string | null;
      }>('/api/review/session');
      if (data.firstReveal && data.items[0]) {
        queryClient.setQueryData(reviewRevealQueryKey(data.items[0].id), data.firstReveal);
      }
      return data;
    },
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

const REVEAL_STALE_MS = 5 * 60_000;
/** How many reveals to have in flight at once while warming a sitting. Gentle on the pool. */
const REVEAL_PREFETCH_CONCURRENCY = 2;

/**
 * Warm every reveal in the sitting, so "Next one" never waits.
 *
 * This replaced a one-ahead prefetch that never hit the cache anyway (see `reviewRevealQueryKey`).
 * One ahead was also the wrong shape: the reader moves through a sitting at their own pace, and
 * a prefetch that only starts when they reach the previous question is a prefetch that is still
 * in flight when they press the button. A sitting is at most eight questions; warming all of them
 * once the session lands is a few seconds of background work for a card that then opens each one
 * instantly.
 *
 * Only the marked rungs, whose reveal *is* the exercise. On a self-judged rung the fetch is the
 * signal "I need to see it", and warming it would record a look that never happened.
 *
 * Two at a time, in order, skipping anything already warm — the head is usually seeded by the
 * session itself. A long queue does not become a burst against the database, and the reader's
 * next question is still the first thing in line.
 */
export function usePrefetchReviewReveals(
  items: readonly { id: string; kind: string; ladderStep?: number | null; promptKey?: string | null }[],
) {
  const queryClient = useQueryClient();
  const authReady = useAuthReady();
  const access = useReviewAccess();
  const ids = items
    .filter((item) => reviewRungIsGraded(item))
    .map((item) => item.id)
    .join('|');
  useEffect(() => {
    if (!ids || !authReady || !access) return;
    let cancelled = false;
    const queue = ids.split('|');
    const next = async (): Promise<void> => {
      while (!cancelled && queue.length) {
        const itemId = queue.shift()!;
        const key = reviewRevealQueryKey(itemId);
        const state = queryClient.getQueryState(key);
        if (state?.data && Date.now() - state.dataUpdatedAt < REVEAL_STALE_MS) continue;
        await queryClient
          .prefetchQuery({
            queryKey: key,
            queryFn: () =>
              api.get<ReviewRevealResponse>(`/api/review/items/${encodeURIComponent(itemId)}/reveal`),
            staleTime: REVEAL_STALE_MS,
          })
          .catch(() => {});
      }
    };
    void Promise.all(Array.from({ length: REVEAL_PREFETCH_CONCURRENCY }, next));
    return () => {
      cancelled = true;
    };
  }, [ids, authReady, access, queryClient]);
}

export function useReviewReveal(itemId: string | null, options?: { enabled?: boolean; translation?: string }) {
  const authReady = useAuthReady();
  const access = useReviewAccess();
  const featureEnabled = authReady && access;
  const translation = options?.translation;
  return useQuery({
    queryKey: reviewRevealQueryKey(itemId, translation),
    enabled: featureEnabled && Boolean(itemId) && options?.enabled === true,
    queryFn: () =>
      api.get<ReviewRevealResponse>(
        `/api/review/items/${encodeURIComponent(itemId!)}/reveal${
          translation ? `?translation=${encodeURIComponent(translation)}` : ''
        }`,
      ),
    staleTime: 5 * 60_000,
  });
}

export type SampleExerciseKind = 'blanks' | 'letters' | 'order' | 'next';

export type ReviewSampleExerciseView =
  | { kind: 'blanks'; cloze: { segments: string[]; blankLengths: number[] }; blankCount: number }
  | { kind: 'letters'; initials: string; wordCount: number }
  | { kind: 'order'; phrases: string[] }
  | { kind: 'next'; options: string[] };

export interface ReviewSampleView {
  reference: string;
  source: 'yours' | 'well-known';
  translation?: string;
  exercise: ReviewSampleExerciseView;
  /** Which kinds this verse can carry, so the chips only offer what will build. */
  available: SampleExerciseKind[];
}

export function reviewSampleDayKey(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function useReviewSample(options: {
  enabled: boolean;
  translation?: string;
  exercise?: SampleExerciseKind;
}) {
  const authReady = useAuthReady();
  const access = useReviewAccess();
  const day = reviewSampleDayKey();
  const translation = options.translation;
  const exercise = options.exercise;
  return useQuery({
    queryKey: ['review', 'sample', day, translation ?? 'default', exercise ?? 'blanks'] as const,
    enabled: authReady && !access && options.enabled,
    queryFn: () =>
      api.get<{ sample: ReviewSampleView | null }>(
        `/api/review/sample?day=${encodeURIComponent(day)}${
          translation ? `&translation=${encodeURIComponent(translation)}` : ''
        }${exercise ? `&exercise=${encodeURIComponent(exercise)}` : ''}`,
      ),
    staleTime: 5 * 60_000,
  });
}
