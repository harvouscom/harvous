/**
 * Who may use the Connector: Harvous Plus holders (feature key `connector`).
 *
 * While `connector` is in WITHHELD_FEATURES the normal gate answers "no" for everyone, so
 * dogfooding needs a way through that does not open it to every subscriber: an explicit
 * allowlist (`CONNECTOR_PREVIEW_USER_IDS`) of accounts that must *also* hold the key.
 * Launch is deleting `connector` from WITHHELD_FEATURES; this file needs no change then.
 */

import { isFeatureWithheld } from '@/lib/billing-plans';
import { hasFeatureWithReconcile } from '../middleware/require-feature';
import { getActiveEntitlements } from '../utils/entitlements';
import { previewUserIds, upgradeUrl } from './config';

export async function hasConnectorAccess(userId: string): Promise<boolean> {
  if (isFeatureWithheld('connector')) {
    if (!previewUserIds().has(userId)) return false;
    // `getActiveEntitlements` reads rows directly and ignores the withhold switch.
    return (await getActiveEntitlements(userId)).includes('connector');
  }
  // Reconciles once with Polar on a miss — someone who subscribed seconds ago is not refused.
  return hasFeatureWithReconcile({ userId, has: () => false }, 'connector', { throttle: true });
}

export function notSubscribedMessage(): string {
  return (
    'Using Harvous from other apps is part of Harvous Plus. ' +
    `Upgrade at ${upgradeUrl()}, then try again — no need to reconnect.`
  );
}
