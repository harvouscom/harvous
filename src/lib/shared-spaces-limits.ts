/**
 * Shared Spaces product limits for client UI and marketing copy.
 * Keep in sync with server/utils/tier-limits.ts.
 */

/** Max owned shared spaces with the Shared Spaces add-on. */
export const OWNED_SHARED_SPACES_ADDON_LIMIT = 10;

/** Total people in a space (including owner). */
export const MEMBERS_PER_SPACE_CAP = 30;

/** Feature bullets on /addon (Shared Spaces upgrade page) — purchase / inactive copy. */
export const SHARED_SPACES_ADDON_FEATURE_BULLETS = [
  `Create up to ${OWNED_SHARED_SPACES_ADDON_LIMIT} shared spaces and invite others to study with you`,
  `Up to ${MEMBERS_PER_SPACE_CAP} people in each space — everyone contributes notes together`,
  'Joining a space is always free',
] as const;

/** First feature bullet when the add-on is active — reflects spaces left to create. */
export function formatOwnedSharedSpacesFeatureBullet(options: {
  ownedCount: number;
  ownedLimit: number;
}): string {
  const ownedCount = Math.max(0, options.ownedCount);
  const ownedLimit = Math.max(0, options.ownedLimit);
  const remaining = Math.max(0, ownedLimit - ownedCount);

  if (ownedLimit === 0) {
    return SHARED_SPACES_ADDON_FEATURE_BULLETS[0];
  }

  if (remaining === 0) {
    return `You've created all ${ownedLimit} shared spaces included with your add-on`;
  }

  if (ownedCount === 0) {
    return `You can create up to ${ownedLimit} shared spaces included with your add-on and invite others to study with you`;
  }

  const moreWord = remaining === 1 ? '1 more' : `${remaining} more`;
  return `You can create ${moreWord} of the ${ownedLimit} shared spaces included with your add-on`;
}

export function getSharedSpacesAddonFeatureBullets(options?: {
  hasAddOn?: boolean;
  ownedCount?: number | null;
  ownedLimit?: number | null;
}): readonly string[] {
  const staticTail = SHARED_SPACES_ADDON_FEATURE_BULLETS.slice(1);

  if (!options?.hasAddOn) {
    return SHARED_SPACES_ADDON_FEATURE_BULLETS;
  }

  const ownedLimit = options.ownedLimit ?? OWNED_SHARED_SPACES_ADDON_LIMIT;
  const ownedCount = options.ownedCount;

  if (ownedCount == null) {
    return [SHARED_SPACES_ADDON_FEATURE_BULLETS[0], ...staticTail];
  }

  return [formatOwnedSharedSpacesFeatureBullet({ ownedCount, ownedLimit }), ...staticTail];
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
