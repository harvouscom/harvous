/**
 * Admin paid-access aggregates — who holds an entitlement, and whether they use it.
 *
 * The definition this file exists to enforce, in one line:
 *
 *   paid = ≥1 `Entitlements` row with status='active' whose featureKey is not withheld.
 *
 * That last clause is the subtle one, and it is not hygiene. `hasEntitlementForUserId`
 * short-circuits on `isFeatureWithheld` *before* it queries, so an account whose only active
 * row is a withheld feature has exactly zero access. Counting it as paid would put a number
 * on the dashboard that no gate in the product agrees with. Deriving the key list from
 * `WITHHELD_FEATURES` rather than restating it here is what keeps the two from drifting.
 *
 * Note on what these numbers can and cannot say: `Entitlements` is mutable state, not a log.
 * `status` and `updatedAt` are overwritten in place, so there is no status-change history —
 * a windowed count sees only the most recent transition per row, and someone who cancelled
 * and resubscribed inside the window reads as plainly active. Do not build churn on it.
 */

import { FEATURE_KEYS, isFeatureWithheld, type FeatureKey } from '@/lib/billing-plans';

/**
 * The feature keys that actually grant access today.
 *
 * Derived, never listed: a key moving in or out of `WITHHELD_FEATURES` has to change what the
 * dashboard counts on the same commit that changes what the gate allows.
 */
export function nonWithheldFeatureKeys(): FeatureKey[] {
  return FEATURE_KEYS.filter((key) => !isFeatureWithheld(key));
}

/** Percent, rounded, and 0 rather than NaN when nothing is in the denominator. */
export function paidRatePct(paid: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((paid / total) * 100);
}

/**
 * Accounts whose access came from something other than a payment — admin grants, church
 * seats, trials. Clamped at 0: the two counts come from separate aggregates over a table that
 * can change between them, and a negative "granted" on the dashboard is worse than a stale one.
 */
export function grantedAccounts(paid: number, billing: number): number {
  return Math.max(0, paid - billing);
}
