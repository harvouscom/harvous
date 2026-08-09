import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@clerk/clerk-react';
import { api } from '../../lib/api';
import { useAuthReady } from '../useAuthReady';

/**
 * What one room studies from — the space's own shelf.
 *
 * Membership-gated on the server, not staff-gated: a congregant member is the
 * majority of readers here, which is exactly why the space dashboard can offer
 * this to everyone in the room rather than only to whoever curates it.
 *
 * Two lanes answer here and the client cannot tell them apart, deliberately. A
 * church room's shelf is the church's items scoped to it; a Shared Space with
 * no church behind it owns its shelf outright. Same rows, same shape, same
 * ordering — the difference is who may write, which is `canManage`.
 *
 * A personal space still answers empty rather than erroring: the caller asked a
 * reasonable question and the honest answer is "nothing here".
 */
export type SpaceLibraryItem = {
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
  access: string;
  /** True when this room scoped the item itself, rather than inheriting it. */
  ownedByThisSpace: boolean;
  /** Pinned items lead the shelf; the rest follow by recency. */
  pinned: boolean;
  sortOrder: number;
  createdAt: string | null;
  updatedAt: string | null;
};

export type SpaceLibraryResponse = {
  space: { id: string; title: string };
  items: SpaceLibraryItem[];
  /**
   * Whether this viewer curates the room's shelf.
   *
   * The server's own write gate answers, rather than the client re-deriving it:
   * granted leadership and church capabilities are both invisible from here,
   * and a second opinion about permission is a second thing to get wrong.
   */
  canManage: boolean;
};

export function spaceLibraryQueryKey(
  userId: string | null | undefined,
  spaceId: string | null | undefined,
) {
  return ['space-library', userId ?? 'none', spaceId ?? 'none'] as const;
}

/** "3 pinned · 8 on the shelf", or just the count when nothing is pinned. */
export function spaceLibraryMeta(items: SpaceLibraryItem[]): string {
  if (items.length === 0) return 'Nothing on the shelf yet';
  const pinned = items.filter((item) => item.pinned).length;
  const total = items.length === 1 ? '1 resource' : `${items.length} resources`;
  return pinned > 0 ? `${pinned} pinned · ${total}` : total;
}

export type SpaceLibraryAction =
  | { kind: 'link'; url: string; title?: string; description?: string }
  | { kind: 'upload'; file: File; title?: string; description?: string }
  | { kind: 'pin'; itemId: string; pinned: boolean; sortOrder?: number };

/**
 * Stocking one room's shelf.
 *
 * One mutation for all three writes because they invalidate the same shelf and
 * a caller choosing between three hooks would have to know which lane the room
 * is in — the thing the server exists to hide.
 */
export function useSpaceLibraryActions(spaceId: string | null | undefined) {
  const { userId } = useAuth();
  const queryClient = useQueryClient();
  const trimmed = spaceId?.trim() || null;

  return useMutation({
    mutationFn: async (action: SpaceLibraryAction) => {
      if (!trimmed) throw new Error('No space');
      const base = `/api/church/spaces/${encodeURIComponent(trimmed)}/library`;

      if (action.kind === 'pin') {
        return api.post<{ success: boolean }>(`${base}/pins/set`, {
          itemId: action.itemId,
          pinned: action.pinned,
          sortOrder: action.sortOrder ?? 0,
        });
      }

      if (action.kind === 'upload') {
        const form = new FormData();
        form.append('file', action.file);
        if (action.title) form.append('title', action.title);
        if (action.description) form.append('description', action.description);
        return api.post<{ success: boolean; item: SpaceLibraryItem }>(
          `${base}/items/upload`,
          form,
        );
      }

      return api.post<{ success: boolean; item: SpaceLibraryItem }>(`${base}/items/create`, {
        url: action.url,
        title: action.title,
        description: action.description,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: spaceLibraryQueryKey(userId, trimmed) });
    },
  });
}

export function useSpaceLibrary(spaceId: string | null | undefined, options?: { enabled?: boolean }) {
  const { userId } = useAuth();
  const authReady = useAuthReady();
  const trimmed = spaceId?.trim() || null;

  return useQuery({
    queryKey: spaceLibraryQueryKey(userId, trimmed),
    enabled: authReady && !!userId && !!trimmed && options?.enabled !== false,
    queryFn: () =>
      api.get<SpaceLibraryResponse>(`/api/spaces/${encodeURIComponent(trimmed!)}/library`),
    staleTime: 60_000,
    retry: false,
  });
}
