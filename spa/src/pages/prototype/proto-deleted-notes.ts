/**
 * Note ids deleted in this browser session, so nothing can suggest one back.
 *
 * Invalidating the queries that name notes is the primary fix and is not, on its own,
 * enough. Home's readiness gate settles on *cached* data — `isQuerySettled` is
 * `!isPending || hasData` — so returning to Home paints the shelf from whatever the cache
 * still holds and only then swaps in the refetch. Two of those caches
 * (`note-connect-suggestions`, `note-crossref-gaps`) hold their answers for ten minutes, and
 * both answers are note titles. Without this set, the window between paint and refetch is
 * long enough to read.
 *
 * A deny-list rather than an allow-list, because there is no allow-list to be had: the
 * sidebar's `notes` array is paginated and filtered, so a note's absence from it means
 * "not loaded" at least as often as it means "gone".
 *
 * Deliberately a module-level Set rather than session or local storage. It has to outlive
 * exactly what it guards, which is in-memory query caches, and those are gone on reload
 * too — after a reload every query refetches from a server where the note is already hard
 * deleted, so stored ids would be state with no reader left. localStorage would be worse
 * still: it would outlive an undelete, and leak between accounts on a shared device.
 *
 * Not space-scoped, because note ids are not.
 */

const deletedNoteIdSet = new Set<string>();
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      /* a bad subscriber must not stop the others */
    }
  }
}

export function markNotesDeleted(ids: Iterable<string>): void {
  let changed = false;
  for (const id of ids) {
    if (typeof id === 'string' && id && !deletedNoteIdSet.has(id)) {
      deletedNoteIdSet.add(id);
      changed = true;
    }
  }
  if (changed) notify();
}

/**
 * Undo a mark. Both delete mutations record optimistically, before the server has agreed —
 * matching how they remove the row from the notes cache — so a failed delete has to put the
 * note back here as well as there, or it stays unsuggestable until the tab is reloaded.
 */
export function unmarkNotesDeleted(ids: Iterable<string>): void {
  let changed = false;
  for (const id of ids) {
    if (typeof id === 'string' && deletedNoteIdSet.delete(id)) changed = true;
  }
  if (changed) notify();
}

export function isNoteDeleted(id: string | null | undefined): boolean {
  return typeof id === 'string' && id.length > 0 && deletedNoteIdSet.has(id);
}

export function deletedNoteIds(): string[] {
  return [...deletedNoteIdSet];
}

/**
 * Re-render on change, mirroring `subscribeRecallCooldownChanged`.
 *
 * A component could instead read the set during render and rely on the delete having moved
 * some query it already watches. That mostly works and fails in the case worth guarding:
 * `useDeleteNote` skips every cache write when it cannot resolve a space id, so the delete
 * that most needs this set is the one that touches no query at all.
 */
export function subscribeDeletedNotes(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Test seam — the set is module state and would otherwise leak between cases. */
export function resetDeletedNotes(): void {
  deletedNoteIdSet.clear();
  notify();
}

/*
 * Every surface that deletes a note already announces it this way — the prototype's own
 * mutation, and the Classic action strip and menus. Listening once here means each of them
 * feeds the deny-list without being changed, and a surface added later gets it free.
 */
if (typeof window !== 'undefined') {
  window.addEventListener('noteDeleted', (event: Event) => {
    const noteId = (event as CustomEvent<{ noteId?: string }>).detail?.noteId;
    if (noteId) markNotesDeleted([noteId]);
  });
}
