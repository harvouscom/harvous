import { describe, expect, it } from 'vitest';
import type { NavSpace } from '../queries/useNavigation';
import {
  computePrototypeShellAuthReady,
  resolvePrototypeHomeSpaceId,
} from '../usePrototypeHomeSpaceId';

const myHomeSpace: NavSpace = {
  id: 'space_home',
  title: 'My Home',
  color: null,
  backgroundGradient: '',
  ownerId: 'user_1',
  memberCount: 1,
};

describe('computePrototypeShellAuthReady', () => {
  it('is true when Clerk is loaded and signed in', () => {
    expect(computePrototypeShellAuthReady(true, true, 'user_1', false, undefined)).toBe(true);
  });

  it('is true from session cookie hint before Clerk loads', () => {
    expect(computePrototypeShellAuthReady(false, false, undefined, true, 'user_cached')).toBe(true);
  });

  it('is false with no session signal', () => {
    expect(computePrototypeShellAuthReady(false, false, undefined, false, undefined)).toBe(false);
  });
});

describe('resolvePrototypeHomeSpaceId', () => {
  it('prefers nav “My Home” before shell auth is ready', () => {
    expect(
      resolvePrototypeHomeSpaceId([myHomeSpace], false, 'space_cached', null),
    ).toBe('space_home');
  });

  it('uses localStorage fallback when shell auth is ready and nav has no spaces', () => {
    expect(resolvePrototypeHomeSpaceId([], true, 'space_cached', null)).toBe('space_cached');
  });

  it('uses selected space fallback when shell auth is ready and no last-space id', () => {
    expect(resolvePrototypeHomeSpaceId([], true, null, 'space_selected')).toBe('space_selected');
  });

  it('returns null while shell auth is pending and nav has no spaces', () => {
    expect(resolvePrototypeHomeSpaceId([], false, 'space_cached', 'space_selected')).toBe(null);
  });
});
