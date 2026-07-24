export type SyncSharedSpacesBillingResult = {
  synced: boolean;
  updated?: boolean;
  hasSharedSpaces: boolean;
};

export const SHARED_SPACES_ENTITLEMENT_SYNCED_EVENT = 'sharedSpacesEntitlementSynced';

export type SharedSpacesEntitlementSyncedDetail = {
  hasSharedSpaces: boolean;
  updated?: boolean;
};

/** Broadcast entitlement immediately after sync so the app shell updates before checkout drawer closes. */
export function dispatchSharedSpacesEntitlementSynced(detail: SharedSpacesEntitlementSyncedDetail): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(SHARED_SPACES_ENTITLEMENT_SYNCED_EVENT, { detail }));
}

/** Idempotent Clerk → DB reconcile after checkout or when Clerk JWT already has the feature. */
export async function syncSharedSpacesBilling(): Promise<SyncSharedSpacesBillingResult> {
  const res = await fetch('/api/billing/sync-shared-spaces', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  });

  if (!res.ok) {
    throw new Error(`sync-shared-spaces failed: HTTP ${res.status}`);
  }

  return res.json() as Promise<SyncSharedSpacesBillingResult>;
}
