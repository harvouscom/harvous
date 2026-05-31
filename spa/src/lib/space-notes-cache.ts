import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import { HARVOUS_SPACE_NOTES_CACHE_PREFIX } from '@/utils/user-cache-keys';
import type { SpaceNoteRow } from '../hooks/queries/useSpace';

export interface SpaceNotesPage {
  notes: SpaceNoteRow[];
  hasMore: boolean;
  offset: number;
  limit: number;
}

export function normalizeSpaceIdForCache(spaceId: string): string {
  const t = (spaceId ?? '').trim();
  return t.startsWith('space_') ? t : t ? `space_${t}` : '';
}

export function spaceNotesQueryKey(spaceId: string) {
  return ['space', normalizeSpaceIdForCache(spaceId), 'notes', 'no-legacy-scripture'] as const;
}

function patchSessionStorageFirstPage(spaceId: string, patch: (notes: SpaceNoteRow[]) => SpaceNoteRow[]) {
  const id = normalizeSpaceIdForCache(spaceId);
  if (!id) return;
  try {
    const raw = sessionStorage.getItem(`${HARVOUS_SPACE_NOTES_CACHE_PREFIX}${id}`);
    if (!raw) return;
    const page = JSON.parse(raw) as SpaceNotesPage;
    page.notes = patch(page.notes);
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
  const key = spaceNotesQueryKey(spaceId);
  queryClient.setQueryData<InfiniteData<SpaceNotesPage, number>>(key, (old) => {
    if (!old?.pages?.length) return old;
    return {
      ...old,
      pages: old.pages.map((page) => ({
        ...page,
        notes: page.notes.map(mapNote).filter((n): n is SpaceNoteRow => n != null),
      })),
    };
  });
  patchSessionStorageFirstPage(spaceId, (notes) =>
    notes.map(mapNote).filter((n): n is SpaceNoteRow => n != null),
  );
}

export function prependSpaceNoteToCache(queryClient: QueryClient, spaceId: string, note: SpaceNoteRow) {
  const key = spaceNotesQueryKey(spaceId);
  queryClient.setQueryData<InfiniteData<SpaceNotesPage, number>>(key, (old) => {
    if (!old?.pages?.length) {
      return {
        pages: [{ notes: [note], hasMore: false, offset: 0, limit: 20 }],
        pageParams: [0],
      };
    }
    const [first, ...rest] = old.pages;
    return {
      ...old,
      pages: [{ ...first, notes: [note, ...first.notes.filter((n) => n.id !== note.id)] }, ...rest],
    };
  });
  patchSessionStorageFirstPage(spaceId, (notes) => [note, ...notes.filter((n) => n.id !== note.id)]);
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
