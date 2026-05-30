import type { QueryClient } from '@tanstack/react-query';
import { navigationQueryKeyPrefix, NAV_SESSION_CACHE_KEY } from '../hooks/queries/useNavigation';
import { clearAllSessionSpaceCaches } from '../hooks/queries/useSpace';

/** Current API origin used by the SPA (prod when deployed, or VITE_API_BASE_URL in dev). */
export function clientApiOrigin(): string {
  const base = import.meta.env.VITE_API_BASE_URL as string | undefined;
  if (base && base.trim().length > 0) return base.replace(/\/$/, '');
  if (typeof window !== 'undefined') return window.location.origin;
  return '';
}

/**
 * Lightweight list refresh for `/prototype` after remote sync — does not clear sessionStorage
 * or refetch every open note (avoids refetch storms that correlate with Aw Snap error 5).
 */
export async function refreshPrototypeLists(
  queryClient: QueryClient,
  homeSpaceId?: string | null,
): Promise<void> {
  await queryClient.invalidateQueries({ queryKey: navigationQueryKeyPrefix });
  if (homeSpaceId) {
    await queryClient.invalidateQueries({ queryKey: ['space', homeSpaceId, 'notes'] });
  } else {
    await queryClient.invalidateQueries({
      queryKey: ['space'],
      predicate: (query) => query.queryKey[2] === 'notes',
    });
  }
}

/** Clears sessionStorage snapshots and refetches active React Query caches from the server. */
export async function refreshClientData(queryClient: QueryClient): Promise<void> {
  try {
    sessionStorage.removeItem(NAV_SESSION_CACHE_KEY);
  } catch {
    /* private browsing */
  }
  clearAllSessionSpaceCaches();

  await queryClient.invalidateQueries({ queryKey: navigationQueryKeyPrefix });
  await queryClient.invalidateQueries({ queryKey: ['space'] });
  await queryClient.invalidateQueries({ queryKey: ['note'] });
  await queryClient.refetchQueries({ type: 'active' });
}
