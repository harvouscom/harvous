/**
 * The selectable ids on whichever tab is showing.
 *
 * The selection lives in the panel host so there is exactly one of it, but the host does not
 * otherwise know what a tab is listing — each view fetches its own. Rather than have the
 * views report upward (an effect, and a frame where the bar knows a different list from the
 * rows under it), this asks the same queries they do. React Query dedupes by key, so the
 * cost is a cache read rather than four more requests.
 *
 * Only the kinds that can be selected in. Everything and Scripture return nothing, which is
 * the same answer `librarySelectionKindForTab` gives from the other direction.
 */
import { useMemo } from 'react';
import { buildFoldersFromNotes, mergeFoldersWithRegistry } from '../sidebar-universal-search';
import { usePrototypeFolderRegistry } from '../../../hooks/mutations/usePrototypeFolderRegistry';
import { usePrototypeStudyThreads } from '../../../hooks/queries/usePrototypeStudyThreads';
import { usePrototypeSpaceStudyThreadHighlights } from '../../../hooks/queries/usePrototypeSpaceStudyThreadHighlights';
import { useLibraryPanelData } from './library-panel-data';
import type { LibraryTab } from '../sidebar-search-types';

/** Notes carry their own capability input; the other kinds are the reader's own by nature. */
export type SelectableRow = { id: string; isOwnNote: boolean };

export function useLibraryTabRows(tab: LibraryTab): SelectableRow[] {
  const data = useLibraryPanelData();
  const folderRegistryQuery = usePrototypeFolderRegistry(
    tab === 'folders' ? data.spaceId ?? undefined : undefined,
  );
  const threadsQuery = usePrototypeStudyThreads(
    tab === 'threads' && !data.isScopedSharedSpace ? data.spaceId ?? undefined : undefined,
  );
  const highlightsQuery = usePrototypeSpaceStudyThreadHighlights(
    tab === 'highlights' ? data.spaceId ?? undefined : undefined,
  );

  return useMemo(() => {
    switch (tab) {
      case 'notes':
        return data.notes.map((n) => ({ id: n.id, isOwnNote: n.isOwnNote !== false }));
      case 'folders':
        /* Keyed by *name*, which is what identifies a folder everywhere else — the pin store
           derives its row id from it and `useRemoveFolder` takes it directly. "Unsorted" has
           no name and is not a thing you can act on, so it never carries a checkbox. */
        return mergeFoldersWithRegistry(
          buildFoldersFromNotes(data.notes),
          folderRegistryQuery.data ?? [],
        )
          .filter((f) => Boolean(f.name))
          .map((f) => ({ id: f.name as string, isOwnNote: true }));
      case 'threads':
        return (threadsQuery.data ?? []).map((c) => ({ id: c.id, isOwnNote: true }));
      case 'highlights':
        return (highlightsQuery.data ?? []).map((h) => ({
          id: h.id,
          isOwnNote: h.isOwnHighlight !== false,
        }));
      default:
        return [];
    }
  }, [tab, data.notes, folderRegistryQuery.data, threadsQuery.data, highlightsQuery.data]);
}
