/**
 * The church's Resource Library, in the three shapes the UI asks for it.
 *
 * Three queries rather than one filtered client-side, because they answer to
 * three different gates and a single cache entry would have to be the widest of
 * them — which is how a leaders-only item ends up in a congregant's memory even
 * if it never renders.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/clerk-react';
import { api } from '../../lib/api';
import { useAuthReady } from '../useAuthReady';
import { LIBRARY_QUERY_KEY } from './useLibrary';

/** Who an item is for. `'leaders'` never reaches a plain member's payload. */
export type LibraryItemAccess = 'leaders' | 'members';

export type LibraryScope = {
  scopeKind: 'org' | 'space' | 'ministry';
  spaceId: string | null;
};

export type ChurchLibraryItem = {
  id: string;
  kind: string;
  title: string;
  description: string | null;
  sourceUrl: string | null;
  sourceDomain: string | null;
  sourceSiteName: string | null;
  sourceImage: string | null;
  fileName: string | null;
  fileMime: string | null;
  fileBytes: number | null;
  access: LibraryItemAccess;
  scopes: LibraryScope[];
  createdAt: string | null;
  updatedAt: string | null;
};

/** The staff view adds provenance the congregation never receives. */
export type ChurchLibraryStaffItem = ChurchLibraryItem & {
  createdByUserId: string;
  archivedAt: string | null;
};

export type ChurchLibraryUnionResponse = {
  connected: boolean;
  church: { id: string; name: string } | null;
  items: ChurchLibraryItem[];
};

export type ChurchLibraryManageResponse = {
  library: { id: string; title: string } | null;
  items: ChurchLibraryStaffItem[];
};

export type SpaceLibraryItem = Omit<ChurchLibraryItem, 'scopes'> & {
  /** This room scoped it, rather than inheriting it church-wide. */
  ownedByThisSpace: boolean;
  pinned: boolean;
  sortOrder: number;
};

export type SpaceLibraryResponse = {
  space: { id: string; title: string };
  items: SpaceLibraryItem[];
};

export const churchLibraryUnionQueryKey = (userId: string | null | undefined) =>
  ['library', 'church', userId ?? 'none'] as const;

export const churchLibraryManageQueryKey = (
  userId: string | null | undefined,
  orgId: string | null | undefined,
) => ['library', 'manage', userId ?? 'none', orgId ?? 'none'] as const;

export const spaceLibraryQueryKey = (
  userId: string | null | undefined,
  spaceId: string | null | undefined,
) => ['library', 'space', userId ?? 'none', spaceId ?? 'none'] as const;

/**
 * What the caller's own church has published to them.
 *
 * Takes no org id — the server derives the church from the caller. Safe to
 * mount for anyone: an unconnected user gets `{ connected: false, items: [] }`
 * rather than an error, so the Resources list needs no auth branch.
 */
export function useChurchLibraryUnion() {
  const { userId } = useAuth();
  const authReady = useAuthReady();

  return useQuery({
    queryKey: churchLibraryUnionQueryKey(userId),
    enabled: authReady && !!userId,
    queryFn: () => api.get<ChurchLibraryUnionResponse>('/api/library/church'),
    staleTime: 60_000,
    retry: false,
  });
}

/**
 * The staff catalog — every live item with its scopes.
 *
 * Server-gated on `sermon_tools`; pass `enabled` only once staff status has
 * landed, so a congregant never fires a request that will 403.
 */
export function useChurchLibraryManage(
  orgId: string | null | undefined,
  options?: { enabled?: boolean },
) {
  const { userId } = useAuth();
  const authReady = useAuthReady();
  const trimmed = orgId?.trim() || null;

  return useQuery({
    queryKey: churchLibraryManageQueryKey(userId, trimmed),
    enabled: authReady && !!userId && !!trimmed && options?.enabled === true,
    queryFn: () =>
      api.get<ChurchLibraryManageResponse>(
        `/api/church/library?orgId=${encodeURIComponent(trimmed!)}`,
      ),
    staleTime: 30_000,
    retry: false,
  });
}

