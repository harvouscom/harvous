import type { FeatureKey } from '@/lib/billing-plans';

export type SyncSharedSpacesBillingResult = {
  synced: boolean;
  updated?: boolean;
  hasSharedSpaces: boolean;
  entitlements?: FeatureKey[];
};

export const SHARED_SPACES_ENTITLEMENT_SYNCED_EVENT = 'sharedSpacesEntitlementSynced';

export type SharedSpacesEntitlementSyncedDetail = {
  hasSharedSpaces: boolean;
  updated?: boolean;
  entitlements?: FeatureKey[];
};

/** Broadcast entitlement immediately after sync so the app shell updates before checkout drawer closes. */
export function dispatchSharedSpacesEntitlementSynced(detail: SharedSpacesEntitlementSyncedDetail): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(SHARED_SPACES_ENTITLEMENT_SYNCED_EVENT, { detail }));
}

/** Reconcile entitlements from Paddle (purchase → webhook gap) after checkout or on demand. */
export async function syncSharedSpacesBilling(): Promise<SyncSharedSpacesBillingResult> {
  const res = await fetch('/api/billing/sync', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: '{}'
  });

  if (!res.ok) {
    throw new Error(`billing sync failed: HTTP ${res.status}`);
  }

  return res.json() as Promise<SyncSharedSpacesBillingResult>;
}
