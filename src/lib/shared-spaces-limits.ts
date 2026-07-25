/**
 * Shared Spaces product limits for client UI and marketing copy.
 * Keep in sync with server/utils/tier-limits.ts.
 */

import { UNLIMITED, isUnlimited } from './billing-plans';

export { UNLIMITED, isUnlimited };

/** Owned shared spaces with Harvous Plus — unlimited; the member cap is the fence. */
export const OWNED_SHARED_SPACES_ADDON_LIMIT = UNLIMITED;

/** Total people in a space (including owner). */
export const MEMBERS_PER_SPACE_CAP = 100;

/** Feature bullets on /upgrade and Settings › Plan — purchase / inactive copy. Keep short. */
export const SHARED_SPACES_ADDON_FEATURE_BULLETS = [
  'Everything in free',
  'Unlimited shared spaces',
  `Up to ${MEMBERS_PER_SPACE_CAP} people per space`,
  'Joining is always free',
] as const;

/** Purchase-copy line for owned spaces (index 1 — after “Everything in Free”). */
const OWNED_SPACES_PURCHASE_BULLET = SHARED_SPACES_ADDON_FEATURE_BULLETS[1];

/** Owned-spaces bullet when the add-on is active — reflects spaces left to create. */
export function formatOwnedSharedSpacesFeatureBullet(options: {
  ownedCount: number;
  ownedLimit: number;
}): string {
  const ownedCount = Math.max(0, options.ownedCount);

  if (isUnlimited(options.ownedLimit)) {
    if (ownedCount === 0) {
      return OWNED_SPACES_PURCHASE_BULLET;
    }
    const spaceWord = ownedCount === 1 ? 'space' : 'spaces';
    // Non-breaking space keeps “unlimited” off a line of its own, as elsewhere in this file.
    return `You've created ${ownedCount} shared ${spaceWord} — your plan includes\u00A0unlimited`;
  }

  const ownedLimit = Math.max(0, options.ownedLimit);
  const remaining = Math.max(0, ownedLimit - ownedCount);

  if (ownedLimit === 0) {
    return OWNED_SPACES_PURCHASE_BULLET;
  }

  if (remaining === 0) {
    return `You've created all ${ownedLimit} shared spaces included with your plan`;
  }

  if (ownedCount === 0) {
    return `You can create up to ${ownedLimit} shared spaces included with your plan and invite others to study with you`;
  }

  const moreWord = remaining === 1 ? '1 more' : `${remaining} more`;
  // Prefer a break before “included…” so the last line isn’t a lone orphan word.
  return `You can create ${moreWord} of the ${ownedLimit} shared spaces\u00A0included with your plan`;
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
