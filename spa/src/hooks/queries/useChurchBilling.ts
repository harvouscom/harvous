import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@clerk/clerk-react';
import { api } from '../../lib/api';
import { useAuthReady } from '../useAuthReady';
import type { ChurchSponsorship } from './useChurchChannels';

export type ChurchBillingPlan = {
  key: string;
  name: string;
  interval: 'month' | 'year';
  amountCents: number;
  currencyCode: string;
  price: string;
};

export type ChurchBillingResponse = {
  church: { id: string; name: string; orgId: string };
  sponsorship: ChurchSponsorship;
  billingStatus: string | null;
  plans: ChurchBillingPlan[];
};

export function churchBillingQueryKey(
  userId: string | null | undefined,
  orgId: string | null | undefined,
) {
  return ['church-billing', userId ?? 'none', orgId ?? 'home'] as const;
}

/**
 * Church sponsorship + purchasable plans. Staff-only on the server (403 for
 * congregants), so callers must gate on staff status before enabling it —
 * otherwise every congregant's hub fires a request that can only fail.
 */
export function useChurchBilling(orgId: string | null | undefined, options?: { enabled?: boolean }) {
  const { userId } = useAuth();
  const authReady = useAuthReady();
  const trimmedOrgId = orgId?.trim() || null;

  return useQuery({
    queryKey: churchBillingQueryKey(userId, trimmedOrgId),
    enabled: authReady && !!userId && !!trimmedOrgId && options?.enabled === true,
    queryFn: () =>
      api.get<ChurchBillingResponse>(
        `/api/church/billing?orgId=${encodeURIComponent(trimmedOrgId!)}`,
      ),
    staleTime: 60_000,
    retry: false,
  });
}
