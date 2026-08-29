/**
 * The Folders tab — the one grouping the reader made on purpose.
 *
 * The grid the browse home used to lead with, now a tab of its own. Cards only open; the
 * pin and delete a folder card can carry belong to the sidebar, which still owns those
 * mutations behind ⇧S.
 */
import { useMemo } from 'react';
import PrototypeListEmptyState from '../PrototypeListEmptyState';
import { ProtoNotesListLoading, PrototypeSidebarFolderCard } from '../sidebar-rows';
import { buildFoldersFromNotes, mergeFoldersWithRegistry } from '../sidebar-universal-search';
import { useProtoShell } from '../../../layouts/proto-shell-context';
import { usePrototypeFolderRegistry } from '../../../hooks/mutations/usePrototypeFolderRegistry';
import { useLibraryPanelData } from './library-panel-data';

export default function PrototypeLibraryFoldersView() {
  const data = useLibraryPanelData();
  const { setLibraryPanelView } = useProtoShell();
  const folderRegistryQuery = usePrototypeFolderRegistry(data.spaceId ?? undefined);

  /* Registry-merged, so a folder made and not yet filled still has a card — otherwise
     creating one appears to do nothing until the first note lands in it. */
  const folders = useMemo(
    () => mergeFoldersWithRegistry(buildFoldersFromNotes(data.notes), folderRegistryQuery.data ?? []),
    [data.notes, folderRegistryQuery.data],
  );

  /* Folders are derived from the note list, so an unloaded list is an unloaded grid. */
  if (data.notesPhase === 'loading') return <ProtoNotesListLoading />;

  if (folders.length === 0) {
    return (
      <PrototypeListEmptyState
        iconName="folder"
        title="No folders"
        description="Put a note in a folder and it will show up here."
      />
    );
  }

  return (
    <div className="proto-library-root">
      <ul className="proto-collection-grid">
        {folders.map((folder) => (
          <PrototypeSidebarFolderCard
            key={folder.name ?? '__unsorted__'}
            folder={folder}
            /* Pins and folder deletion are the sidebar's; here a card only opens. */
            isPinned={false}
            showMenu={false}
            selectable={false}
            onOpen={() =>
              setLibraryPanelView({
                tab: 'folders',
                drill: { kind: 'folder', folderKey: folder.name },
              })
            }
            onTogglePin={() => {}}
            onDelete={() => {}}
            isDeleting={false}
          />
        ))}
      </ul>
    </div>
  );
}
