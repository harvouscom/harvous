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
import { hasEntitlement, syncEntitlementsFromProvider } from '../utils/entitlements';

/** The 403 body. `upgradeUrl` so a client can route without knowing the path. */
export interface FeatureRequiredBody {
  error: string;
  code: 'FEATURE_REQUIRED';
  featureKey: FeatureKey;
  upgradeUrl: string;
}

export const FEATURE_REQUIRED_CODE = 'FEATURE_REQUIRED' as const;

export function requireFeature(key: FeatureKey) {
  return async (c: Context, next: Next) => {
    const auth = getAuthenticatedAuth(c);

    if (await hasEntitlement(auth, key)) return next();

    // Post-checkout gap: the row may exist at the provider but not here yet.
    await syncEntitlementsFromProvider(auth.userId);
    if (await hasEntitlement(auth, key)) return next();

    const body: FeatureRequiredBody = {
      error: 'Harvous Plus required',
      code: FEATURE_REQUIRED_CODE,
      featureKey: key,
      upgradeUrl: '/upgrade',
    };
    return c.json(body, 403);
  };
}
