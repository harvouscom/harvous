import { useEffect, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouterState } from '@tanstack/react-router';
import { api } from '../../lib/api';
import type { FeatureKey, PlanKey, PlanLimits } from '@/lib/billing-plans';
import {
  applySharedSpacesEntitlementSynced,
  SHARED_SPACES_ENTITLEMENT_SYNCED_EVENT,
} from '../../lib/shared-spaces-entitlement-bridge';
import type { SharedSpacesEntitlementSyncedDetail } from '@/utils/sync-shared-spaces-billing';

export interface SubscriptionStatusResponse {
  hasUnlimited: boolean;
  hasSharedSpaces: boolean;
  entitlements: FeatureKey[];
  planKey: PlanKey | null;
  limits: PlanLimits;
  currentCount: number;
  limit: number | null;
  sharedSpacesOwnedCount: number;
  sharedSpacesOwnedLimit: number;
}

/** Client-side mirror of the server's Shared Spaces add-on gate (server 403 stays authoritative). */
export function useSubscriptionStatus() {
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const prevPathRef = useRef(pathname);

  useEffect(() => {
    const handleSubscriptionChange = () => {
      void queryClient.invalidateQueries({ queryKey: ['subscription', 'status'] });
    };
    const handleEntitlementSynced = (event: Event) => {
      const detail = (event as CustomEvent<SharedSpacesEntitlementSyncedDetail>).detail;
      if (!detail) return;
      applySharedSpacesEntitlementSynced(queryClient, detail);
    };

    window.addEventListener('subscriptionUpgraded', handleSubscriptionChange);
    window.addEventListener(SHARED_SPACES_ENTITLEMENT_SYNCED_EVENT, handleEntitlementSynced);
    return () => {
      window.removeEventListener('subscriptionUpgraded', handleSubscriptionChange);
      window.removeEventListener(SHARED_SPACES_ENTITLEMENT_SYNCED_EVENT, handleEntitlementSynced);
    };
  }, [queryClient]);

  useEffect(() => {
    if ((prevPathRef.current === '/upgrade' || prevPathRef.current === '/addon') && pathname === '/') {
      void queryClient.invalidateQueries({ queryKey: ['subscription', 'status'] });
    }
    prevPathRef.current = pathname;
  }, [pathname, queryClient]);

  return useQuery({
    queryKey: ['subscription', 'status'],
    queryFn: () => api.get<SubscriptionStatusResponse>('/api/subscription/status'),
    staleTime: 30_000,
  });
}
