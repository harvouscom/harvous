import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { HARVOUS_SPACE_NOTES_CACHE_PREFIX } from '@/utils/user-cache-keys';
import { APIError } from '../../../lib/api';
import { PROTO_LAST_SPACE_KEY } from '../../../layouts/proto-session-keys';
import { deletedSpacesQueryKey } from '../../queries/useDeletedSpaces';
import { getNavigationQueryKey, type NavigationData } from '../../queries/useNavigation';
import { applyDeletedSpaceClientState, isDeletedSpaceUnavailableError } from '../useDeleteSharedSpace';

describe('delete shared space cache cleanup', () => {
  it('removes active metadata and invalidates all lifecycle query families', () => {
    const queryClient = new QueryClient();
    const sid = 'space_deleted';
    const navigationKey = getNavigationQueryKey('user_1');
    queryClient.setQueryData<NavigationData>(navigationKey, {
      spaces: [{ id: sid, title: 'Deleted space' }],
      threads: [{ id: 'thread_deleted', spaceId: sid }],
      memberOfSpaces: [],
      inboxCount: 0,
    } as unknown as NavigationData);
    queryClient.setQueryData(['space', sid, 'bootstrap'], { space: { id: sid } });
    queryClient.setQueryData(['dashboard'], {});
    queryClient.setQueryData(['spaces', 'owned'], []);
    queryClient.setQueryData(deletedSpacesQueryKey, { spaces: [] });
    queryClient.setQueryData(['thread', 'thread_deleted'], {});
    queryClient.setQueryData(['unrelated'], true);

    sessionStorage.setItem(`harvous-space-bootstrap-${sid}`, '{}');
    sessionStorage.setItem('harvous-space-bootstrap-index', JSON.stringify([sid]));
    sessionStorage.setItem(`${HARVOUS_SPACE_NOTES_CACHE_PREFIX}${sid}`, '{}');
    sessionStorage.setItem('harvous_just_joined_space', JSON.stringify({ id: sid }));
    localStorage.setItem(PROTO_LAST_SPACE_KEY, sid);

    applyDeletedSpaceClientState(queryClient, 'user_1', sid);

    expect(queryClient.getQueryData<NavigationData>(navigationKey)?.spaces).toEqual([]);
    expect(queryClient.getQueryData<NavigationData>(navigationKey)?.threads).toEqual([]);
    expect(queryClient.getQueryData(['space', sid, 'bootstrap'])).toBeUndefined();
    expect(queryClient.getQueryState(navigationKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(['dashboard'])?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(['spaces', 'owned'])?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(deletedSpacesQueryKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(['thread', 'thread_deleted'])?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(['unrelated'])?.isInvalidated).toBe(false);
    expect(sessionStorage.getItem(`harvous-space-bootstrap-${sid}`)).toBeNull();
    expect(sessionStorage.getItem(`${HARVOUS_SPACE_NOTES_CACHE_PREFIX}${sid}`)).toBeNull();
    expect(sessionStorage.getItem('harvous_just_joined_space')).toBeNull();
    expect(localStorage.getItem(PROTO_LAST_SPACE_KEY)).toBeNull();
  });

  it('reconciles not-found and repeat-delete failures but not server failures', () => {
    expect(isDeletedSpaceUnavailableError(new APIError(404, 'Not found'))).toBe(true);
    expect(isDeletedSpaceUnavailableError(new APIError(409, 'Already deleted', 'ALREADY_DELETED'))).toBe(true);
    expect(isDeletedSpaceUnavailableError(new APIError(500, 'Failed'))).toBe(false);
  });
});
