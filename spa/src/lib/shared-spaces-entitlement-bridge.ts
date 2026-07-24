import { type QueryClient } from '@tanstack/react-query';
import {
  SHARED_SPACES_ENTITLEMENT_SYNCED_EVENT,
  type SharedSpacesEntitlementSyncedDetail,
} from '@/utils/sync-shared-spaces-billing';
import { invalidatePanelDataCache, PANEL_CACHE_KEYS } from '@/utils/panel-data-cache';
import { OWNED_SHARED_SPACES_ADDON_LIMIT } from '@/lib/shared-spaces-limits';

const FREE_OWNED_SHARED_SPACES_LIMIT = 0;

type SubscriptionStatusResponse = {
  hasUnlimited: boolean;
  hasSharedSpaces: boolean;
  currentCount: number;
  limit: number | null;
  sharedSpacesOwnedCount: number;
  sharedSpacesOwnedLimit: number;
};

/** Optimistically patch subscription status so the space switcher unlocks before refetch. */
export function patchSubscriptionStatusCache(queryClient: QueryClient, hasSharedSpaces: boolean): void {
  queryClient.setQueryData<SubscriptionStatusResponse>(['subscription', 'status'], (old) => {
    const sharedSpacesOwnedLimit = hasSharedSpaces
      ? OWNED_SHARED_SPACES_ADDON_LIMIT
      : (old?.sharedSpacesOwnedLimit ?? FREE_OWNED_SHARED_SPACES_LIMIT);

    if (!old) {
      return {
        hasUnlimited: false,
        hasSharedSpaces,
        currentCount: 0,
        limit: null,
        sharedSpacesOwnedCount: 0,
        sharedSpacesOwnedLimit,
      };
    }

    return {
      ...old,
      hasSharedSpaces,
      sharedSpacesOwnedLimit,
    };
  });
}

export function applySharedSpacesEntitlementSynced(
  queryClient: QueryClient,
  detail: SharedSpacesEntitlementSyncedDetail,
): void {
  if (typeof detail.hasSharedSpaces !== 'boolean') return;
  patchSubscriptionStatusCache(queryClient, detail.hasSharedSpaces);
  invalidatePanelDataCache(PANEL_CACHE_KEYS.subscription);
  void queryClient.invalidateQueries({ queryKey: ['subscription', 'status'] });
}

export { SHARED_SPACES_ENTITLEMENT_SYNCED_EVENT };
