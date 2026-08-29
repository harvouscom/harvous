/**
 * "New note", "New folder", "New Thread" — starting one of the things a tab lists.
 *
 * The panel could find and file, and not begin. Every list the sidebar shows has carried a
 * create footer for as long as it has had lists; the panel showing the same lists without
 * one meant browsing to the end of your folders to discover there was no way to add another.
 *
 * Pinned under the body rather than in flow after the list, which is where the sidebar puts
 * it. The rail is short enough that scrolling to the end is nothing; a panel listing
 * twenty-seven notes is not, and a create button you have to reach the bottom to find is a
 * create button most people never see. It shares that slot with the bulk bar, which is
 * exactly right — while a selection stands, *acting on those* is what the corner is for, and
 * "New folder" is not what you are doing.
 *
 * Only the three tabs whose things are made by hand. Highlights come from reading, scripture
 * from the canon, resources from a file — none of them start with a button here.
 */
import { useProtoShell } from '../../../layouts/proto-shell-context';
import { useOrganizeApi } from '../../../lib/prototype-organize-runner-store';
import type { LibraryTab } from '../sidebar-search-types';

export default function PrototypeLibraryCreateFooter({
  tab,
  /** Hidden while searching: results are a different list, and its footer would offer to
      make a folder in a place you are only passing through. */
  searching,
}: {
  tab: LibraryTab;
  searching: boolean;
}) {
  const organize = useOrganizeApi();
  const { closeLibraryPanel } = useProtoShell();
  if (searching || !organize) return null;

  /*
   * Notes go through the shell event rather than composing here, so one owner decides which
   * space a new note lands in — the same reason the sidebar's own footer dispatches it. The
   * panel closes behind it because the note opens in the main pane the panel is covering.
   */
  if (tab === 'notes') {
    return (
      <Footer
        label="New note"
        onClick={() => {
          closeLibraryPanel({ preserveHistory: true });
          window.dispatchEvent(new Event('prototypeShortcutNewNote'));
        }}
      />
    );
  }

  /* A shared space can say no — see `canCreateCollections`. Offering a button the sheet
     would refuse is worse than offering nothing. */
  if (!organize.canCreateCollections) return null;

  if (tab === 'folders') {
    return <Footer label="New folder" onClick={() => organize.openCreateFolder()} />;
  }
  if (tab === 'threads') {
    return <Footer label="New Thread" onClick={() => organize.openCreateThread()} />;
  }
  return null;
}

/** The sidebar's own footer chrome, so the two surfaces offer one control. */
function Footer({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <div className="proto-collection-grid-actions">
      <button type="button" className="proto-collection-grid-actions__btn" onClick={onClick}>
        {label}
      </button>
    </div>
  );
}
