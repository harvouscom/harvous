/**
 * The getting-started checklist ticks where the thing happens, not only on Home.
 *
 * Each of these mutations is the one shared path behind several surfaces (the connect sheet,
 * the Inspector and thread proposals all go through `useConnectNote`; the reader's picker and
 * Settings both go through `useUpdateTranslation`). Marking in the hook is what makes a row
 * tick however the user got there, so the test is on the hook: success marks, failure doesn't.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, act } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';

const post = vi.fn();
const markOnboardingStep = vi.fn();

vi.mock('../../../lib/api', () => ({
  api: { post: (...args: unknown[]) => post(...args) },
  APIError: class APIError extends Error {},
}));
vi.mock('../../../lib/proto-onboarding-sync', () => ({
  markOnboardingStep: (...args: unknown[]) => markOnboardingStep(...args),
}));
vi.mock('../withOfflineQueue', () => ({
  runOfflineFirst: async ({ online }: { online: () => Promise<unknown> }) => ({
    queued: false,
    online: await online(),
  }),
  isOfflineError: () => false,
}));
vi.mock('@clerk/clerk-react', () => ({ useAuth: () => ({ userId: 'user_test' }) }));
vi.mock('../../useHarvousIdentity', () => ({ useHarvousIdentity: () => ({ isGuest: false }) }));
vi.mock('@/utils/toast', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('../../../lib/error-copy', () => ({ toastError: vi.fn() }));

const { useConnectNote } = await import('../useConnectNote');
const { useCreateHighlight } = await import('../useCreateHighlight');
const { useUpdateTranslation } = await import('../useUpdateTranslation');
const { useReviewOutcome } = await import('../useReviewMutations');

function wrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) =>
    createElement(QueryClientProvider, { client: queryClient }, children);
}

beforeEach(() => {
  post.mockReset();
  markOnboardingStep.mockReset();
});

type Mutation = { mutateAsync: (vars: never) => Promise<unknown> };

const cases: Array<{ step: string; useHook: () => Mutation; vars: unknown }> = [
  {
    step: 'thread',
    useHook: useConnectNote as never,
    vars: { parentNoteId: 'note_a', linkedNoteId: 'note_b', spaceId: 'space_1' },
  },
  {
    step: 'highlight',
    useHook: useCreateHighlight as never,
    vars: { parentNoteId: 'note_a', spaceId: 'space_1', entryKind: 'scriptureLink' },
  },
  { step: 'translation', useHook: useUpdateTranslation as never, vars: 'ESV' },
  { step: 'recall', useHook: useReviewOutcome as never, vars: { itemId: 'item_1', outcome: 'remembered' } },
];

describe.each(cases)('the $step row', ({ step, useHook, vars }) => {
  async function run() {
    const { result } = renderHook(() => useHook(), { wrapper: wrapper() });
    await act(async () => {
      await result.current.mutateAsync(vars as never).catch(() => {});
    });
  }

  it('ticks when the mutation succeeds, wherever it was started', async () => {
    post.mockResolvedValue({ success: true, finalized: true });
    await run();
    expect(markOnboardingStep).toHaveBeenCalledWith(step);
  });

  it('stays unticked when the request fails', async () => {
    post.mockRejectedValue(new Error('offline'));
    await run();
    expect(markOnboardingStep).not.toHaveBeenCalledWith(step);
  });
});
