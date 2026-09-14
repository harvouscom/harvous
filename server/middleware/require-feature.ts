/**
 * Gate a route on a paid feature key.
 *
 * The pattern this generalizes is the reconcile-on-write in `spaces.ts`: check the DB flag,
 * and if it is false, ask the provider once before refusing. That second look exists because
 * of a real gap — Polar's webhook can land seconds after the browser returns from checkout, so
 * someone who has just paid would otherwise be told to go and pay. Reconciling only on the
 * miss keeps the happy path to one indexed read.
 *
 * Mount after `requireAuth`. Gates check feature *keys*, never plan names or providers — see
 * the entitlements module and docs/BILLING_ARCHITECTURE.md.
 */

import type { Context, Next } from 'hono';
import type { FeatureKey } from '@/lib/billing-plans';
import { getAuthenticatedAuth } from './auth';
import type { Auth } from './types';
import { hasEntitlement, syncEntitlementsFromProvider } from '../utils/entitlements';

/** The 403 body. `upgradeUrl` so a client can route without knowing the path. */
export interface FeatureRequiredBody {
  error: string;
  code: 'FEATURE_REQUIRED';
  featureKey: FeatureKey;
  upgradeUrl: string;
}

export const FEATURE_REQUIRED_CODE = 'FEATURE_REQUIRED' as const;

export function featureRequiredBody(key: FeatureKey): FeatureRequiredBody {
  return {
    error: 'Harvous Plus required',
    code: FEATURE_REQUIRED_CODE,
    featureKey: key,
    upgradeUrl: '/upgrade',
  };
}

/** Post-checkout gap: the row may exist at the provider but not here yet, so ask once on a miss. */
export async function hasFeatureWithReconcile(
  auth: Auth,
  key: FeatureKey,
  options?: { throttle?: boolean },
): Promise<boolean> {
  if (!auth.userId) return false;
  if (await hasEntitlement(auth, key)) return true;
  await syncEntitlementsFromProvider(auth.userId, options);
  return hasEntitlement(auth, key);
}

export function requireFeature(key: FeatureKey) {
  return async (c: Context, next: Next) => {
    if (await hasFeatureWithReconcile(getAuthenticatedAuth(c), key)) return next();
    return c.json(featureRequiredBody(key), 403);
  };
}
