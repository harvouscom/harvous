import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { APIError } from '../../../lib/api';
import {
  invalidateRestoredSpaceQueries,
  isUnavailableDeletedSpaceError,
  refetchUnavailableDeletedSpace,
} from '../useRestoreSpace';
import { deletedSpacesQueryKey, type DeletedSpacesResponse } from '../../queries/useDeletedSpaces';

describe('restore space cache invalidation', () => {
  it('removes the restored row and invalidates navigation, spaces, deleted, and group queries', async () => {
    const queryClient = new QueryClient();
    const restored = {
      id: 'space_restored',
      title: 'Romans study',
      color: null,
      backgroundGradient: null,
      coverBgLight: null,
      coverBgDark: null,
      deletedAt: '2026-07-01T00:00:00.000Z',
      recoveryUntil: '2026-07-31T00:00:00.000Z',
    };
    const remaining = { ...restored, id: 'space_remaining', title: 'Psalms study' };
    queryClient.setQueryData<DeletedSpacesResponse>(deletedSpacesQueryKey, {
      spaces: [restored, remaining],
    });
    queryClient.setQueryData(['navigation', 'user_1'], {});
    queryClient.setQueryData(['spaces', 'owned'], []);
    queryClient.setQueryData(['space', 'space_restored', 'group-threads'], []);
    queryClient.setQueryData(['thread', 'thread_restored'], {});
    queryClient.setQueryData(['unrelated'], true);

    await invalidateRestoredSpaceQueries(queryClient, 'space_restored');

    expect(queryClient.getQueryData<DeletedSpacesResponse>(deletedSpacesQueryKey)?.spaces).toEqual([remaining]);
    expect(queryClient.getQueryState(['navigation', 'user_1'])?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(['spaces', 'owned'])?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(deletedSpacesQueryKey)?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(['space', 'space_restored', 'group-threads'])?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(['thread', 'thread_restored'])?.isInvalidated).toBe(true);
    expect(queryClient.getQueryState(['unrelated'])?.isInvalidated).toBe(false);
  });

  it('removes and refetches stale rows after expiry or not-found failures', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData<DeletedSpacesResponse>(deletedSpacesQueryKey, {
      spaces: [
        {
          id: 'space_expired',
          title: 'Expired',
          color: null,
          backgroundGradient: null,
          coverBgLight: null,
          coverBgDark: null,
          deletedAt: '2026-06-01T00:00:00.000Z',
          recoveryUntil: '2026-07-01T00:00:00.000Z',
        },
      ],
    });
    const refetchSpy = vi.spyOn(queryClient, 'refetchQueries');

    await refetchUnavailableDeletedSpace(queryClient, 'space_expired');

    expect(queryClient.getQueryData<DeletedSpacesResponse>(deletedSpacesQueryKey)?.spaces).toEqual([]);
    expect(queryClient.getQueryState(deletedSpacesQueryKey)?.isInvalidated).toBe(true);
    expect(refetchSpy).toHaveBeenCalledWith({ queryKey: deletedSpacesQueryKey, type: 'active' });
    expect(isUnavailableDeletedSpaceError(new APIError(404, 'Not found'))).toBe(true);
    expect(isUnavailableDeletedSpaceError(new APIError(409, 'Expired'))).toBe(true);
    expect(isUnavailableDeletedSpaceError(new APIError(500, 'Failed'))).toBe(false);
  });
});
