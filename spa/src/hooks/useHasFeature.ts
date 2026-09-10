/**
 * Does this account hold a paid feature key?
 *
 * `useSubscriptionStatus` already carries the full `entitlements` array; what it does not
 * carry is a per-key answer, and the alternative to this hook is another `hasX` boolean on the
 * response for every feature that ships. `hasSharedSpaces` is that pattern's one instance and
 * is kept for its existing callers rather than extended.
 *
 * `ready` is separate from `has` because they mean different things to a surface. A gate that
 * treats "still loading" as "no" flashes an upgrade prompt at a subscriber on every cold load,
 * which is the worst version of a paywall: the one your paying customers see.
 *
 * Guests are structurally false — `useAuthReady()` is false without an account, so the
 * subscription query never runs and every key is absent. That is correct, but a surface
 * showing an *upgrade* prompt to someone with no account is asking them to buy before they
 * can sign in; use `useHarvousIdentity().isGuest` to show nothing at all instead.
 */

import type { FeatureKey } from '@/lib/billing-plans';
import { useSubscriptionStatus } from './queries/useSubscriptionStatus';

export interface FeatureAccess {
  /** The account holds this key. False while loading — check `ready` before acting on it. */
  has: boolean;
  /** The answer is settled. False means "not known yet", not "no". */
  ready: boolean;
}

export function useHasFeature(key: FeatureKey): FeatureAccess {
  const { data, isSuccess } = useSubscriptionStatus();
  return {
    has: Boolean(data?.entitlements?.includes(key)),
    ready: isSuccess,
  };
}
