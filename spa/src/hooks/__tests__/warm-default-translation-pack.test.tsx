import React from 'react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * The offline pack downloads the whole canon a book at a time, and it must not do that while the
 * first screen is still asking for its own data.
 *
 * Over HTTP/1.1 the opening burst is already queueing against a six-connection cap, so 66 book
 * requests starting the moment `profile` landed were competing with the page the reader is
 * looking at. Nothing about the pack is urgent — it resumes where it left off and exists for a
 * signal outage that has not happened yet.
 *
 * The other half is the one worth a test: a gate that never opens would silently stop offline
 * packs from ever downloading, and nobody would find out until they lost signal.
 */
const profile = { data: { defaultTranslation: 'NET' } as { defaultTranslation: string } | undefined };
vi.mock('../queries/useProfile', () => ({ useProfile: () => profile }));
vi.mock('../../lib/api', () => ({ api: { get: vi.fn(async () => ({})) } }));

const downloadPack = vi.fn(async () => ({ booksSaved: 66, booksTotal: 66, aborted: false }));
vi.mock('@/utils/bible-pack-store', () => ({
  listPacks: async () => [],
  canAddPack: () => true,
  downloadPack: (...args: unknown[]) => downloadPack(...(args as [])),
}));

import { useWarmDefaultTranslationPack } from '../useWarmDefaultTranslationPack';

let client: QueryClient;
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

/** A query that stays in flight until the test lets it finish. */
function startBusyQuery(key: string) {
  let release!: () => void;
  const done = new Promise<string>((resolve) => {
    release = () => resolve('ok');
  });
  void client.fetchQuery({ queryKey: [key], queryFn: () => done });
  return release;
}

beforeEach(() => {
  vi.useFakeTimers();
  downloadPack.mockClear();
  profile.data = { defaultTranslation: 'NET' };
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useWarmDefaultTranslationPack', () => {
  it('does not start while the app still has requests in flight', async () => {
    startBusyQuery('busy');
    renderHook(() => useWarmDefaultTranslationPack(), { wrapper });

    await vi.advanceTimersByTimeAsync(2000);
    expect(downloadPack).not.toHaveBeenCalled();
  });

  it('starts once the app has been quiet for a moment', async () => {
    const release = startBusyQuery('busy');
    renderHook(() => useWarmDefaultTranslationPack(), { wrapper });

    await vi.advanceTimersByTimeAsync(2000);
    expect(downloadPack).not.toHaveBeenCalled();

    release();
    await vi.advanceTimersByTimeAsync(1200);
    expect(downloadPack).toHaveBeenCalledTimes(1);
  });

  it('starts anyway when the app never goes quiet', async () => {
    // A surface that polls would otherwise hold the pack off for the whole session. A pack that
    // never downloads because someone left a dashboard open is worse than one that shares.
    startBusyQuery('forever');
    renderHook(() => useWarmDefaultTranslationPack(), { wrapper });

    await vi.advanceTimersByTimeAsync(16_000);
    expect(downloadPack).toHaveBeenCalledTimes(1);
  });

  it('waits for a profile before doing anything at all', async () => {
    profile.data = undefined;
    renderHook(() => useWarmDefaultTranslationPack(), { wrapper });

    await vi.advanceTimersByTimeAsync(20_000);
    expect(downloadPack).not.toHaveBeenCalled();
  });
});
