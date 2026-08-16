import { describe, expect, it } from 'vitest';
import {
  formatOwnedSharedSpacesFeatureBullet,
  getSpaceMembersCapacityCopy,
  getSharedSpacesAddonFeatureBullets,
  OWNED_SHARED_SPACES_ADDON_LIMIT,
} from '../shared-spaces-limits';

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
    expect(bullets[1]).toBe('Unlimited shared spaces');
    expect(bullets).toHaveLength(5);
  });

  it('keeps Everything in free and swaps the owned-spaces bullet when active', () => {
    const bullets = getSharedSpacesAddonFeatureBullets({
      hasAddOn: true,
      ownedCount: 2,
      ownedLimit: 10,
    });
    expect(bullets[0]).toBe('Everything in free');
    expect(bullets[1]).toBe('2 out of 10 shared spaces');
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
