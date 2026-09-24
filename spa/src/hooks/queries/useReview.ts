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
  /**
   * Client-only: this copy of the item is the second look at something missed.
   *
   * Set when the outcome mutation appends a missed item back onto the sitting. It rides on the
   * cached view rather than coming from the server, because the server's row is unchanged — a
   * practice pass deliberately moves nothing — so there is nothing there to carry it.
   */
  practice?: boolean;
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
  /**
   * How far through today's sitting the reader is — answered, out of a goal.
   *
   * Not a backlog. `goal` is what they have answered plus what is actually on offer, capped at
   * one sitting, so it cannot climb past the day's ceiling however much is waiting behind it.
   * Null when the request carried no trustworthy local midnight, in which case the shelf says
   * "See all" exactly as it always did.
   */
  today?: { answered: number; goal: number } | null;
  coldStart: {
    ready: number;
    needed: number;
    opensAt: string | null;
  } | null;
}

export interface ReviewRevealResponse {
  verseText?: string | null;
  /** `bank`: words to place at the gentlest tier, the answers shuffled among a few wrong ones. */
  cloze?: { segments: string[]; blankLengths: number[]; bank?: string[] } | null;
  sequence?: { phrases: string[] } | null;
  /**
   * `leading` / `trailing` say whether there is really more verse either side of the phrase.
   * Both optional: a payload built before they existed renders as it always did, which for
   * `trailing` means the ellipsis the card used to print unconditionally.
   */
  locate?: {
    phrase: string;
    options: string[];
    leading?: boolean;
    trailing?: boolean;
  } | null;
  noteChoice?: {
    fragment: string | null;
    /** The quote, and the rest of the sentence it was highlighted inside. */
    span?: {
      before: string;
      quote: string;
      after: string;
      leading?: boolean;
      trailing?: boolean;
    } | null;
    /** The stem is a clause cut from a longer sentence; the card marks it as partial. */
    truncated?: boolean;
    /** And the same at the front, for a stem that does not begin where its sentence does. */
    leading?: boolean;
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
  /** `words`: how many are left to write, below the top tier only — never which ones. */
  recall?: { shown: string | null; mode: string; words?: number } | null;
  /** Where in the reader's Harvous this question came from, for the card shown after it. */
  context?: {
    sourceLabel: string | null;
    sourceAt: string | null;
    annotation: { quote: string | null; thought: string | null } | null;
  } | null;
  keywords?: { count: number } | null;
  before?: { options: string[] } | null;
}

export const reviewQueryKey = ['review'] as const;
export const reviewInboxQueryKey = ['review', 'inbox'] as const;
export const reviewSessionQueryKey = ['review', 'session'] as const;

/**
 * The reader's own midnight, as an instant, for the two reads that measure a day.
 *
 * Sent by the client because it is the only end that knows it: there is no per-user timezone on
 * the server worth trusting, and an instant needs no IANA arithmetic there. Rounded to the day
 * rather than sent as "now" so it is stable across a sitting — every request in one day sends
 * the same value, which keeps it out of the cache key's way.
 */
export function readerDayStartISO(now: Date = new Date()): string {
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  return midnight.toISOString();
}

/** The day a cached sitting belongs to, so yesterday's does not survive into this morning. */
export function reviewDayKey(now: Date = new Date()): string {
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  return `${midnight.getFullYear()}-${midnight.getMonth() + 1}-${midnight.getDate()}`;
}
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
    queryFn: () =>
      api.get<ReviewInboxResponse>(
        `/api/review/inbox?dayStart=${encodeURIComponent(readerDayStartISO())}`,
      ),
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
        /** Every marked question's exercise, keyed by item — built before the sitting left. */
        reveals?: Record<string, ReviewRevealResponse>;
        /** The head's alone, from a server older than `reveals`. */
        firstReveal?: ReviewRevealResponse;
        nextDueAt?: string | null;
      }>(`/api/review/session?dayStart=${encodeURIComponent(readerDayStartISO())}`);
      /*
       * Seed each exercise under the key the card reads — with the item's own translation. Seeded
       * under the bare key, a warm copy sat beside the one being looked for and every graded
       * question paid a round trip for an answer already in the cache.
       */
      const reveals =
        data.reveals ??
        (data.firstReveal && data.items[0] ? { [data.items[0].id]: data.firstReveal } : {});
      for (const item of data.items) {
        const reveal = reveals[item.id];
        if (reveal) {
          queryClient.setQueryData(reviewRevealQueryKey(item.id, item.translation ?? undefined), reveal);
        }
      }
      /* The exercises live in their own cache entries now; the sitting is the list and its date. */
      return { items: data.items, nextDueAt: data.nextDueAt };
    },
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

