/**
 * A missed question comes back once, at the tail of the same sitting.
 *
 * Tested through the cache rather than the component, because every way this can go wrong is a
 * cache-shaped mistake: appending twice, appending a practice answer's own re-ask, serving the
 * cached reveal of the question that was just answered, or rebuilding the session object around
 * `items` and dropping the fields beside it.
 *
 * The session is `staleTime: Infinity` on purpose — refetching mid-sitting would reshuffle the
 * queue under the reader — so the re-append is a `setQueryData` on a frozen list, which is
 * exactly the kind of edit that deserves a test of its own.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, act, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';

const post = vi.fn();
vi.mock('../../../lib/api', () => ({ api: { post: (...args: unknown[]) => post(...args) } }));
vi.mock('@/utils/toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../../../lib/error-copy', () => ({ toastError: vi.fn() }));

const { useReviewOutcome } = await import('../useReviewMutations');
const { reviewSessionQueryKey, reviewRevealQueryKey } = await import('../../queries/useReview');

const SESSION = reviewSessionQueryKey;

function item(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    kind: 'verse',
    prompt: 'Finish the verse',
    promptKey: 'verse.recall',
    translation: 'NET',
    ladderStep: 1,
    reviewCount: 2,
    ...overrides,
  };
}

function harness() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  /* `nextDueAt` rides beside `items` on this key; a re-append must not lose it. */
  queryClient.setQueryData(SESSION, {
    items: [item('a'), item('b')],
    nextDueAt: '2026-09-18T09:00:00.000Z',
  });
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  const { result } = renderHook(() => useReviewOutcome(), { wrapper });
  return { queryClient, result };
}

const sessionItems = (queryClient: QueryClient): string[] =>
  (queryClient.getQueryData<{ items: { id: string }[] }>(SESSION)?.items ?? []).map((i) => i.id);

describe('a missed question returns once in the same sitting', () => {
  beforeEach(() => {
    post.mockReset();
  });

  it('appends it at the tail, marked as a second look', async () => {
    const { queryClient, result } = harness();
    post.mockResolvedValue({
      outcome: 'revealed',
      correct: false,
      finalized: true,
      item: item('a', { reviewCount: 3 }),
      next: { intervalDays: 1, dueAt: '', recallState: 'fragile', label: 'tomorrow' },
    });

    await act(async () => {
      await result.current.mutateAsync({ itemId: 'a', outcome: 'almost' });
    });

    await waitFor(() => expect(sessionItems(queryClient)).toEqual(['b', 'a']));
    const reasked = queryClient
      .getQueryData<{ items: { id: string; practice?: boolean }[] }>(SESSION)!
      .items.find((i) => i.id === 'a');
    expect(reasked?.practice).toBe(true);
    /* The question it carries is a fresh one: the seed includes the review count. */
    expect(queryClient.getQueryData<{ items: { reviewCount: number }[] }>(SESSION)!.items[1])
      .toMatchObject({ reviewCount: 3 });
  });

  it('keeps the fields that ride beside the queue', async () => {
    const { queryClient, result } = harness();
    post.mockResolvedValue({
      outcome: 'revealed',
      correct: false,
      finalized: true,
      item: item('a', { reviewCount: 3 }),
      next: { intervalDays: 1, dueAt: '', recallState: 'fragile', label: 'tomorrow' },
    });

    await act(async () => {
      await result.current.mutateAsync({ itemId: 'a', outcome: 'almost' });
    });

    await waitFor(() =>
      expect(queryClient.getQueryData<{ nextDueAt?: string }>(SESSION)?.nextDueAt).toBe(
        '2026-09-18T09:00:00.000Z',
      ),
    );
  });

  it('drops the reveal it already showed', async () => {
    /* Reveals are cached for five minutes, so without this the second look would serve the
       exact exercise the reader has just been shown the answer to. */
    const { queryClient, result } = harness();
    queryClient.setQueryData(reviewRevealQueryKey('a', 'NET'), { verseText: 'the answer' });
    post.mockResolvedValue({
      outcome: 'revealed',
      correct: false,
      finalized: true,
      item: item('a', { reviewCount: 3 }),
      next: { intervalDays: 1, dueAt: '', recallState: 'fragile', label: 'tomorrow' },
    });

    await act(async () => {
      await result.current.mutateAsync({ itemId: 'a', outcome: 'almost' });
    });

    await waitFor(() =>
      expect(queryClient.getQueryData(reviewRevealQueryKey('a', 'NET'))).toBeUndefined(),
    );
  });

  it('does not re-ask the second look itself', async () => {
    const { queryClient, result } = harness();
    post.mockResolvedValue({
      practice: true,
      outcome: 'revealed',
      correct: false,
      finalized: true,
      next: { intervalDays: 1, dueAt: '', recallState: 'fragile', label: 'tomorrow' },
    });

    await act(async () => {
      await result.current.mutateAsync({ itemId: 'a', outcome: 'almost', practice: true });
    });

    await waitFor(() => expect(sessionItems(queryClient)).toEqual(['b']));
  });

  it('leaves a recalled answer gone', async () => {
    const { queryClient, result } = harness();
    post.mockResolvedValue({
      outcome: 'recalled',
      correct: true,
      finalized: true,
      item: item('a', { reviewCount: 3 }),
      next: { intervalDays: 14, dueAt: '', recallState: 'forming', label: 'in two weeks' },
    });

    await act(async () => {
      await result.current.mutateAsync({ itemId: 'a', outcome: 'almost' });
    });

    await waitFor(() => expect(sessionItems(queryClient)).toEqual(['b']));
  });

  it('puts the queue back when the answer does not land', async () => {
    const { queryClient, result } = harness();
    post.mockRejectedValue(new Error('offline'));

    await act(async () => {
      await result.current.mutateAsync({ itemId: 'a', outcome: 'almost' }).catch(() => {});
    });

    await waitFor(() => expect(sessionItems(queryClient)).toEqual(['a', 'b']));
  });
});
