import { useEffect } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { navigationQueryKeyPrefix } from '../hooks/queries/useNavigation';
import { clearCachedNoteDetail, setCachedNoteDetail, type NoteDetail } from '../hooks/queries/useNote';
import { patchSpaceNotesInfiniteCache } from './space-notes-cache';

/**
 * Re-key every TanStack Query cache that holds a note under its optimistic offline id
 * (`local_*` / legacy `note_pending_*`) onto the server id the sync push just assigned.
 *
 * The prototype reads from the server via React Query, so when a note created/edited
 * offline is finally flushed, `sync-manager`'s `updateEntityId` swaps the IndexedDB id and
 * fires `harvous:entityIdReconciled`. Without this bridge the React Query caches would keep
 * pointing at the dead local id (stale detail page, duplicate list row).
 */
export function reconcileNoteId(queryClient: QueryClient, oldId: string, newId: string): void {
  if (!oldId || !newId || oldId === newId) return;

  // 1. Move the note-detail cache entry: ['note', oldId] → ['note', newId].
  const oldDetail = queryClient.getQueryData<NoteDetail>(['note', oldId]);
  if (oldDetail) {
    const movedDetail: NoteDetail = { ...oldDetail, id: newId };
    queryClient.setQueryData<NoteDetail>(['note', newId], movedDetail);
    setCachedNoteDetail(newId, movedDetail);
  }
  queryClient.removeQueries({ queryKey: ['note', oldId], exact: true });
  clearCachedNoteDetail(oldId);

  // Migrate the localStorage note→parent-thread hint so the new id resolves its thread.
  try {
    const parentThreadId = localStorage.getItem(`harvous-note-thread-${oldId}`);
    if (parentThreadId) {
      localStorage.setItem(`harvous-note-thread-${newId}`, parentThreadId);
      localStorage.removeItem(`harvous-note-thread-${oldId}`);
    }
  } catch {
    /* ignore */
  }

  // 2. Rewrite the note's id inside every space-notes infinite cache that holds it.
  //    The reconcile event carries no spaceId, so scan all space-notes query keys.
  const spaceNotesKeys = queryClient
    .getQueryCache()
    .findAll()
    .map((q) => q.queryKey)
    .filter((key): key is readonly [string, string, string, string] =>
      Array.isArray(key) && key[0] === 'space' && key[2] === 'notes' && typeof key[1] === 'string',
    );
  const seen = new Set<string>();
  for (const key of spaceNotesKeys) {
    const spaceId = key[1];
    if (seen.has(spaceId)) continue;
    seen.add(spaceId);
    patchSpaceNotesInfiniteCache(queryClient, spaceId, (note) =>
      note.id === oldId ? { ...note, id: newId } : note,
    );
  }

  // 3. Refetch the now-server-backed note so server-processed content (scripture pills,
  //    which are NOT generated while offline) replaces the raw offline body, and refresh
  //    navigation + per-space bootstrap caches that may still list the local id.
  queryClient.invalidateQueries({ queryKey: ['note', newId], exact: true });
  queryClient.invalidateQueries({ queryKey: [...navigationQueryKeyPrefix] });
  queryClient.invalidateQueries({
    predicate: (q) =>
      Array.isArray(q.queryKey) && q.queryKey[0] === 'space' && q.queryKey[2] === 'bootstrap',
  });
}

/**
 * Invisible component: listens for `harvous:entityIdReconciled` (fired by the offline sync
 * engine after a local→server id swap) and reconciles the React Query caches. Mount once at
 * the app root, inside the QueryClientProvider.
 */
export function SyncCacheBridge(): null {
  const queryClient = useQueryClient();

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail as
        | { oldId?: string; newId?: string; entityType?: string }
        | undefined;
      if (!detail?.oldId || !detail.newId) return;
      if (detail.entityType === 'note') {
        reconcileNoteId(queryClient, detail.oldId, detail.newId);
      }
    };
    window.addEventListener('harvous:entityIdReconciled', handler);
    return () => window.removeEventListener('harvous:entityIdReconciled', handler);
  }, [queryClient]);

  return null;
}
