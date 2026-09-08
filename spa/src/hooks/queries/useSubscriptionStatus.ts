import { useEffect, useRef } from 'react';
import { useAuth } from '@clerk/clerk-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouterState } from '@tanstack/react-router';
import { api } from '../../lib/api';
import { useAuthReady } from '../useAuthReady';
import type { FeatureKey, PlanKey, PlanLimits } from '@/lib/billing-plans';
import {
  applySharedSpacesEntitlementSynced,
  SHARED_SPACES_ENTITLEMENT_SYNCED_EVENT,
} from '../../lib/shared-spaces-entitlement-bridge';
import type { SharedSpacesEntitlementSyncedDetail } from '@/utils/sync-shared-spaces-billing';

export type BillingSubscriptionSummary = {
  subscriptionId: string;
  status: string;
  interval: 'month' | 'year';
  amountCents: number;
  currency: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  canceledAt: string | null;
};

export interface SubscriptionStatusResponse {
  hasUnlimited: boolean;
  hasSharedSpaces: boolean;
  /** Connector — a separate product with its own subscription, not a Plus tier. */
  hasConnector?: boolean;
  /**
   * Claimed the founding offer while it existed (first 99). The offer is retired
   * — see `foundingOffer()` — but this stays true for anyone who took it, and
   * Founding and standard Plus share planKey 'plus'.
   */
  isFounding?: boolean;
  entitlements: FeatureKey[];
  planKey: PlanKey | null;
  /** Polar-managed subscription — in-app manage available. False for admin grants. */
  canManageBilling?: boolean;
  /** Present when Polar checkout manages Plus; omitted for admin grants. */
  billing?: BillingSubscriptionSummary | null;
  /** Connector's own subscription summary — billed and canceled independently. */
  connectorBilling?: BillingSubscriptionSummary | null;
  limits: PlanLimits;
  currentCount: number;
  limit: number | null;
  sharedSpacesOwnedCount: number;
  sharedSpacesOwnedLimit: number;
}


/**
 * A per-tab snapshot of the last entitlement answer, so Review can start with everything else.
 *
 * The problem it solves is ordering, not bytes. Every other query on Activity begins the moment
 * auth is ready; Review's cannot, because `useReviewInbox` is enabled on `useHasFeature('review')`,
 * which needs this response first. That makes Review strictly serial behind it — auth, then
 * subscription status, then the inbox — so it lands after `isPrototypeHomePresentationReady` has
 * already painted the page, and arrives as a visible pop-in. Knowing the answer at t=0 collapses
 * those two round trips into one.
 *
 * `sessionStorage`, and keyed by user, for the same reason the profile snapshot is: entitlements
 * are account state on a device that may be shared, and a key that outlives the tab is a key that
 * outlives a sign-out. A snapshot whose `userId` does not match the session is ignored rather than
 * trusted.
 */
const SUBSCRIPTION_SNAPSHOT_KEY = 'harvous-subscription-status-snapshot';

interface SubscriptionSnapshot {
  userId: string;
  status: SubscriptionStatusResponse;
}

export function readSubscriptionSnapshot(userId: string | null | undefined): SubscriptionStatusResponse | undefined {
  if (!userId || typeof window === 'undefined') return undefined;
  try {
    const raw = sessionStorage.getItem(SUBSCRIPTION_SNAPSHOT_KEY);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as SubscriptionSnapshot;
    // Another account in the same tab must never read this one's entitlements.
    if (parsed?.userId !== userId) return undefined;
    return Array.isArray(parsed.status?.entitlements) ? parsed.status : undefined;
  } catch {
    return undefined;
  }
}

export function writeSubscriptionSnapshot(userId: string | null | undefined, status: SubscriptionStatusResponse) {
  if (!userId || typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(SUBSCRIPTION_SNAPSHOT_KEY, JSON.stringify({ userId, status }));
  } catch {
    /* private mode, or site data blocked — the fetch still answers, just not early */
  }
}

/** Client-side mirror of the server's Shared Spaces add-on gate (server 403 stays authoritative). */
export function useSubscriptionStatus() {
  const queryClient = useQueryClient();
  const authReady = useAuthReady();
  const { userId } = useAuth();
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
    queryFn: async () => {
      const status = await api.get<SubscriptionStatusResponse>('/api/subscription/status');
      writeSubscriptionSnapshot(userId, status);
      return status;
    },
    enabled: authReady,
    staleTime: 30_000,
    /*
     * Placeholder, deliberately — not `initialData`, which is a mistake this codebase has
     * already made once and paid for (see the note in `useProfile`). As `initialData` the
     * snapshot is parked in the cache as a real, fresh result, and the fetch that would
     * correct it is skipped for the whole staleTime. As `placeholderData` it is what the
     * UI reads until the network answers, and the request still goes out immediately.
     *
     * The consequence worth naming: for the moment before that answer lands, a reader whose
     * subscription lapsed since the snapshot was written sees Review. The server is
     * unmoved — `requireFeature` still refuses — so this can show a surface, never grant
     * one, and it corrects itself within the same load. The opposite default is worse: the
     * `useHasFeature` docblock is explicit that treating "still loading" as "no" flashes a
     * paywall at paying subscribers on every cold start.
     */
    placeholderData: () => readSubscriptionSnapshot(userId),
  });
}
