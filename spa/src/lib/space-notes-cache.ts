import type { InfiniteData, QueryClient, QueryKey } from '@tanstack/react-query';
import { HARVOUS_SPACE_NOTES_CACHE_PREFIX } from '@/utils/user-cache-keys';
import type { NoteDetail } from '../hooks/queries/useNote';
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

/**
 * Prefix of the key `useSpaceNotes` registers — NOT the full key.
 *
 * The live query appends `unseenSince ?? ''`, so the real cache entry has six elements
 * and one space can have several entries at once. `setQueryData`/`getQueryData` match
 * exactly, so writing through this key alone reaches nothing; every helper below must
 * go through `spaceNotesCacheKeys()`, which prefix-matches via `getQueriesData`.
 */
export function spaceNotesQueryKey(spaceId: string) {
  return ['space', normalizeSpaceIdForCache(spaceId), 'notes', 'no-legacy-scripture', 'updated'] as const;
}

type SpaceNotesCacheEntry = [QueryKey, InfiniteData<SpaceNotesPage, number> | undefined];

/** Every live cache key for this space's note list, across `unseenSince` variants. */
function spaceNotesCacheKeys(queryClient: QueryClient, spaceId: string): QueryKey[] {
  return queryClient
    .getQueriesData<InfiniteData<SpaceNotesPage, number>>({ queryKey: spaceNotesQueryKey(spaceId) })
    .map(([key]) => key);
}

/** Snapshot every variant so an optimistic write can be rolled back on error. */
export function snapshotSpaceNotesCaches(
  queryClient: QueryClient,
  spaceId: string,
): SpaceNotesCacheEntry[] {
  return queryClient.getQueriesData<InfiniteData<SpaceNotesPage, number>>({
    queryKey: spaceNotesQueryKey(spaceId),
  });
}

/** Restore a {@link snapshotSpaceNotesCaches} result. */
export function restoreSpaceNotesCaches(
  queryClient: QueryClient,
  entries: SpaceNotesCacheEntry[] | undefined,
): void {
  for (const [key, data] of entries ?? []) {
    queryClient.setQueryData(key, data);
  }
}

function sessionStorageKey(spaceId: string): string {
  return `${HARVOUS_SPACE_NOTES_CACHE_PREFIX}${normalizeSpaceIdForCache(spaceId)}`;
}

function seedSessionStorageFirstPage(spaceId: string, page: SpaceNotesPage) {
  const id = normalizeSpaceIdForCache(spaceId);
  if (!id) return;
  try {
    const key = sessionStorageKey(id);
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, JSON.stringify(page));
  } catch {
    /* ignore */
  }
}

/**
 * Patch the sessionStorage snapshot once.
 *
 * `totalAdjustment: 'byLength'` derives the delta from this snapshot's own before/after
 * note count. That matters because the query cache can hold several key variants of the
 * same list: counting removals per variant and applying the sum here would decrement the
 * single stored snapshot once per variant.
 */
function patchSessionStorageFirstPage(
  spaceId: string,
  patchNotes: (notes: SpaceNoteRow[]) => SpaceNoteRow[],
  totalAdjustment: number | 'byLength' = 'byLength',
) {
  const id = normalizeSpaceIdForCache(spaceId);
  if (!id) return;
  try {
    const raw = sessionStorage.getItem(sessionStorageKey(id));
    if (!raw) return;
    const page = JSON.parse(raw) as SpaceNotesPage;
    const before = page.notes.length;
    page.notes = patchNotes(page.notes);
    const delta = totalAdjustment === 'byLength' ? page.notes.length - before : totalAdjustment;
    if (delta !== 0 && typeof page.total === 'number') {
      page.total = Math.max(0, page.total + delta);
    }
    sessionStorage.setItem(sessionStorageKey(id), JSON.stringify(page));
  } catch {
    /* ignore */
  }
}

function spaceNoteRowFromNoteDetail(detail: NoteDetail): SpaceNoteRow {
  return {
    id: detail.id,
    title: detail.title,
    content: detail.content,
    noteType: detail.noteType,
    simpleNoteId: detail.simpleNoteId ?? null,
    createdAt: detail.createdAt,
    updatedAt: detail.updatedAt,
    isPinned: false,
    contentEncrypted: detail.contentEncrypted,
    primaryCollection: detail.primaryCollection ?? null,
    secondaryCollections: detail.secondaryCollections,
    collectionPinned: detail.collectionPinned,
    collectionUserOverride: detail.collectionUserOverride,
    resourceTitle: detail.resourceTitle ?? null,
    version: detail.version,
    /**
     * Carry attribution through. `NoteDetail` already has these; dropping them here
     * produced list rows nobody could attribute, which the shared-space greeting then
     * reported as a note shared with "Someone".
     */
    isOwnNote: detail.isOwnNote,
    authorUserId: detail.authorUserId,
    authorDisplayName: detail.authorDisplayName,
  };
}

