import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import { HARVOUS_SPACE_NOTES_CACHE_PREFIX } from '@/utils/user-cache-keys';
import type { SpaceNoteRow } from '../hooks/queries/useSpace';

export interface SpaceNotesPage {
  notes: SpaceNoteRow[];
  hasMore: boolean;
  /** True space note count (first page only on this endpoint). Absent on member/cache-miss paths. */
  total?: number;
  offset: number;
  limit: number;
}

export function normalizeSpaceIdForCache(spaceId: string): string {
  const t = (spaceId ?? '').trim();
  return t.startsWith('space_') ? t : t ? `space_${t}` : '';
}

export function spaceNotesQueryKey(spaceId: string) {
  return ['space', normalizeSpaceIdForCache(spaceId), 'notes', 'no-legacy-scripture', 'updated'] as const;
}

function patchSessionStorageFirstPage(
  spaceId: string,
  patchNotes: (notes: SpaceNoteRow[]) => SpaceNoteRow[],
  totalDelta?: number,
) {
  const id = normalizeSpaceIdForCache(spaceId);
  if (!id) return;
  try {
    const raw = sessionStorage.getItem(`${HARVOUS_SPACE_NOTES_CACHE_PREFIX}${id}`);
    if (!raw) return;
    const page = JSON.parse(raw) as SpaceNotesPage;
    page.notes = patchNotes(page.notes);
    if (totalDelta !== undefined && typeof page.total === 'number') {
      page.total = Math.max(0, page.total + totalDelta);
    }
    sessionStorage.setItem(`${HARVOUS_SPACE_NOTES_CACHE_PREFIX}${id}`, JSON.stringify(page));
  } catch {
    /* ignore */
  }
}

/** Patch notes across all infinite-query pages (map: return null to remove). */
export function patchSpaceNotesInfiniteCache(
  queryClient: QueryClient,
  spaceId: string,
  mapNote: (note: SpaceNoteRow) => SpaceNoteRow | null,
) {
  let removedCount = 0;
  const key = spaceNotesQueryKey(spaceId);
  queryClient.setQueryData<InfiniteData<SpaceNotesPage, number>>(key, (old) => {
    if (!old?.pages?.length) return old;
    const pages = old.pages.map((page) => {
      const before = page.notes.length;
      const notes = page.notes.map(mapNote).filter((n): n is SpaceNoteRow => n != null);
      removedCount += before - notes.length;
      return { ...page, notes };
    });
    if (removedCount > 0 && typeof pages[0]?.total === 'number') {
      pages[0] = { ...pages[0], total: Math.max(0, pages[0].total! - removedCount) };
    }
    return { ...old, pages };
  });
  patchSessionStorageFirstPage(
    spaceId,
    (notes) => notes.map(mapNote).filter((n): n is SpaceNoteRow => n != null),
    removedCount > 0 ? -removedCount : undefined,
  );
}

export function prependSpaceNoteToCache(queryClient: QueryClient, spaceId: string, note: SpaceNoteRow) {
  let totalDelta: number | undefined;
  const key = spaceNotesQueryKey(spaceId);
  queryClient.setQueryData<InfiniteData<SpaceNotesPage, number>>(key, (old) => {
    if (!old?.pages?.length) {
      totalDelta = 1;
      return {
        pages: [{ notes: [note], hasMore: false, offset: 0, limit: 20, total: 1 }],
        pageParams: [0],
      };
    }
    const [first, ...rest] = old.pages;
    const filtered = first.notes.filter((n) => n.id !== note.id);
    const isNew = filtered.length === first.notes.length;
    if (isNew && typeof first.total === 'number') totalDelta = 1;
    return {
      ...old,
      pages: [
        {
          ...first,
          notes: [note, ...filtered],
          total: isNew && typeof first.total === 'number' ? first.total + 1 : first.total,
        },
        ...rest,
      ],
    };
  });
  patchSessionStorageFirstPage(
    spaceId,
    (notes) => [note, ...notes.filter((n) => n.id !== note.id)],
    totalDelta,
  );
}

export function removeSpaceNoteFromCache(queryClient: QueryClient, spaceId: string, noteId: string) {
  patchSpaceNotesInfiniteCache(queryClient, spaceId, (n) => (n.id === noteId ? null : n));
}

export function updateSpaceNoteInCache(
  queryClient: QueryClient,
  spaceId: string,
  noteId: string,
  patch: Partial<SpaceNoteRow>,
) {
  patchSpaceNotesInfiniteCache(queryClient, spaceId, (n) => (n.id === noteId ? { ...n, ...patch } : n));
}
