import { describe, expect, it } from 'vitest';
import {
  formatOwnedSharedSpacesFeatureBullet,
  getSpaceMembersCapacityCopy,
  getSharedSpacesAddonFeatureBullets,
  OWNED_SHARED_SPACES_ADDON_LIMIT,
} from '../shared-spaces-limits';
import { WITHHELD_FEATURES } from '../billing-plans';

describe('formatOwnedSharedSpacesFeatureBullet', () => {
  it('shows usage against a finite allotment', () => {
    expect(formatOwnedSharedSpacesFeatureBullet({ ownedCount: 0, ownedLimit: 10 })).toBe(
      '0 out of 10 shared spaces',
    );
    expect(formatOwnedSharedSpacesFeatureBullet({ ownedCount: 3, ownedLimit: 10 })).toBe(
      '3 out of 10 shared spaces',
    );
    expect(formatOwnedSharedSpacesFeatureBullet({ ownedCount: 10, ownedLimit: 10 })).toBe(
      '10 out of 10 shared spaces',
    );
  });

  it('uses singular copy when the allotment is one space', () => {
    expect(formatOwnedSharedSpacesFeatureBullet({ ownedCount: 1, ownedLimit: 1 })).toBe(
      '1 out of 1 shared space',
    );
  });
});

describe('unlimited owned spaces (Plus)', () => {
  it('uses unlimited purchase copy when nothing is created yet', () => {
    expect(
      formatOwnedSharedSpacesFeatureBullet({ ownedCount: 0, ownedLimit: OWNED_SHARED_SPACES_ADDON_LIMIT }),
    ).toBe('Unlimited shared spaces');
  });

  it('counts created spaces against unlimited', () => {
    expect(
      formatOwnedSharedSpacesFeatureBullet({ ownedCount: 3, ownedLimit: OWNED_SHARED_SPACES_ADDON_LIMIT }),
    ).toBe('3 out of\u00A0unlimited shared spaces');
  });

  it('keeps plural spaces when one is created against unlimited', () => {
    expect(
      formatOwnedSharedSpacesFeatureBullet({ ownedCount: 1, ownedLimit: OWNED_SHARED_SPACES_ADDON_LIMIT }),
    ).toBe('1 out of\u00A0unlimited shared spaces');
  });
});

describe('getSharedSpacesAddonFeatureBullets', () => {
  it('returns purchase copy when the add-on is inactive', () => {
    const bullets = getSharedSpacesAddonFeatureBullets({ hasAddOn: false });
    expect(bullets[0]).toBe('Everything in free');
    // Review leads: since 3.0 it is what someone is buying, and it works for one
    // person on the day they pay. Hosting follows.
    expect(bullets[1]).toBe('Review — time-based quizzes that help you remember what you have studied');
    expect(bullets[2]).toBe('Unlimited shared spaces');
    expect(bullets).toHaveLength(6);
  });

  /**
   * The bug this pins actually shipped: Challenges was added to
   * `WITHHELD_FEATURES` — closed at `hasEntitlementForUserId` and hidden by
   * `useHasFeature` — while this list went on selling it, so the upgrade page
   * promised paying subscribers a feature their own account would refuse them.
   *
   * Driven off `WITHHELD_FEATURES` rather than naming Challenges, so withholding
   * the next thing fails here too instead of quietly repeating the mistake. No
   * non-empty guard on purpose: withholding nothing is a legitimate end state,
   * and this should go quiet then rather than demand a feature stay switched off.
   */
  it('never advertises a withheld feature, in either copy', () => {
    for (const bullets of [
      getSharedSpacesAddonFeatureBullets({ hasAddOn: false }),
      getSharedSpacesAddonFeatureBullets({ hasAddOn: true, ownedCount: 2, ownedLimit: 10 }),
    ]) {
      // The active copy rewrites exactly one bullet and passes the rest through,
      // so neither copy can gain or lose these on its own.
      expect(bullets.some((b) => /^Review —/.test(b))).toBe(true);
      for (const key of WITHHELD_FEATURES) {
        expect(bullets.some((b) => b.toLowerCase().includes(key))).toBe(false);
      }
    }
  });

  it('keeps Everything in free and swaps the owned-spaces bullet when active', () => {
    const bullets = getSharedSpacesAddonFeatureBullets({
      hasAddOn: true,
      ownedCount: 2,
      ownedLimit: 10,
    });
    expect(bullets[0]).toBe('Everything in free');
    expect(bullets[1]).toBe('Review — time-based quizzes that help you remember what you have studied');
    expect(bullets[2]).toBe('2 out of 10 shared spaces');
    // Only the owned-spaces line is rewritten; everything else passes through.
    expect(bullets).toHaveLength(6);
  });
});

describe('getSpaceMembersCapacityCopy', () => {
  it('shows remaining invites and the per-space maximum', () => {
    expect(getSpaceMembersCapacityCopy({ memberCount: 2, memberLimit: 30 })).toEqual({
      inviteLine: 'You can invite 28 more people.',
      maxLineText: 'Up to 30 people per space.',
      atLimit: false,
    });
  });

  it('uses singular copy for one spot left', () => {
    expect(getSpaceMembersCapacityCopy({ memberCount: 29, memberLimit: 30 })).toEqual({
      inviteLine: 'You can invite 1 more person.',
      maxLineText: 'Up to 30 people per space.',
      atLimit: false,
    });
  });

  it('shows at-capacity copy when the space is full', () => {
    expect(getSpaceMembersCapacityCopy({ memberCount: 30, memberLimit: 30 })).toEqual({
      maxLineText: 'This space is at its maximum of 30 people.',
      atLimit: true,
    });
  });
});
