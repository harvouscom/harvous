/**
 * Deleting a highlight from the Library: gone on confirm, back only if the server refuses.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, act, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';

let resolveDelete: (value: unknown) => void = () => {};
let rejectDelete: (err: unknown) => void = () => {};
vi.mock('../withOfflineQueue', () => ({
  runOfflineFirst: () =>
    new Promise((resolve, reject) => {
      resolveDelete = (value) => resolve({ queued: false, online: value });
      rejectDelete = reject;
    }),
}));
vi.mock('@/utils/offline-mutations', () => ({ deleteStudyThreadEntryOffline: vi.fn() }));

const { useDeleteHighlight } = await import('../useDeleteHighlight');

const KEY = ['prototype', 'space', 'space_home', 'study-thread-highlights'];

function harness() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  queryClient.setQueryData(KEY, [{ id: 'st_a' }, { id: 'st_b' }]);
  const wrapper = ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
  const { result } = renderHook(() => useDeleteHighlight(), { wrapper });
  const ids = () => (queryClient.getQueryData<{ id: string }[]>(KEY) ?? []).map((r) => r.id);
  return { result, ids };
}

describe('useDeleteHighlight', () => {
  beforeEach(() => vi.clearAllMocks());

  it('drops the row before the server answers', async () => {
    const { result, ids } = harness();
    act(() => result.current.mutate({ id: 'st_a', spaceId: 'home' }));
    await waitFor(() => expect(ids()).toEqual(['st_b']));
    await act(async () => resolveDelete({ success: true, deletedId: 'st_a' }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it('puts the row back when the delete fails', async () => {
    const { result, ids } = harness();
    act(() => result.current.mutate({ id: 'st_a', spaceId: 'home' }));
    await waitFor(() => expect(ids()).toEqual(['st_b']));
    await act(async () => rejectDelete(new Error('500')));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(ids()).toEqual(['st_a', 'st_b']);
  });
});
