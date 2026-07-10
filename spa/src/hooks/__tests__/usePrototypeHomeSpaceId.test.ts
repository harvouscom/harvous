import { describe, expect, it } from 'vitest';
import type { NavigationData, NavSpace } from '../queries/useNavigation';
import {
  computePrototypeAuthReady,
  resolvePrototypeHomeSpaceId,
  shouldRepairStaleNavForPersistedSharedSpace,
} from '../usePrototypeHomeSpaceId';

const myHomeSpace: NavSpace = {
  id: 'space_home',
  title: 'My Home',
  color: null,
  backgroundGradient: '',
  ownerId: 'user_1',
  memberCount: 1,
  type: 'personal',
};

const sharedSpace: NavSpace = {
  id: 'space_shared',
  title: 'Study Group',
  color: null,
  backgroundGradient: '',
  ownerId: 'user_1',
  memberCount: 2,
  type: 'shared',
};

const navHomeOnly: NavigationData = {
  threads: [],
  spaces: [myHomeSpace],
  memberOfSpaces: [],
  inboxCount: 0,
};

describe('computePrototypeAuthReady', () => {
  it('is true when Clerk is loaded and signed in', () => {
    expect(computePrototypeAuthReady(true, true, 'user_1', false, undefined)).toBe(true);
  });

  it('is true from session cookie hint before Clerk loads', () => {
    expect(computePrototypeAuthReady(false, false, undefined, true, 'user_cached')).toBe(true);
  });

  it('is false with no session signal', () => {
    expect(computePrototypeAuthReady(false, false, undefined, false, undefined)).toBe(false);
  });
});

describe('resolvePrototypeHomeSpaceId', () => {
  it('prefers nav “My Home” before auth is ready', () => {
    expect(
      resolvePrototypeHomeSpaceId([myHomeSpace], false, 'space_cached', null),
    ).toBe('space_home');
  });

  it('uses localStorage fallback when auth is ready and nav has no spaces', () => {
    expect(resolvePrototypeHomeSpaceId([], true, 'space_cached', null)).toBe('space_cached');
  });

  it('uses selected space fallback when auth is ready and no last-space id', () => {
    expect(resolvePrototypeHomeSpaceId([], true, null, 'space_selected')).toBe('space_selected');
  });

  it('returns null while auth is pending and nav has no spaces', () => {
    expect(resolvePrototypeHomeSpaceId([], false, 'space_cached', 'space_selected')).toBe(null);
  });
});

describe('shouldRepairStaleNavForPersistedSharedSpace', () => {
  it('repairs when persisted shared id is missing from a non-empty nav snapshot', () => {
    expect(
      shouldRepairStaleNavForPersistedSharedSpace({
        navReady: true,
        isFetching: false,
        homeSpaceId: 'space_home',
        persistedActiveSpaceId: 'space_shared',
        nav: navHomeOnly,
      }),
    ).toBe(true);
  });

  it('does not repair while a fetch is in flight', () => {
    expect(
      shouldRepairStaleNavForPersistedSharedSpace({
        navReady: true,
        isFetching: true,
        homeSpaceId: 'space_home',
        persistedActiveSpaceId: 'space_shared',
        nav: navHomeOnly,
      }),
    ).toBe(false);
  });

  it('does not repair when the shared space is already in nav', () => {
    expect(
      shouldRepairStaleNavForPersistedSharedSpace({
        navReady: true,
        isFetching: false,
        homeSpaceId: 'space_home',
        persistedActiveSpaceId: 'space_shared',
        nav: { ...navHomeOnly, spaces: [myHomeSpace, sharedSpace] },
      }),
    ).toBe(false);
  });

  it('does not repair when persisted id is My Home', () => {
    expect(
      shouldRepairStaleNavForPersistedSharedSpace({
        navReady: true,
        isFetching: false,
        homeSpaceId: 'space_home',
        persistedActiveSpaceId: 'space_home',
        nav: navHomeOnly,
      }),
    ).toBe(false);
  });

  it('does not repair when nav has no spaces yet', () => {
    expect(
      shouldRepairStaleNavForPersistedSharedSpace({
        navReady: true,
        isFetching: false,
        homeSpaceId: 'space_home',
        persistedActiveSpaceId: 'space_shared',
        nav: { threads: [], spaces: [], memberOfSpaces: [], inboxCount: 0 },
      }),
    ).toBe(false);
  });

  it('repairs when the space is only missing from owned list but present as memberOf', () => {
    expect(
      shouldRepairStaleNavForPersistedSharedSpace({
        navReady: true,
        isFetching: false,
        homeSpaceId: 'space_home',
        persistedActiveSpaceId: 'space_joined',
        nav: {
          ...navHomeOnly,
          memberOfSpaces: [{ ...sharedSpace, id: 'space_joined', role: 'member' }],
        },
      }),
    ).toBe(false);
  });
});
