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

/**
 * Feature bullets on /upgrade and Settings › Plan — purchase / inactive copy. Keep short.
 *
 * Review leads, because since 3.0 it is what someone is buying: hosting is
 * social and needs a group, while returning to your own study works for one
 * person on the day they pay. It was appended at the end when it shipped; that
 * was a plumbing decision, and this is the ordering one.
 *
 * Challenges is absent because it is in `WITHHELD_FEATURES` — switched off for
 * everyone at both enforcement points (`hasEntitlementForUserId` and
 * `useHasFeature`), pending the redesign in
 * docs/future/CHALLENGES_AS_SUGGESTIONS.md. The bullet outlived the
 * withholding: this list went on selling it after it was closed, so the page
 * promised paying subscribers a feature their own account would refuse them.
 * Entitlements are untouched — `PLUS_FEATURES` still issues the row, so nobody
 * needs a backfill on the day it comes back — and this list is only what is
 * claimed, which must never be more than what is switched on.
 */
export const SHARED_SPACES_ADDON_FEATURE_BULLETS = [
  'Everything in free',
  'Review — time-based quizzes that help you remember what you have studied',
  'Unlimited shared spaces',
  `Up to ${MEMBERS_PER_SPACE_CAP} people per space`,
  'Turn a thread into a study plan your group reads together',
  'Joining is always free',
] as const;

/**
 * Which bullet the active copy rewrites with live usage. Named rather than
 * assumed, so reordering the list above is a one-line change here instead of a
 * silent mismatch between the purchase and active copy.
 *
 * Was 3 while Challenges sat above this line; dropping that bullet moved the
 * owned-spaces line up one, and leaving this at 3 would have rewritten the
 * member cap with a space count instead.
 */
const OWNED_SPACES_BULLET_INDEX = 2;

/** Purchase-copy line for owned spaces. */
const OWNED_SPACES_PURCHASE_BULLET =
  SHARED_SPACES_ADDON_FEATURE_BULLETS[OWNED_SPACES_BULLET_INDEX];

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

  const ownedLimit = options.ownedLimit ?? OWNED_SHARED_SPACES_ADDON_LIMIT;
  const ownedCount = options.ownedCount;

  const ownedBullet =
    ownedCount == null
      ? OWNED_SPACES_PURCHASE_BULLET
      : formatOwnedSharedSpacesFeatureBullet({ ownedCount, ownedLimit });

  return SHARED_SPACES_ADDON_FEATURE_BULLETS.map((bullet, index) =>
    index === OWNED_SPACES_BULLET_INDEX ? ownedBullet : bullet,
  );
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
