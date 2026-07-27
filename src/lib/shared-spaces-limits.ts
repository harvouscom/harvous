/**
 * Shared Spaces product limits for client UI and marketing copy.
 * Keep in sync with server/utils/tier-limits.ts.
 */

import { UNLIMITED, isUnlimited } from './billing-plans';

export { UNLIMITED, isUnlimited };

/** Owned shared spaces with Harvous Plus — unlimited; the member cap is the fence. */
export const OWNED_SHARED_SPACES_ADDON_LIMIT = UNLIMITED;

/** Total people in a space (including owner). */
export const MEMBERS_PER_SPACE_CAP = 50;

/** Feature bullets on /upgrade and Settings › Plan — purchase / inactive copy. Keep short. */
export const SHARED_SPACES_ADDON_FEATURE_BULLETS = [
  'Everything in free',
  'Unlimited shared spaces',
  `Up to ${MEMBERS_PER_SPACE_CAP} people per space`,
  'Joining is always free',
] as const;

/** Purchase-copy line for owned spaces (index 1 — after “Everything in Free”). */
const OWNED_SPACES_PURCHASE_BULLET = SHARED_SPACES_ADDON_FEATURE_BULLETS[1];

/** Owned-spaces bullet when the add-on is active — usage vs plan allotment. */
export function formatOwnedSharedSpacesFeatureBullet(options: {
  ownedCount: number;
  ownedLimit: number;
}): string {
  const ownedCount = Math.max(0, options.ownedCount);

  if (isUnlimited(options.ownedLimit)) {
    if (ownedCount === 0) {
      return OWNED_SPACES_PURCHASE_BULLET;
    }
    // Non-breaking space keeps “unlimited” from orphaning on its own line.
    return `${ownedCount} out of\u00A0unlimited shared spaces`;
  }

  const ownedLimit = Math.max(0, options.ownedLimit);
  if (ownedLimit === 0) {
    return OWNED_SPACES_PURCHASE_BULLET;
  }

  const spaceWord = ownedLimit === 1 ? 'space' : 'spaces';
  return `${ownedCount} out of ${ownedLimit} shared ${spaceWord}`;
}

export function getSharedSpacesAddonFeatureBullets(options?: {
  hasAddOn?: boolean;
  ownedCount?: number | null;
  ownedLimit?: number | null;
}): readonly string[] {
  if (!options?.hasAddOn) {
    return SHARED_SPACES_ADDON_FEATURE_BULLETS;
  }

  const includesFree = SHARED_SPACES_ADDON_FEATURE_BULLETS[0];
  const staticTail = SHARED_SPACES_ADDON_FEATURE_BULLETS.slice(2);
  const ownedLimit = options.ownedLimit ?? OWNED_SHARED_SPACES_ADDON_LIMIT;
  const ownedCount = options.ownedCount;

  if (ownedCount == null) {
    return [includesFree, OWNED_SPACES_PURCHASE_BULLET, ...staticTail];
  }

  return [
    includesFree,
    formatOwnedSharedSpacesFeatureBullet({ ownedCount, ownedLimit }),
    ...staticTail,
  ];
}

export interface SpaceMembersCapacityCopy {
  inviteLine?: string;
  maxLineText: string;
  atLimit: boolean;
}

/** Owner-only hint on the People sheet — reflects invite capacity left in this space. */
export function getSpaceMembersCapacityCopy(options: {
  memberCount: number;
  memberLimit: number;
}): SpaceMembersCapacityCopy | null {
  const memberCount = Math.max(0, options.memberCount);
  const memberLimit = Math.max(0, options.memberLimit);
  const remaining = Math.max(0, memberLimit - memberCount);

  if (memberLimit === 0) {
    return null;
  }

  if (remaining === 0) {
    return {
      maxLineText: `This space is at its maximum of ${memberLimit} people.`,
      atLimit: true,
    };
  }

  const inviteLine =
    remaining === 1 ? 'You can invite 1 more person.' : `You can invite ${remaining} more people.`;

  return {
    inviteLine,
    maxLineText: `Up to ${memberLimit} people per space.`,
    atLimit: false,
  };
}
