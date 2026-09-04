/**
 * The selectable ids on whichever tab is showing.
 *
 * The selection lives in the panel host so there is exactly one of it, but the host does not
 * otherwise know what a tab is listing — each view fetches its own. Rather than have the
 * views report upward (an effect, and a frame where the bar knows a different list from the
 * rows under it), this asks the same queries they do. React Query dedupes by key, so the
 * cost is a cache read rather than four more requests.
 *
 * Only the kinds that can be selected in. Scripture and resources return nothing, which is the
 * same answer `librarySelectionKindForTab` gives from the other direction. Everything returns
 * every corpus at once, under composite ids — it is one selection that can hold several kinds,
 * not an absence of one.
 */
import { packMixedId } from './use-library-selection';
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
  /* "Everything" can select any of them, so it needs every corpus rather than one. */
  const wantsAll = tab === 'all';
  const folderRegistryQuery = usePrototypeFolderRegistry(
    tab === 'folders' || wantsAll ? data.spaceId ?? undefined : undefined,
  );
  const threadsQuery = usePrototypeStudyThreads(
    (tab === 'threads' || wantsAll) && !data.isScopedSharedSpace
      ? data.spaceId ?? undefined
      : undefined,
  );
  const highlightsQuery = usePrototypeSpaceStudyThreadHighlights(
    tab === 'highlights' || wantsAll ? data.spaceId ?? undefined : undefined,
  );

  return useMemo(() => {
    const folderRows = () =>
      mergeFoldersWithRegistry(buildFoldersFromNotes(data.notes), folderRegistryQuery.data ?? [])
        .filter((f) => Boolean(f.name))
        .map((f) => ({ id: f.name as string, isOwnNote: true }));

    switch (tab) {
      /*
       * Composite ids, because one selection here can hold several kinds and a bare id could
       * not say which. `packMixedId` is the same `${kind}:${sourceId}` shape the rows already
       * key on, so a row and its selection entry agree without a second mapping.
       *
       * Scripture and resources are absent deliberately: a book is a place rather than a thing
       * any of the six verbs act on, and resources are a personal shelf with no bulk verbs.
       */
      case 'all':
        return [
          ...data.notes.map((n) => ({
            id: packMixedId('note', n.id),
            isOwnNote: n.isOwnNote !== false,
          })),
          ...folderRows().map((f) => ({ id: packMixedId('folder', f.id), isOwnNote: true })),
          ...(threadsQuery.data ?? []).map((c) => ({
            id: packMixedId('thread', c.id),
            isOwnNote: true,
          })),
          ...(highlightsQuery.data ?? []).map((h) => ({
            id: packMixedId('highlight', h.id),
            isOwnNote: h.isOwnHighlight !== false,
          })),
        ];
      case 'notes':
        return data.notes.map((n) => ({ id: n.id, isOwnNote: n.isOwnNote !== false }));
      case 'folders':
        /* Keyed by *name*, which is what identifies a folder everywhere else — the pin store
           derives its row id from it and `useRemoveFolder` takes it directly. "Unsorted" has
           no name and is not a thing you can act on, so it never carries a checkbox. */
        return folderRows();
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
