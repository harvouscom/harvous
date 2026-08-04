import { describe, expect, it, beforeEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import {
  appendOwnedSpaceToNavCache,
  getNavigationQueryHydrationOptions,
  getNavigationQueryKey,
  NAVIGATION_FETCH_CACHE,
  NAVIGATION_QUERY_DEFAULTS,
  removeOwnedSpaceFromNavCache,
  resolveNavigationSharedSpaceAccess,
  type NavigationData,
} from '../useNavigation';

describe('getNavigationQueryHydrationOptions', () => {
  it('uses placeholderData only — never initialData that would suppress refetch', () => {
    const cached: NavigationData = {
      threads: [],
      spaces: [
        {
          id: 'space_home',
          title: 'My Home',
          color: null,
          backgroundGradient: '',
          ownerId: 'user_1',
          memberCount: 1,
          type: 'personal',
        },
      ],
      memberOfSpaces: [],
      inboxCount: 0,
    };

    const options = getNavigationQueryHydrationOptions(cached);
    expect(options.placeholderData).toBe(cached);
    // `true`, not `'always'`: the flag was deliberately relaxed because `'always'`
    // ignores staleTime, and ~10 components call useNavigation(), so a burst of remounts
    // during normal navigation forced a fresh request every time. The intent this test
    // exists to guard — a session-cached snapshot must never suppress the refetch — is
    // upheld by the assertions below: placeholderData sets no dataUpdatedAt, so the query
    // is stale on mount and `true` refetches.
    expect(options.refetchOnMount).toBe(NAVIGATION_QUERY_DEFAULTS.refetchOnMount);
    expect(options.staleTime).toBe(NAVIGATION_QUERY_DEFAULTS.staleTime);
    expect(options).not.toHaveProperty('initialData');
    expect(options).not.toHaveProperty('initialDataUpdatedAt');
  });

  it('still schedules mount refetch when there is no session cache', () => {
    const options = getNavigationQueryHydrationOptions(undefined);
    expect(options.placeholderData).toBeUndefined();
    expect(options.refetchOnMount).toBe(NAVIGATION_QUERY_DEFAULTS.refetchOnMount);
  });

  it('uses no-store for the navigation fetch', () => {
    expect(NAVIGATION_FETCH_CACHE).toBe('no-store');
  });

  it('space switcher owned filter requires type shared after fresh data', () => {
    const nav: NavigationData = {
      threads: [],
      spaces: [
        {
          id: 'space_home',
          title: 'My Home',
          color: null,
          backgroundGradient: '',
          ownerId: 'user_1',
          memberCount: 1,
          type: 'personal',
        },
        {
          id: 'space_study',
          title: 'Study Group',
          color: null,
          backgroundGradient: '',
          ownerId: 'user_1',
          memberCount: 1,
          type: 'shared',
        },
        {
          id: 'space_legacy',
          title: 'Legacy row without type',
          color: null,
          backgroundGradient: '',
          ownerId: 'user_1',
          memberCount: 1,
        },
      ],
      memberOfSpaces: [],
      inboxCount: 0,
    };
    const ownedShared = nav.spaces.filter((s) => s.type === 'shared');
    expect(ownedShared.map((s) => s.id)).toEqual(['space_study']);
  });
});

describe('appendOwnedSpaceToNavCache', () => {
  let queryClient: QueryClient;
  const userId = 'user_test';

  beforeEach(() => {
    queryClient = new QueryClient();
    sessionStorage.clear();
  });

  it('appends a shared space row to navigation cache', () => {
    queryClient.setQueryData<NavigationData>(getNavigationQueryKey(userId), {
      threads: [],
      spaces: [{ id: 'space_home', title: 'My Home', color: 'blue', backgroundGradient: '', ownerId: userId, memberCount: 1, type: 'personal' }],
      memberOfSpaces: [],
      inboxCount: 0,
    });

    appendOwnedSpaceToNavCache(queryClient, userId, {
      id: 'space_abc123',
      title: 'Study Group',
      color: 'purple',
      backgroundGradient: 'linear-gradient(...)',
    });

    const nav = queryClient.getQueryData<NavigationData>(getNavigationQueryKey(userId));
    expect(nav?.spaces).toHaveLength(2);
    expect(nav?.spaces[1]).toMatchObject({
      id: 'space_abc123',
      title: 'Study Group',
      type: 'shared',
      ownerId: userId,
    });
  });

  it('does not duplicate an existing space id', () => {
    queryClient.setQueryData<NavigationData>(getNavigationQueryKey(userId), {
      threads: [],
      spaces: [{ id: 'space_abc123', title: 'Existing', color: 'blue', backgroundGradient: '', ownerId: userId, memberCount: 1, type: 'shared' }],
      memberOfSpaces: [],
      inboxCount: 0,
    });

    appendOwnedSpaceToNavCache(queryClient, userId, {
      id: 'space_abc123',
      title: 'Duplicate',
      color: 'purple',
      backgroundGradient: '',
    });

    const nav = queryClient.getQueryData<NavigationData>(getNavigationQueryKey(userId));
    expect(nav?.spaces).toHaveLength(1);
    expect(nav?.spaces[0]?.title).toBe('Existing');
  });
});

describe('resolveNavigationSharedSpaceAccess', () => {
  const baseSpace = {
    color: 'blue',
    backgroundGradient: '',
    ownerId: 'owner',
    memberCount: 2,
  };

  it('uses explicit context B instead of owned active space A', () => {
    const nav: NavigationData = {
      threads: [],
      spaces: [
        { ...baseSpace, id: 'space_A', title: 'Active A', type: 'shared' },
        { ...baseSpace, id: 'space_home', title: 'My Home', type: 'personal' },
      ],
      memberOfSpaces: [
        { ...baseSpace, id: 'space_B', title: 'Context B', type: 'shared', role: 'member' },
      ],
      inboxCount: 0,
    };

    expect(resolveNavigationSharedSpaceAccess(nav, 'space_B')).toMatchObject({
      role: 'member',
      isOwner: false,
      space: { id: 'space_B' },
    });
  });

  it('resolves explicit owned context B while the shell may be on Home', () => {
    const nav: NavigationData = {
      threads: [],
      spaces: [
        { ...baseSpace, id: 'space_home', title: 'My Home', type: 'personal' },
        { ...baseSpace, id: 'space_B', title: 'Context B', type: 'shared' },
      ],
      memberOfSpaces: [],
      inboxCount: 0,
    };

    expect(resolveNavigationSharedSpaceAccess(nav, 'B')).toMatchObject({
      role: 'owner',
      isOwner: true,
      space: { id: 'space_B' },
    });
  });

  it('fails closed for unknown roles and personal Home context', () => {
    const nav: NavigationData = {
      threads: [],
      spaces: [{ ...baseSpace, id: 'space_home', title: 'My Home', type: 'personal' }],
      memberOfSpaces: [
        { ...baseSpace, id: 'space_B', title: 'Context B', type: 'shared' },
      ],
      inboxCount: 0,
    };

    expect(resolveNavigationSharedSpaceAccess(nav, 'space_B')).toBeNull();
    expect(resolveNavigationSharedSpaceAccess(nav, 'space_home')).toBeNull();
    expect(resolveNavigationSharedSpaceAccess(undefined, 'space_B')).toBeNull();
  });
});

describe('removeOwnedSpaceFromNavCache', () => {
  let queryClient: QueryClient;
  const userId = 'user_test';

  beforeEach(() => {
    queryClient = new QueryClient();
    sessionStorage.clear();
  });

  it('removes a deleted space from navigation cache', () => {
    queryClient.setQueryData<NavigationData>(getNavigationQueryKey(userId), {
      threads: [],
      spaces: [
        { id: 'space_home', title: 'My Home', color: 'blue', backgroundGradient: '', ownerId: userId, memberCount: 1, type: 'personal' },
        { id: 'space_abc123', title: 'Study Group', color: 'purple', backgroundGradient: '', ownerId: userId, memberCount: 1, type: 'shared' },
      ],
      memberOfSpaces: [],
      inboxCount: 0,
    });

    removeOwnedSpaceFromNavCache(queryClient, userId, 'space_abc123');

    const nav = queryClient.getQueryData<NavigationData>(getNavigationQueryKey(userId));
    expect(nav?.spaces).toHaveLength(1);
    expect(nav?.spaces[0]?.id).toBe('space_home');
  });

  it('normalizes space id without space_ prefix', () => {
    queryClient.setQueryData<NavigationData>(getNavigationQueryKey(userId), {
      threads: [],
      spaces: [{ id: 'space_xyz', title: 'Gone', color: 'blue', backgroundGradient: '', ownerId: userId, memberCount: 1, type: 'shared' }],
      memberOfSpaces: [],
      inboxCount: 0,
    });

    removeOwnedSpaceFromNavCache(queryClient, userId, 'xyz');

    const nav = queryClient.getQueryData<NavigationData>(getNavigationQueryKey(userId));
    expect(nav?.spaces).toHaveLength(0);
  });
});