/** Scan space-notes caches, then note detail cache, for a list row shape. */
export function findSpaceNoteRowInCache(queryClient: QueryClient, noteId: string): SpaceNoteRow | null {
  const spaceNotesKeys = queryClient
    .getQueryCache()
    .findAll()
    .map((q) => q.queryKey)
    .filter(
      (key): key is readonly [string, string, string, ...unknown[]] =>
        Array.isArray(key) && key[0] === 'space' && key[2] === 'notes' && typeof key[1] === 'string',
    );

  for (const key of spaceNotesKeys) {
    const data = queryClient.getQueryData<InfiniteData<SpaceNotesPage, number>>(key);
    for (const page of data?.pages ?? []) {
      const hit = page.notes.find((n) => n.id === noteId);
      if (hit) return hit;
    }
  }

  const detail = queryClient.getQueryData<NoteDetail>(['note', noteId]);
  if (detail) return spaceNoteRowFromNoteDetail(detail);

  return null;
}

/** Build a target-space list row for a note copied from an existing cached source. */
export function spaceNoteRowFromCopy(source: SpaceNoteRow, newNoteId: string): SpaceNoteRow {
  const now = new Date().toISOString();
  return {
    id: newNoteId,
    title: source.title,
    content: source.content,
    noteType: source.noteType,
    createdAt: now,
    updatedAt: now,
    isPinned: false,
    isOwnNote: true,
    contentEncrypted: false,
    primaryCollection: null,
    secondaryCollections: [],
    collectionPinned: false,
    collectionUserOverride: false,
    resourceTitle: source.resourceTitle ?? null,
  };
}

/** Patch notes across all infinite-query pages, in every key variant (map: return null to remove). */
export function patchSpaceNotesInfiniteCache(
  queryClient: QueryClient,
  spaceId: string,
  mapNote: (note: SpaceNoteRow) => SpaceNoteRow | null,
) {
  for (const key of spaceNotesCacheKeys(queryClient, spaceId)) {
    queryClient.setQueryData<InfiniteData<SpaceNotesPage, number>>(key, (old) => {
      if (!old?.pages?.length) return old;
      // Counted per variant: each cache entry holds its own copy of the list, so a
      // shared counter would over-decrement `total` once per additional variant.
      let removedCount = 0;
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
  }
  patchSessionStorageFirstPage(spaceId, (notes) =>
    notes.map(mapNote).filter((n): n is SpaceNoteRow => n != null),
  );
}

export function prependSpaceNoteToCache(queryClient: QueryClient, spaceId: string, note: SpaceNoteRow) {
  let totalDelta: number | undefined;

  const prepend = (
    old: InfiniteData<SpaceNotesPage, number> | undefined,
  ): InfiniteData<SpaceNotesPage, number> => {
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
  };

  // `setQueriesData` can only touch entries that already exist. When nothing is
  // registered yet — a note created before the list has ever loaded — fall back to the
  // bare prefix key so the row is still cached and sessionStorage still gets seeded.
  const keys = spaceNotesCacheKeys(queryClient, spaceId);
  const targets: QueryKey[] = keys.length > 0 ? keys : [spaceNotesQueryKey(spaceId)];
  for (const key of targets) {
    queryClient.setQueryData<InfiniteData<SpaceNotesPage, number>>(key, prepend);
  }

  const id = normalizeSpaceIdForCache(spaceId);
  const firstPage = queryClient.getQueryData<InfiniteData<SpaceNotesPage, number>>(targets[0])?.pages[0];
  if (id && firstPage) {
    try {
      if (sessionStorage.getItem(sessionStorageKey(id))) {
        patchSessionStorageFirstPage(
          spaceId,
          (notes) => [note, ...notes.filter((n) => n.id !== note.id)],
          totalDelta ?? 0,
        );
      } else {
        seedSessionStorageFirstPage(spaceId, firstPage);
      }
    } catch {
      /* ignore */
    }
  }
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
