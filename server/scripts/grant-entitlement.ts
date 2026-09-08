/**
 * Grant or revoke a feature key for one user, from the command line.
 *
 * There is no admin HTTP path that does this — `setFeatureEntitlement` has exactly one live
 * caller, and it is the shared-spaces reconcile. That is fine in production, where billing
 * writes the rows, but it leaves no way to try a paid surface in development without going
 * through checkout.
 *
 * Writes with source `admin_grant`, which is deliberate and documented: provider sync only
 * ever touches `billing` rows, so a grant made here survives a Polar reconcile. That is the
 * same mechanism scholarships and comps use.
 *
 *   npm run entitlement:grant -- <userId> review challenges
 *   npm run entitlement:grant -- <userId> review --revoke
 */
import 'dotenv/config';
import { pathToFileURL } from 'node:url';
import { FEATURE_KEYS, isFeatureKey, type FeatureKey } from '@/lib/billing-plans';
import { getActiveEntitlements, setFeatureEntitlement } from '../utils/entitlements';

export async function runGrantEntitlement(argv: readonly string[]): Promise<void> {
  const revoke = argv.includes('--revoke');
  const positional = argv.filter((a) => !a.startsWith('--'));
  const [userId, ...keys] = positional;

  if (!userId || keys.length === 0) {
    console.error('usage: npm run entitlement:grant -- <userId> <featureKey…> [--revoke]');
    console.error(`feature keys: ${FEATURE_KEYS.join(', ')}`);
    process.exitCode = 1;
    return;
  }

  const invalid = keys.filter((k) => !isFeatureKey(k));
  if (invalid.length > 0) {
    console.error(`[entitlement] unknown feature key(s): ${invalid.join(', ')}`);
    console.error(`feature keys: ${FEATURE_KEYS.join(', ')}`);
    process.exitCode = 1;
    return;
  }

  for (const key of keys as FeatureKey[]) {
    await setFeatureEntitlement(userId, key, !revoke, 'admin_grant');
    console.log(`[entitlement] ${revoke ? 'revoked' : 'granted'} ${key} for ${userId}`);
  }

  const active = await getActiveEntitlements(userId);
  console.log(`[entitlement] now active: ${active.length ? active.join(', ') : '(none)'}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runGrantEntitlement(process.argv.slice(2)).catch((error) => {
    console.error('[entitlement] failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
