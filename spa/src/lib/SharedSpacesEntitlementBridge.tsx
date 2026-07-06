import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  applySharedSpacesEntitlementSynced,
  SHARED_SPACES_ENTITLEMENT_SYNCED_EVENT,
} from './shared-spaces-entitlement-bridge';
import type { SharedSpacesEntitlementSyncedDetail } from '@/utils/sync-shared-spaces-billing';

/** App-wide listener: patch subscription React Query cache when checkout sync completes. */
export function SharedSpacesEntitlementBridge(): null {
  const queryClient = useQueryClient();

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<SharedSpacesEntitlementSyncedDetail>).detail;
      if (!detail) return;
      applySharedSpacesEntitlementSynced(queryClient, detail);
    };
    window.addEventListener(SHARED_SPACES_ENTITLEMENT_SYNCED_EVENT, handler);
    return () => window.removeEventListener(SHARED_SPACES_ENTITLEMENT_SYNCED_EVENT, handler);
  }, [queryClient]);

  return null;
}
