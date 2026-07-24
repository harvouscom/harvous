import { describe, expect, it, beforeEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { applySharedSpacesEntitlementSynced, patchSubscriptionStatusCache } from '../shared-spaces-entitlement-bridge';
import { PANEL_CACHE_KEYS, setCachedPanelData, getCachedPanelData } from '@/utils/panel-data-cache';

describe('shared-spaces-entitlement-bridge', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient();
  });

  it('patches hasSharedSpaces and owned limit on existing cache', () => {
    queryClient.setQueryData(['subscription', 'status'], {
      hasUnlimited: false,
      hasSharedSpaces: false,
      entitlements: [],
      planKey: null,
      limits: { ownedSpaces: 0, membersPerSpace: 30 },
      currentCount: 0,
      limit: null,
      sharedSpacesOwnedCount: 0,
      sharedSpacesOwnedLimit: 0,
    });

    patchSubscriptionStatusCache(queryClient, true, ['shared_spaces']);

    const data = queryClient.getQueryData<{
      hasSharedSpaces: boolean;
      sharedSpacesOwnedLimit: number;
      entitlements: string[];
    }>(['subscription', 'status']);
    expect(data?.hasSharedSpaces).toBe(true);
    expect(data?.sharedSpacesOwnedLimit).toBe(10);
    expect(data?.entitlements).toContain('shared_spaces');
  });

  it('invalidates panel subscription cache on entitlement sync', () => {
    setCachedPanelData(PANEL_CACHE_KEYS.subscription, { hasSharedSpaces: false });
    applySharedSpacesEntitlementSynced(queryClient, {
      hasSharedSpaces: true,
      updated: true,
      entitlements: ['shared_spaces'],
    });
    expect(getCachedPanelData(PANEL_CACHE_KEYS.subscription)).toBeNull();
  });
});

