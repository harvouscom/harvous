import { describe, expect, it, beforeEach } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import {
  appendOwnedSpaceToNavCache,
  getNavigationQueryKey,
  type NavigationData,
} from '../useNavigation';

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
