import { describe, expect, it } from 'vitest';
import {
  formatOwnedSharedSpacesFeatureBullet,
  getSpaceMembersCapacityCopy,
  getSharedSpacesAddonFeatureBullets,
  OWNED_SHARED_SPACES_ADDON_LIMIT,
} from '../shared-spaces-limits';

describe('formatOwnedSharedSpacesFeatureBullet', () => {
  it('shows full capacity when none are created yet', () => {
    expect(formatOwnedSharedSpacesFeatureBullet({ ownedCount: 0, ownedLimit: 10 })).toBe(
      'You can create up to 10 shared spaces included with your plan and invite others to study with you',
    );
  });

  it('shows remaining count when some spaces are created', () => {
    expect(formatOwnedSharedSpacesFeatureBullet({ ownedCount: 3, ownedLimit: 10 })).toBe(
      'You can create 7 more of the 10 shared spaces\u00A0included with your plan',
    );
  });

  it('uses singular copy for one space left', () => {
    expect(formatOwnedSharedSpacesFeatureBullet({ ownedCount: 9, ownedLimit: 10 })).toBe(
      'You can create 1 more of the 10 shared spaces\u00A0included with your plan',
    );
  });

  it('shows at-limit copy when all included spaces are created', () => {
    expect(formatOwnedSharedSpacesFeatureBullet({ ownedCount: 10, ownedLimit: 10 })).toBe(
      "You've created all 10 shared spaces included with your plan",
    );
  });
});

describe('unlimited owned spaces (Plus)', () => {
  it('uses unlimited purchase copy when nothing is created yet', () => {
    expect(
      formatOwnedSharedSpacesFeatureBullet({ ownedCount: 0, ownedLimit: OWNED_SHARED_SPACES_ADDON_LIMIT }),
    ).toBe('Unlimited shared spaces');
  });

  it('counts up instead of down when the limit is unlimited', () => {
    expect(
      formatOwnedSharedSpacesFeatureBullet({ ownedCount: 3, ownedLimit: OWNED_SHARED_SPACES_ADDON_LIMIT }),
    ).toBe("You've created 3 shared spaces — your plan includes\u00A0unlimited");
  });

  it('uses singular copy for a single created space', () => {
    expect(
      formatOwnedSharedSpacesFeatureBullet({ ownedCount: 1, ownedLimit: OWNED_SHARED_SPACES_ADDON_LIMIT }),
    ).toBe("You've created 1 shared space — your plan includes\u00A0unlimited");
  });
});

describe('getSharedSpacesAddonFeatureBullets', () => {
  it('returns purchase copy when the add-on is inactive', () => {
    const bullets = getSharedSpacesAddonFeatureBullets({ hasAddOn: false });
    expect(bullets[0]).toBe('Everything in free');
    expect(bullets[1]).toBe('Unlimited shared spaces');
    expect(bullets).toHaveLength(4);
  });

  it('keeps Everything in free and swaps the owned-spaces bullet when active', () => {
    const bullets = getSharedSpacesAddonFeatureBullets({
      hasAddOn: true,
      ownedCount: 2,
      ownedLimit: 10,
    });
    expect(bullets[0]).toBe('Everything in free');
    expect(bullets[1]).toBe('You can create 8 more of the 10 shared spaces\u00A0included with your plan');
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
