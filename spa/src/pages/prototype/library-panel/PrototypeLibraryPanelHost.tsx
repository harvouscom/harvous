/**
 * Mounts the Library panel into the shell.
 *
 * Thin on purpose: it owns the shell wiring (which view, which presentation, how to
 * close) so the panel chrome stays a presentational component and the body views stay
 * ignorant of how they were summoned.
 *
 * It also owns the query, which is the one piece of the panel's state that is not in
 * shell context — see `use-library-panel-search` for why it must not be. Owning it here
 * rather than inside the panel is what lets the field live in the header and the results
 * in the body without those two components knowing about each other.
 */
import PrototypeSearchInput from '../components/PrototypeSearchInput';
import { useProtoShell } from '../../../layouts/proto-shell-context';
import PrototypeLibraryPanel from './PrototypeLibraryPanel';
import PrototypeLibraryBody from './PrototypeLibraryBody';
import PrototypeLibraryTabs from './PrototypeLibraryTabs';
import PrototypeLibrarySearchResults, {
  type LibraryNavigationItem,
} from './PrototypeLibrarySearchResults';
import { useLibraryPanelSearch } from './use-library-panel-search';
import { useLibraryPanelData } from './library-panel-data';
import { useLibrarySelection } from './use-library-selection';
import { useLibraryTabRows } from './use-library-tab-rows';
import PrototypeLibraryBulkBar from './PrototypeLibraryBulkBar';
import PrototypeLibraryCreateFooter from './PrototypeLibraryCreateFooter';
import PrototypeLibrarySelectToggle from './PrototypeLibrarySelectToggle';

export default function PrototypeLibraryPanelHost({
  /** "Go to" destinations for the results. Optional: the panel is useful without them. */
  navigationItems,
}: {
  navigationItems?: readonly LibraryNavigationItem[];
} = {}) {
  const {
    libraryPanelView,
    libraryPanelExiting,
    setLibraryPanelView,
    closeLibraryPanel,
    isMobileSidebar,
  } = useProtoShell();

  /* During the exit morph the view is still set; this only covers the frame after the
     timer clears it, by which point the host is unmounted anyway. */
  const view = libraryPanelView ?? { tab: 'all' as const, drill: null };

  const search = useLibraryPanelSearch(view.querySeed);
  /*
   * The settled value decides which body is up, so the swap happens once rather than on
   * every keystroke. It is not symmetrical, and that is the point: `useDebouncedSearchState`
   * clears the settled value the instant the field empties, so browsing comes back the
   * moment you delete the last character while results wait the 300ms to arrive. A seed
   * skips the wait entirely — nobody typed it, so there is nothing to settle.
   */
  const query = search.debounced;

  /*
   * Selection lives here rather than in the list that draws the checkboxes, because three
   * things need the same answer — the rows, the bar under them, and the header's toggle —
   * and a second instance of the hook would publish a second command context.
   */
  const data = useLibraryPanelData();
  const tabRows = useLibraryTabRows(view.tab);
  const selection = useLibrarySelection({
    tab: view.tab,
    rows: tabRows,
    isScopedSharedSpace: data.isScopedSharedSpace,
    viewerIsSpaceOwner: data.viewerIsSpaceOwner,
  });

  return (
    <PrototypeLibraryPanel
      view={view}
      exiting={libraryPanelExiting}
      isMobile={isMobileSidebar}
      onClose={() => closeLibraryPanel()}
      /* Back goes to the tab you drilled from, not to a global root — that tab is where
         you actually came from. */
      onBackToRoot={() => setLibraryPanelView({ tab: view.tab, drill: null })}
      search={
        <PrototypeSearchInput
          id="proto-library-search-input"
          /*
           * The field takes focus as the panel opens, so ⇧K and ⇧/ land ready to type and
           * the chip — which now says "Search" — does what it advertises. Declarative
           * rather than a `querySelector` after a frame: the panel is a lazy chunk, and on
           * the first open of a session that element does not exist yet when the frame
           * fires, so the one-shot focus silently found nothing.
           *
           * Desktop only. On a phone this is a bottom sheet, and stealing focus there
           * raises the keyboard over the very list you opened it to browse.
           */
          autoFocus={!isMobileSidebar}
          value={search.input}
          onChange={search.setInput}
          onClear={search.clear}
          placeholder="Search my Harvous…"
          ariaLabel="Search my Harvous"
          /*
           * Escape empties the field before it closes the panel — one key, two steps, in
           * the order that loses the least. The panel's own document listener bails on
           * `defaultPrevented` (see `PrototypeLibraryPanel`), and React's root handler runs
           * before that listener, so preventing here is all it takes: no coordination, no
           * shared flag, and the chrome stays untouched.
           */
          onKeyDown={(event) => {
            if (event.key !== 'Escape') return;
            if (!search.input.trim()) return;
            event.preventDefault();
            search.clear();
          }}
        />
      }
      tabs={
        <>
          <PrototypeLibrarySelectToggle selection={selection} />
          <PrototypeLibraryTabs
            tab={view.tab}
            /* Switching tab clears the drill: the row you tapped names a kind, not a place
               inside the one you were already in. */
            onSelect={(tab) => setLibraryPanelView({ tab, drill: null })}
          />
        </>
      }
      /* One corner, two jobs, never both: while a selection stands it says what can be done
         with it, and otherwise it offers to start another one of whatever the tab lists. */
      bulkBar={
        selection.active && selection.selectedIds.length > 0 ? (
          <PrototypeLibraryBulkBar selection={selection} />
        ) : view.drill ? null : (
          <PrototypeLibraryCreateFooter tab={view.tab} searching={Boolean(query.trim())} />
        )
      }
    >
      {query.trim() ? (
        <PrototypeLibrarySearchResults
          query={query}
          tab={view.tab}
          navigationItems={navigationItems}
        />
      ) : (
        <PrototypeLibraryBody view={view} selection={selection} />
      )}
    </PrototypeLibraryPanel>
  );
}
