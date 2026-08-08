import { useQuery } from '@tanstack/react-query';
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
 * Returns an empty shelf for a personal or non-church space rather than an
 * error — the caller asked a reasonable question and the honest answer is
 * "nothing here".
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