/** How many reveals to have in flight at once while warming a sitting. Gentle on the pool. */
const REVEAL_PREFETCH_CONCURRENCY = 2;

/**
 * Warm any exercise in the sitting that did not arrive with it, so "Next one" never waits.
 *
 * The session carries every marked question's exercise now (`reveals`), so on a normal sitting
 * this finds everything warm and does nothing. It is here for what the session did not build: a
 * missed question appended back for a second look (its cached reveal is removed on purpose — see
 * `useReviewOutcome`), and a page talking to a server older than `reveals`.
 *
 * Only the marked rungs, whose reveal *is* the exercise. On a self-judged rung the fetch is the
 * signal "I need to see it", and warming it would record a look that never happened.
 *
 * Two at a time, in order, skipping anything already cached. A long queue does not become a burst
 * against the database, and the reader's next question is still the first thing in line.
 */
export function usePrefetchReviewReveals(
  items: readonly {
    id: string;
    kind: string;
    ladderStep?: number | null;
    promptKey?: string | null;
    /* Part of the key the card reads with — warming without it fills a neighbouring slot. */
    translation?: string | null;
  }[],
) {
  const queryClient = useQueryClient();
  const authReady = useAuthReady();
  const access = useReviewAccess();
  const ids = items
    .filter((item) => reviewRungIsGraded(item))
    .map((item) => `${item.id}::${item.translation ?? ''}`)
    .join('|');
  useEffect(() => {
    if (!ids || !authReady || !access) return;
    let cancelled = false;
    const queue = ids.split('|');
    const next = async (): Promise<void> => {
      while (!cancelled && queue.length) {
        const [itemId, itemTranslation] = queue.shift()!.split('::');
        const key = reviewRevealQueryKey(itemId, itemTranslation || undefined);
        if (queryClient.getQueryState(key)?.data) continue;
        await queryClient
          .prefetchQuery({
            queryKey: key,
            queryFn: () =>
              api.get<ReviewRevealResponse>(`/api/review/items/${encodeURIComponent(itemId)}/reveal`),
            staleTime: Infinity,
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
    /* The translation keys the cache only. The server asks in the item's own translation and
       never read a query parameter for it, so none is sent. */
    queryFn: () =>
      api.get<ReviewRevealResponse>(`/api/review/items/${encodeURIComponent(itemId!)}/reveal`),
    /*
     * Part of the sitting, and frozen with it. An exercise is built from the same seed the
     * question was, and refetching one mid-sitting — on focus, or after five minutes — only ever
     * put loading dots over an exercise the card already had.
     */
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

export type SampleExerciseKind = 'blanks' | 'letters' | 'order' | 'next';

export type ReviewSampleExerciseView =
  | { kind: 'blanks'; cloze: { segments: string[]; blankLengths: number[]; bank?: string[] }; blankCount: number }
  | { kind: 'letters'; initials: string; wordCount: number }
  | { kind: 'order'; phrases: string[] }
  /* `verse` is optional here: a payload from an older server has none, and the card copes. */
  | { kind: 'next'; options: string[]; verse?: string };

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