/** What one room offers — its own items plus the church's, pinned first. */
export function useSpaceLibrary(
  spaceId: string | null | undefined,
  options?: { enabled?: boolean },
) {
  const { userId } = useAuth();
  const authReady = useAuthReady();
  const trimmed = spaceId?.trim() || null;

  return useQuery({
    queryKey: spaceLibraryQueryKey(userId, trimmed),
    enabled: authReady && !!userId && !!trimmed && options?.enabled !== false,
    queryFn: () =>
      api.get<SpaceLibraryResponse>(`/api/spaces/${encodeURIComponent(trimmed!)}/library`),
    staleTime: 30_000,
    retry: false,
  });
}

type ChurchLibraryAction =
  | {
      kind: 'create';
      url: string;
      title?: string | null;
      description?: string | null;
      siteName?: string | null;
      image?: string | null;
      access?: LibraryItemAccess;
      scopes?: { scopeKind: 'org' | 'space'; spaceId?: string | null }[];
    }
  | {
      kind: 'update';
      id: string;
      title?: string;
      description?: string | null;
      access?: LibraryItemAccess;
      scopes?: { scopeKind: 'org' | 'space'; spaceId?: string | null }[];
    }
  | { kind: 'archive'; id: string };

/**
 * Curate the church catalog. Server-gated on `manage_library`.
 *
 * Invalidates all three library reads plus the personal one: an item's scope
 * decides which of them it appears in, so a scope edit can move a row between
 * caches that no single key covers.
 */
export function useChurchLibraryActions(orgId: string | null | undefined) {
  const queryClient = useQueryClient();
  const { userId } = useAuth();
  const trimmed = orgId?.trim() || null;

  return useMutation({
    mutationFn: (action: ChurchLibraryAction) => {
      const { kind, ...rest } = action;
      switch (kind) {
        case 'create':
          return api.post('/api/church/library/items/create', { orgId: trimmed, ...rest });
        case 'update':
          return api.post('/api/church/library/items/update', { orgId: trimmed, ...rest });
        case 'archive':
          return api.post('/api/church/library/items/archive', { orgId: trimmed, ...rest });
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: churchLibraryManageQueryKey(userId, trimmed) });
      void queryClient.invalidateQueries({ queryKey: churchLibraryUnionQueryKey(userId) });
      /* Space shelves and the personal list both render church rows. */
      void queryClient.invalidateQueries({ queryKey: ['library', 'space'] });
      void queryClient.invalidateQueries({ queryKey: LIBRARY_QUERY_KEY });
    },
  });
}

type SpaceLibraryAction =
  | {
      kind: 'create';
      url: string;
      title?: string | null;
      description?: string | null;
      siteName?: string | null;
      image?: string | null;
      access?: LibraryItemAccess;
    }
  | { kind: 'pin'; itemId: string; pinned: boolean; sortOrder?: number };

/**
 * Curate one room's shelf. Gated on `manage_library` **or** granted leadership
 * of this space — the volunteer lane.
 */
export function useSpaceLibraryActions(spaceId: string | null | undefined) {
  const queryClient = useQueryClient();
  const { userId } = useAuth();
  const trimmed = spaceId?.trim() || null;

  return useMutation({
    mutationFn: (action: SpaceLibraryAction) => {
      const { kind, ...rest } = action;
      const room = `/api/church/spaces/${encodeURIComponent(trimmed ?? '')}/library`;
      switch (kind) {
        case 'create':
          return api.post(`${room}/items/create`, rest);
        case 'pin':
          return api.post(`${room}/pins/set`, rest);
      }
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: spaceLibraryQueryKey(userId, trimmed) });
      void queryClient.invalidateQueries({ queryKey: churchLibraryUnionQueryKey(userId) });
      void queryClient.invalidateQueries({ queryKey: ['library', 'manage'] });
    },
  });
}
