import { useAuth } from '@clerk/clerk-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';
import { api } from '../lib/api';
import { setNavSpaceNewNoteCount } from '@/lib/shared-space-nav-cache';
import type { SpaceNoteRow } from './queries/useSpace';

function normalizeSpaceId(spaceId: string): string {
  return spaceId.startsWith('space_') ? spaceId : `space_${spaceId}`;
}

const UNSEEN_PREFIX = 'harvous_shared_space_unseen_';

export function getSharedSpaceUnseenSince(spaceId: string): string | null {
  try {
    return sessionStorage.getItem(`${UNSEEN_PREFIX}${normalizeSpaceId(spaceId)}`);
  } catch {
    return null;
  }
}

export function setSharedSpaceUnseenSince(spaceId: string, iso: string | null) {
  const key = `${UNSEEN_PREFIX}${normalizeSpaceId(spaceId)}`;
  try {
    if (iso) sessionStorage.setItem(key, iso);
    else sessionStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export interface SharedSpaceActivityPreview {
  newNoteCount: number;
  totalNoteCount: number;
  recentNotes: SpaceNoteRow[];
  newContributors?: Array<{ displayName: string; noteCount: number }>;
}

export interface SharedSpaceVisitResult {
  previousVisitedAt: string | null;
  newNoteCount: number;
  totalNoteCount: number;
}

const emptyVisit = (): SharedSpaceVisitResult => ({
  previousVisitedAt: null,
  newNoteCount: 0,
  totalNoteCount: 0,
});

export function sharedSpaceLastVisitQueryKey(spaceId: string) {
  return ['space', normalizeSpaceId(spaceId), 'last-visit'] as const;
}

export function useSharedSpaceActivityPreview(spaceId: string | null) {
  const id = spaceId ? normalizeSpaceId(spaceId) : '';
  return useQuery({
    queryKey: ['space', id, 'activity-preview'],
    queryFn: () => api.get<SharedSpaceActivityPreview>(`/api/spaces/${id}/activity-preview`),
    enabled: !!id,
    staleTime: 15_000,
  });
}

/**
 * Read the cached POST /visit result (catch-up count against the prior watermark).
 * Populated by {@link useSharedSpaceVisitStamp}.
 */
export function useSharedSpaceLastVisit(spaceId: string | null) {
  const queryClient = useQueryClient();
  const id = spaceId ? normalizeSpaceId(spaceId) : '';
  return useQuery({
    queryKey: sharedSpaceLastVisitQueryKey(id || '_'),
    queryFn: () => queryClient.getQueryData<SharedSpaceVisitResult>(sharedSpaceLastVisitQueryKey(id)) ?? emptyVisit(),
    enabled: !!id,
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

/**
 * Stamp membership lastVisitedAt once per space entry in this shell mount chain.
 * Mount from a parent that survives dashboard ↔ notes-list toggles (layout chrome).
 */
export function useSharedSpaceVisitStamp(spaceId: string | null) {
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  const id = spaceId ? normalizeSpaceId(spaceId) : '';
  const stampedRef = useRef<string | null>(null);

  const visitMutation = useMutation({
    mutationFn: () => api.post<SharedSpaceVisitResult>(`/api/spaces/${id}/visit`),
    onSuccess: (data) => {
      queryClient.setQueryData(sharedSpaceLastVisitQueryKey(id), data);
      if (data.previousVisitedAt) {
        setSharedSpaceUnseenSince(id, data.previousVisitedAt);
      } else {
        setSharedSpaceUnseenSince(id, null);
      }
      if (userId) setNavSpaceNewNoteCount(queryClient, userId, id, 0);
      void queryClient.invalidateQueries({ queryKey: ['space', id, 'activity-preview'] });
    },
  });

  useEffect(() => {
    if (!id) return;
    if (stampedRef.current === id) return;
    stampedRef.current = id;
    visitMutation.mutate();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps -- once per space entry
}

/**
 * @deprecated Prefer {@link useSharedSpaceVisitStamp} in layout + {@link useSharedSpaceLastVisit} for banner data.
 * Kept as a convenience that both stamps and returns counts (dashboard-only callers).
 */
export function useSharedSpaceVisit(spaceId: string | null) {
  useSharedSpaceVisitStamp(spaceId);
  const { data } = useSharedSpaceLastVisit(spaceId);
  return {
    visitResult: data,
    isVisiting: false,
    newNoteCount: data?.newNoteCount ?? 0,
    previousVisitedAt: data?.previousVisitedAt ?? null,
  };
}
