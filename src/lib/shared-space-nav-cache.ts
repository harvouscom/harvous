import type { QueryClient } from '@tanstack/react-query';
import { getNavigationQueryKey, type NavigationData } from '../../spa/src/hooks/queries/useNavigation';
import { HARVOUS_NAV_CACHE_KEY } from '@/utils/user-cache-keys';

function normalizeSpaceId(spaceId: string): string {
  return spaceId.startsWith('space_') ? spaceId : `space_${spaceId}`;
}

function patchNavSpaceNewCount(data: NavigationData, spaceId: string, delta: number): NavigationData {
  const id = normalizeSpaceId(spaceId);
  const patchList = (spaces: NavigationData['spaces']) =>
    spaces.map((s) => {
      if (s.id !== id && normalizeSpaceId(s.id) !== id) return s;
      const current = s.newNoteCount ?? 0;
      const next = Math.max(0, current + delta);
      return { ...s, newNoteCount: next };
    });
  return {
    ...data,
    spaces: patchList(data.spaces),
    memberOfSpaces: patchList(data.memberOfSpaces),
  };
}

export function setNavSpaceNewNoteCount(
  queryClient: QueryClient,
  userId: string,
  spaceId: string,
  newNoteCount: number,
): void {
  const key = getNavigationQueryKey(userId);
  queryClient.setQueryData<NavigationData>(key, (old) => {
    if (!old) return old;
    const id = normalizeSpaceId(spaceId);
    const apply = (spaces: NavigationData['spaces']) =>
      spaces.map((s) =>
        s.id === id || normalizeSpaceId(s.id) === id ? { ...s, newNoteCount: Math.max(0, newNoteCount) } : s,
      );
    const next = { ...old, spaces: apply(old.spaces), memberOfSpaces: apply(old.memberOfSpaces) };
    try {
      sessionStorage.setItem(HARVOUS_NAV_CACHE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    return next;
  });
}

export function bumpNavSpaceNewNoteCount(
  queryClient: QueryClient,
  userId: string,
  spaceId: string,
  delta = 1,
): void {
  const key = getNavigationQueryKey(userId);
  queryClient.setQueryData<NavigationData>(key, (old) => {
    if (!old) return old;
    const next = patchNavSpaceNewCount(old, spaceId, delta);
    try {
      sessionStorage.setItem(HARVOUS_NAV_CACHE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
    return next;
  });
}
