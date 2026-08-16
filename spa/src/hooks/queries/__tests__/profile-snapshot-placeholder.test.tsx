import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * The sessionStorage profile snapshot is not a whole profile, and useProfile must not
 * serve it as if it were.
 *
 * `seedProfileNamesAfterSignUp` writes only the identity fields it can know before the
 * first fetch, and a snapshot left by an older build carries only the fields that build
 * knew about. Seeded as `initialData` with `initialDataUpdatedAt` 30s in the past, React
 * Query treated that partial object as fresh for the rest of the 5-minute staleTime and
 * skipped the fetch — so every field the snapshot lacked read `undefined` for ~4.5 minutes
 * after a load, with no error and no loading state to distinguish "not known yet" from
 * "has no value". It cost an afternoon on the Home continue-reading card, which read a
 * profile field that get-profile does return and silently never rendered.
 *
 * As `placeholderData` the snapshot still paints on the first render (no avatar/name
 * flash) but the mount fetch runs and fills in the rest.
 */
const USER_ID = 'user_derek';

vi.mock('@clerk/clerk-react', () => ({
  useAuth: () => ({
    userId: USER_ID,
    isLoaded: true,
    isSignedIn: true,
    getToken: async () => 'jwt',
  }),
}));
vi.mock('../../useAuthReady', () => ({ useAuthReady: () => true }));
vi.mock('../../../lib/api', () => ({ api: { get: vi.fn() } }));

import { api } from '../../../lib/api';
import { useProfile, type UserProfile } from '../useProfile';

/**
 * A snapshot in the shape seedProfileNamesAfterSignUp leaves behind: the long-stable core
 * and nothing else. Every field asserted on below is deliberately absent.
 */
const PARTIAL_SNAPSHOT = {
  id: USER_ID,
  firstName: 'Derek',
  lastName: 'Johnson',
  email: 'derek@example.com',
  profileImageUrl: null,
  displayName: 'Derek J',
  userColor: 'purple',
  church: null,
  defaultTranslation: 'NET',
};

/** What get-profile actually returns — the snapshot's core plus everything it never carried. */
const SERVER_PROFILE = {
  ...PARTIAL_SNAPSHOT,
  hasLockPinSet: true,
  sharedSpaceSwitcherOrder: ['space_romans', 'space_psalms'],
  connectedOrgId: 'org_grace',
  connectedChurchId: 'church_grace',
  isHomeChurchStaff: true,
  churchName: 'Grace Chapel',
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

function wrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

function newClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

describe('useProfile with a partial sessionStorage snapshot', () => {
  beforeEach(() => {
    // hasClerkSessionCookieHint() gates the snapshot read.
    document.cookie = '__client_uat=1';
    sessionStorage.setItem('harvous-profile-cache', JSON.stringify(PARTIAL_SNAPSHOT));
  });

  it('does not report a field the snapshot lacks as undefined — it fetches and fills it in', async () => {
    vi.mocked(api.get).mockResolvedValue(SERVER_PROFILE);
    const queryClient = newClient();

    const { result } = renderHook(() => useProfile(), { wrapper: wrapper(queryClient) });

    await waitFor(() => expect(result.current.isPlaceholderData).toBe(false));

    // The regression: each of these read `undefined` for the whole staleTime, because the
    // snapshot was seeded as fresh initialData and no fetch ever ran to correct it.
    expect(result.current.data?.hasLockPinSet).toBe(true);
    expect(result.current.data?.sharedSpaceSwitcherOrder).toEqual([
      'space_romans',
      'space_psalms',
    ]);
    expect(result.current.data?.connectedOrgId).toBe('org_grace');
    expect(result.current.data?.isHomeChurchStaff).toBe(true);
    expect(result.current.data?.churchName).toBe('Grace Chapel');
  });

  it('fetches on mount instead of trusting the snapshot for the whole staleTime', async () => {
    vi.mocked(api.get).mockResolvedValue(SERVER_PROFILE);
    const queryClient = newClient();

    renderHook(() => useProfile(), { wrapper: wrapper(queryClient) });

    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/api/user/get-profile'));
  });

  it('still paints the snapshot on the first render, so there is no avatar/name flash', () => {
    vi.mocked(api.get).mockReturnValue(deferred<UserProfile>().promise);
    const queryClient = newClient();

    const { result } = renderHook(() => useProfile(), { wrapper: wrapper(queryClient) });

    // Synchronously available on the very first render — the reason initialData was
    // reached for in the first place, and the thing a placeholder must not give up.
    expect(result.current.data?.firstName).toBe('Derek');
    expect(result.current.data?.displayName).toBe('Derek J');
    expect(result.current.data?.userColor).toBe('purple');
    expect(result.current.isLoading).toBe(false);
    // ...and it is labelled, so a consumer can tell "not known yet" from "has no value".
    expect(result.current.isPlaceholderData).toBe(true);
  });

  it('keeps the partial snapshot out of the query cache', () => {
    vi.mocked(api.get).mockReturnValue(deferred<UserProfile>().promise);
    const queryClient = newClient();

    renderHook(() => useProfile(), { wrapper: wrapper(queryClient) });

    // Optimistic mutations patch ['profile', userId] by reading it back. Committing a
    // partial snapshot there would let them write a half-profile to the server's shape.
    expect(queryClient.getQueryData(['profile', USER_ID])).toBeUndefined();
  });

  it('holds the placeholder reference steady across renders', () => {
    vi.mocked(api.get).mockReturnValue(deferred<UserProfile>().promise);
    const queryClient = newClient();

    const { result, rerender } = renderHook(() => useProfile(), {
      wrapper: wrapper(queryClient),
    });
    const first = result.current.data;
    rerender();

    // The snapshot is re-parsed from JSON on every read. Without memoization each render
    // produces a new object, and consumers keyed on `profile` re-run every effect and
    // recompute every memo for as long as the fetch is in flight.
    expect(result.current.data).toBe(first);
  });
});
