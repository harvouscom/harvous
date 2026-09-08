/**
 * The cold-start repair in `useSpaceNotes` runs once per query key, not once per consumer.
 *
 * The repair itself is load-bearing and must stay: a notes query that fires before the session
 * JWT is usable 401s and never retries itself (see `useAuthReady`), and re-fetching when auth
 * becomes ready is what rescues it. But it lived in an effect that runs per hook *instance*, and
 * Activity mounts three consumers of the same page — Home's list, the mention picker's source,
 * and the Library panel — so one page was fetched three times on every load.
 *
 * Both halves are asserted here, because the cheap way to fix the count is to delete the repair,
 * and that breaks a cold start for other people rather than for whoever is testing on a warm
 * cache.
 *
 * The `useAuthReady` mock below flips each instance in its own task rather than flipping one
 * shared boolean. That is what the real hook does — every instance awaits its own `getToken()` —
 * and it is the whole reason the count was three: three flips in three commits are three
 * refetches, where three flips in one commit would have been deduplicated and hidden the bug.
 */
import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/** Stands in for Clerk's session: what every instance is independently waiting on. */
let signedIn = false;
const instances = new Set<() => void>();

/**
 * Milliseconds between one instance's flip and the next.
 *
 * Real `getToken()` calls settle far enough apart that React renders between them; three timers
 * queued for the same tick would be collapsed into one render by the scheduler and the bug would
 * not appear at all. Spacing them is what makes this test a test.
 */
const FLIP_STAGGER_MS = 40;
let flipOrder = 0;

function setSignedIn(next: boolean) {
  signedIn = next;
  for (const sync of instances) sync();
}

vi.mock('../../useAuthReady', async () => {
  const { useEffect, useState } = await import('react');
  return {
    useAuthReady: () => {
      const [ready, setReady] = useState(false);
      useEffect(() => {
        const sync = () => {
          // Losing the session is synchronous; gaining it waits on this instance's own token.
          if (!signedIn) setReady(false);
          else setTimeout(() => setReady(signedIn), (flipOrder++ % 3) * FLIP_STAGGER_MS);
        };
        instances.add(sync);
        sync();
        return () => {
          instances.delete(sync);
        };
      }, []);
      return ready;
    },
  };
});
vi.mock('../../useSharedSpaceVisit', () => ({ getSharedSpaceUnseenSince: () => null }));
vi.mock('@/lib/supabase-client', () => ({ isSupabaseRealtimeConfigured: () => true }));
vi.mock('../useProfile', () => ({ hasClerkSessionCookieHint: () => true }));
vi.mock('../../../lib/api', () => ({
  api: { get: vi.fn() },
  APIError: class APIError extends Error {
    status = 401;
  },
}));

import { api } from '../../../lib/api';
import { useSpaceNotes } from '../useSpace';

const get = vi.mocked(api.get);
const page = { notes: [], total: 0, offset: 0, limit: 20, hasMore: false };

function Consumer({ spaceId }: { spaceId: string }) {
  useSpaceNotes(spaceId, 20);
  return null;
}

/** The three of them, as Activity mounts them: siblings, one page between them. */
function Activity({ spaceId }: { spaceId: string }) {
  return (
    <>
      <Consumer spaceId={spaceId} />
      <Consumer spaceId={spaceId} />
      <Consumer spaceId={spaceId} />
    </>
  );
}

function renderActivity(spaceId: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <Activity spaceId={spaceId} />
    </QueryClientProvider>,
  );
}

/** Long enough for every instance's flip, and for any refetch it would have caused. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 400));

beforeEach(() => {
  get.mockReset();
  get.mockResolvedValue(page);
  signedIn = false;
  flipOrder = 0;
  instances.clear();
  localStorage.clear();
  sessionStorage.clear();
});

describe('three consumers of one notes page', () => {
  it('fetch it once between them when auth arrives', async () => {
    renderActivity('space_shared');
    // Nothing before auth: the query is gated on it.
    expect(get).not.toHaveBeenCalled();

    setSignedIn(true);
    await waitFor(() => expect(get).toHaveBeenCalled());
    await settle();

    expect(get).toHaveBeenCalledTimes(1);
  });

  it('do not spend the latch of another space', async () => {
    renderActivity('space_other');
    setSignedIn(true);
    await waitFor(() => expect(get).toHaveBeenCalled());
    await settle();

    expect(get).toHaveBeenCalledTimes(1);
    expect(String(get.mock.calls[0][0])).toContain('space_other');
  });
});

describe('the repair itself', () => {
  it('fetches once auth arrives, having been gated before it', async () => {
    /*
     * The behaviour the latch must not cost. With nothing firing on the transition, a query
     * that was disabled — or that failed — while the session was still resolving is left where
     * it was, and the reader's notes never arrive.
     */
    renderActivity('space_cold');
    expect(get).not.toHaveBeenCalled();

    setSignedIn(true);
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
  });

  it('is available again after auth is lost and returns', async () => {
    // Signing out and back in is a second cold start, and the race comes back with it.
    renderActivity('space_again');
    setSignedIn(true);
    await waitFor(() => expect(get).toHaveBeenCalledTimes(1));
    await settle();

    setSignedIn(false);
    setSignedIn(true);
    await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    await settle();

    expect(get).toHaveBeenCalledTimes(2);
  });
});
