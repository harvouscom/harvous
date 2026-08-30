/**
 * One folder's notes, at panel width.
 *
 * `folderKey: null` is the Unsorted bucket rather than "no folder selected" — the same
 * meaning `SidebarFolderDrilldown` gives it, and a real place with real contents.
 * Membership goes through `noteBelongsToFolderBucket` rather than a string compare so
 * labels differing only by curly apostrophe, case or spacing land in one bucket, exactly
 * as `buildFoldersFromNotes` counted them.
 */
import type { LibrarySelection } from './use-library-selection';
import { useMemo } from 'react';
import { countNotesInFolderBucket, noteBelongsToFolderBucket } from '@/utils/note-folder-display';
import PrototypeListEmptyState from '../PrototypeListEmptyState';
import { ProtoNotesListLoading } from '../sidebar-rows';
import { LibraryLoadMore, LibraryNoteList } from './library-panel-lists';
import { useLibraryPanelData } from './library-panel-data';

export default function PrototypeLibraryFolderView({
  folderKey,
  selection,
}: {
  folderKey: string | null;
  /**
   * Absent until now: drills rendered their lists with no selection at all, so a folder
   * opened was browse-only however you arrived. The rows here are notes, and filing several
   * at once is the main thing anyone opens Unsorted to do.
   */
  selection?: LibrarySelection;
}) {
  const data = useLibraryPanelData();

  const rows = useMemo(
    () => data.notes.filter((note) => noteBelongsToFolderBucket(note, folderKey)),
    [data.notes, folderKey],
  );

  if (data.notesPhase === 'error') {
    return (
      <PrototypeListEmptyState
        iconName="note-sticky"
        title="Could not load notes"
        description="This folder's notes did not load. Try again in a moment."
      />
    );
  }
  if (data.notesPhase === 'loading') return <ProtoNotesListLoading />;

  if (rows.length === 0) {
    /* A named folder with nothing loaded may still have members on a later page —
       `countNotesInFolderBucket` counts what is loaded, so say "none loaded yet"
       honestly by leaving the pager in place below rather than claiming empty. */
    const loadedCount = countNotesInFolderBucket(data.notes, folderKey);
    return (
      <>
        <PrototypeListEmptyState
          iconName={folderKey === null ? 'note-sticky' : 'folder'}
          title={folderKey === null ? 'Nothing unsorted' : 'No notes here'}
          description={
            folderKey === null
              ? 'Notes without a folder show up here.'
              : loadedCount === 0 && data.hasMoreNotes
                ? 'Nothing from this folder has loaded yet.'
                : 'Add notes to this folder and they will appear here.'
          }
        />
        <LibraryLoadMore data={data} />
      </>
    );
  }

  return (
    <>
      <LibraryNoteList
        rows={rows}
        data={data}
        selection={selection}
        /* Unsorted is a bucket, not a folder — there is nothing to be removed from. */
        folderRemoval={folderKey === null ? undefined : { folderName: folderKey }}
      />
      <LibraryLoadMore data={data} />
    </>
  );
}
