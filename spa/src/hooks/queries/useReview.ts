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
  translation?: string | null;
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
    options: string[];
  } | null;
  next?: { options: string[] } | null;
  altered?: { tokens: string[] } | null;
  choice?: { options: string[]; opening: boolean } | null;
  initials?: { initials: string; wordCount: number } | null;
  keywords?: { count: number } | null;
  before?: { options: string[] } | null;
  thread?: { title: string | null; members: { id: string; title: string | null }[] } | null;
}

export const reviewQueryKey = ['review'] as const;
export const reviewInboxQueryKey = ['review', 'inbox'] as const;
export const reviewSessionQueryKey = ['review', 'session'] as const;
export const reviewItemsQueryKey = (status?: ReviewItemStatus, view: 'full' | 'summary' = 'full') =>
  ['review', 'items', status ?? 'all', view] as const;

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
        queryClient.setQueryData(['review', 'reveal', data.items[0].id], data.firstReveal);
      }
      return data;
    },
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });
}

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

export function useReviewReveal(itemId: string | null, options?: { enabled?: boolean; translation?: string }) {
  const authReady = useAuthReady();
  const access = useReviewAccess();
  const featureEnabled = authReady && access;
  const translation = options?.translation;
  return useQuery({
    queryKey: ['review', 'reveal', itemId ?? 'none', translation ?? 'default'] as const,
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

export interface ReviewSampleView {
  reference: string;
  source: 'yours' | 'well-known';
  cloze: { segments: string[]; blankLengths: number[] };
  blankCount: number;
  translation?: string;
}

export function reviewSampleDayKey(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function useReviewSample(options: { enabled: boolean; translation?: string }) {
  const authReady = useAuthReady();
  const access = useReviewAccess();
  const day = reviewSampleDayKey();
  const translation = options.translation;
  return useQuery({
    queryKey: ['review', 'sample', day, translation ?? 'default'] as const,
    enabled: authReady && !access && options.enabled,
    queryFn: () =>
      api.get<{ sample: ReviewSampleView | null }>(
        `/api/review/sample?day=${encodeURIComponent(day)}${
          translation ? `&translation=${encodeURIComponent(translation)}` : ''
        }`,
      ),
    staleTime: 5 * 60_000,
  });
}
