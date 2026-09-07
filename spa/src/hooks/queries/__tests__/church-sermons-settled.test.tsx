import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * The flag that made Home's presentation gate inert for anyone without a church.
 *
 * `useChurchSermons` is `enabled: … && connected`, and a disabled query keeps `status: 'pending'`
 * forever in React Query v5 — so a settled check written as `!isPending || hasData` answered
 * "still loading" for a query that was never going to load. ANDed into
 * `isPrototypeHomePresentationReady`, that made `presentationReady` permanently false: every cold
 * load reached `contentReady` through the 2.5s deadline instead, painting with whatever had
 * arrived and growing the rest a section at a time.
 *
 * Tested through the real hook rather than through `isQuerySettled` alone, because the fix leans
 * on `isEnabled` being a field React Query actually publishes on the result. If a version bump
 * ever dropped it the argument would arrive as `undefined`, the default would take over, and this
 * would quietly go back to waiting forever on a query that never runs — with nothing failing.
 */
const profile = {
  data: undefined as undefined | { connectedOrgId: string | null },
  isPending: false,
  isPlaceholderData: false,
};

vi.mock('@clerk/clerk-react', () => ({
  useAuth: () => ({ userId: 'user_derek', isLoaded: true, isSignedIn: true, getToken: async () => 'jwt' }),
}));
vi.mock('../../useAuthReady', () => ({ useAuthReady: () => true }));
vi.mock('../useProfile', () => ({ useProfile: () => profile }));
vi.mock('../../../lib/api', () => ({ api: { get: vi.fn(async () => ({ connected: true, services: [] })) } }));

import { api } from '../../../lib/api';
import { useChurchSermons } from '../useChurchSermons';

let client: QueryClient;
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={client}>{children}</QueryClientProvider>
);

beforeEach(() => {
  vi.mocked(api.get).mockClear();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  profile.data = { connectedOrgId: null };
  profile.isPending = false;
  profile.isPlaceholderData = false;
});

describe('useChurchSermons settled reporting', () => {
  it('publishes isEnabled, which the whole fix rests on', () => {
    const { result } = renderHook(() => useChurchSermons(), { wrapper });
    expect(typeof result.current.isEnabled).toBe('boolean');
  });

  it('is settled for an account with no church — it will never run', () => {
    const { result } = renderHook(() => useChurchSermons(), { wrapper });
    expect(result.current.isEnabled).toBe(false);
    expect(result.current.isPending).toBe(true);
    expect(result.current.isSettled).toBe(true);
    expect(api.get).not.toHaveBeenCalled();
  });

  /*
   * The trap in the fix, and the reason the precondition lives in this hook rather than at the
   * gate. `connected` is read off profile data, so before that lands the query is disabled
   * *transiently* — calling it settled there would let Home paint and then pop "This Sunday" in
   * afterwards for exactly the accounts that have one.
   */
  it('is not settled while the profile that decides it is still loading', () => {
    profile.data = undefined;
    profile.isPending = true;
    const { result } = renderHook(() => useChurchSermons(), { wrapper });
    expect(result.current.isSettled).toBe(false);
  });

  it('is not settled on a profile placeholder, which can be missing connectedOrgId', () => {
    // The sessionStorage snapshot carries only the fields the build that wrote it knew about,
    // and `connectedOrgId` is the one field this reads. See the placeholder note in useProfile.
    profile.data = {} as { connectedOrgId: string | null };
    profile.isPlaceholderData = true;
    const { result } = renderHook(() => useChurchSermons(), { wrapper });
    expect(result.current.isSettled).toBe(false);
  });

  it('waits for the answer when there is a church to ask about', async () => {
    profile.data = { connectedOrgId: 'org_1' };
    const { result } = renderHook(() => useChurchSermons(), { wrapper });
    expect(result.current.isEnabled).toBe(true);
    expect(result.current.isSettled).toBe(false);
    await waitFor(() => expect(result.current.isSettled).toBe(true));
    expect(api.get).toHaveBeenCalledWith('/api/church/services');
  });
});
