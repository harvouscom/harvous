import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * A guest is exactly the audience `PrototypeExpandedDiscover`'s isGuest branch was
 * built for — the catalog is public, and a guest tap is meant to route to the
 * listing page rather than 401. That branch is unreachable unless a guest can
 * actually see rows to tap, which means this query has to run for them.
 *
 * `useAuthReady()` requires `isSignedIn`, which a guest by definition never has,
 * so the naive `enabled: authReady` gate stayed false forever for a guest and the
 * catalog silently never loaded — an automated review caught it after the fact;
 * this pins the fix.
 */
vi.mock('../../useAuthReady', () => ({ useAuthReady: () => false }));

const mockIdentity = vi.fn();
vi.mock('../../useHarvousIdentity', () => ({ useHarvousIdentity: () => mockIdentity() }));

const mockGet = vi.fn().mockResolvedValue({ listings: [], installedSlugs: [], nextCursor: null });
vi.mock('../../../lib/api', () => ({ api: { get: (...args: unknown[]) => mockGet(...args) } }));

const { useDiscoverListings } = await import('../useDiscoverListings');

function wrapperFor(qc: QueryClient) {
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

describe('useDiscoverListings — guest access', () => {
  afterEach(() => {
    mockGet.mockClear();
  });

  it('fetches the catalog for a guest even though useAuthReady is false', async () => {
    mockIdentity.mockReturnValue({ isGuest: true });
    const qc = new QueryClient();
    const { result } = renderHook(() => useDiscoverListings({}), { wrapper: wrapperFor(qc) });

    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });

  it('stays disabled for a signed-out, non-guest session (loading Clerk)', () => {
    mockIdentity.mockReturnValue({ isGuest: false });
    const qc = new QueryClient();
    renderHook(() => useDiscoverListings({}), { wrapper: wrapperFor(qc) });

    // No waitFor here on purpose — this asserts nothing fired, not that
    // something eventually did.
    expect(mockGet).not.toHaveBeenCalled();
  });
});
