import { useAuth } from '@clerk/clerk-react';
import { useQuery } from '@tanstack/react-query';
import { useAuthReady } from '../../hooks/useAuthReady';
import { api } from '../../lib/api';
import type { FamilyStatus } from './types';

/** How often setup re-reads the status while a Kids Web Services verification is pending. */
export const VERIFICATION_POLL_MS = 3_000;

/**
 * KWS verifies the parent in another tab and tells Harvous by a signed webhook, which can land a
 * moment after KWS sends the parent back. So while a verification is pending, setup keeps asking:
 * every few seconds while the page is visible, and on every return to the tab (the app's one-minute
 * staleTime would otherwise swallow a quick tab flip). It stops as soon as nothing is pending.
 */
export function pendingVerificationPoll(data: Pick<FamilyStatus, 'verifications'> | undefined): number | false {
  const verifications = data?.verifications ?? [];
  // A verified one already moves setup on, so a second pending email has nothing left to unlock.
  if (verifications.some((v) => v.status === 'verified')) return false;
  return verifications.some((v) => v.status === 'pending') ? VERIFICATION_POLL_MS : false;
}

export function useChildAccountsStatus(options: { watchVerification?: boolean } = {}) {
  const ready = useAuthReady();
  const { userId } = useAuth();
  const watch = options.watchVerification === true;
  return useQuery({
    queryKey: ['family', userId, 'child-accounts'],
    enabled: ready,
    meta: { persist: false },
    queryFn: () => api.get<FamilyStatus & { privacyUrl?: string; childAppUrl?: string }>('/api/child-accounts/status'),
    ...(watch ? {
      staleTime: (query: { state: { data?: Pick<FamilyStatus, 'verifications'> } }) =>
        pendingVerificationPoll(query.state.data) ? 0 : 60_000,
      refetchInterval: (query: { state: { data?: Pick<FamilyStatus, 'verifications'> } }) =>
        pendingVerificationPoll(query.state.data),
      refetchIntervalInBackground: false,
    } : {}),
  });
}
