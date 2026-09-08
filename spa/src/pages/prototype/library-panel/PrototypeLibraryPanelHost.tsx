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
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Icon from '@/components/react/Icon';
import PrototypeLibraryRecentSearches, {
  useRecentSearchTerms,
} from './PrototypeLibraryRecentSearches';
import { removeRecentSearchTerm } from '@/utils/recent-search-storage';
import ProtoPopoverShell from '../ProtoPopoverShell';
import { useProtoAnchoredPopoverPosition } from '../useProtoAnchoredPopoverPosition';
import { useDismissOnOutside } from '../../../hooks/usePopoverDismiss';
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
import { useLibrarySearchHistory } from './use-library-search-history';
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

  /*
   * Remembering what was searched for.
   *
   * Scoped to the space when one is open, so a question asked inside somebody else's room
   * does not surface in your own list later. The scope type already carried a `space`
   * member for exactly this — see `RecentSearchStorageScope`.
   */
  const recentSearchScope = data.isScopedSharedSpace && data.spaceId
    ? ({ type: 'space', id: data.spaceId } as const)
    : null;
  const searchHistory = useLibrarySearchHistory({
    scope: recentSearchScope,
    live: search.input,
    settled: query,
  });

  /*
   * Past queries, on request.
   *
   * This was a latch on focus that swapped the browse body for a history panel. Focus is not
   * a request to stop looking at the library — it is the first half of typing — so the swap
   * arrived before anyone had asked for it and took the list away in the process. Now it is
   * a control with a state, opened deliberately and closed the same way.
   *
   * Absent entirely until something is remembered, rather than a button that opens on
   * nothing: a new account gets the library, not an empty promise about its own past.
   */
  const recentTerms = useRecentSearchTerms();
  const [recentsOpen, setRecentsOpen] = useState(false);
  const recentsButtonRef = useRef<HTMLButtonElement | null>(null);
  const recentsCardRef = useRef<HTMLDivElement | null>(null);
  const { position: recentsPosition, sync: syncRecentsPosition } = useProtoAnchoredPopoverPosition(
    recentsCardRef,
    { anchorEl: recentsButtonRef.current },
    /* Right edge to the button's, so a card wider than its trigger hangs back under the
       header rather than off toward the panel's edge. */
    { enabled: recentsOpen, alignEnd: true },
    [recentsOpen],
  );
  useDismissOnOutside(recentsCardRef, () => setRecentsOpen(false), recentsOpen, {
    ignoreSelector: '[aria-label="Recent searches"]',
  });
  /* Measure again once the card has its width — end-alignment is `anchor.right - cardWidth`,
     so a first pass taken before layout settles lands it short. */
  /*
   * Forgetting the last remembered term takes the toggle away with it, and a popover
   * anchored to a button that no longer exists is a card floating beside nothing. So the
   * emptied list closes itself.
   */
  useEffect(() => {
    if (recentsOpen && recentTerms.length === 0) setRecentsOpen(false);
  }, [recentsOpen, recentTerms.length]);

  useEffect(() => {
    if (!recentsOpen) return undefined;
    const raf = requestAnimationFrame(() => syncRecentsPosition());
    return () => cancelAnimationFrame(raf);
  }, [recentsOpen, syncRecentsPosition]);

  const tabRows = useLibraryTabRows(view.tab);
  const selection = useLibrarySelection({
    tab: view.tab,
    /* Drilled or not changes what the rows are — a folder opened lists notes, not folders. */
    drill: view.drill,
    rows: tabRows,
    isScopedSharedSpace: data.isScopedSharedSpace,
    viewerIsSpaceOwner: data.viewerIsSpaceOwner,
  });

  /*
   * Honour a view that asked to arrive selecting.
   *
   * Once per view rather than on every render: the reader must be able to press Done and stay
   * put, and a plain effect on `selectOnOpen` would put them straight back into select mode on
   * the next render. Keyed on the drill so re-opening the same destination later starts fresh.
   */
  const selectArmedFor = useRef<string | null>(null);
  const selectOnOpenKey = view.selectOnOpen
    ? `${view.tab}:${view.drill ? JSON.stringify(view.drill) : ''}`
    : null;
  useEffect(() => {
    if (!selectOnOpenKey || !selection.available) return;
    if (selectArmedFor.current === selectOnOpenKey) return;
    selectArmedFor.current = selectOnOpenKey;
    selection.setActive(true);
  }, [selectOnOpenKey, selection]);

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
           * The field takes focus as the panel opens, so ⇧K lands ready to type and
           * the chip — which now says "Search" — does what it advertises. Declarative
           * rather than a `querySelector` after a frame: the panel is a lazy chunk, and on
           * the first open of a session that element does not exist yet when the frame
           * fires, so the one-shot focus silently found nothing.
           *
           * Desktop only. On a phone this is a bottom sheet, and stealing focus there
           * raises the keyboard over the very list you opened it to browse.
           */
          /* Only when the opener asked — see `autoFocusSearch`. Mobile never takes it:
             a caret there raises the on-screen keyboard over the results. */
          autoFocus={!isMobileSidebar && Boolean(view.autoFocusSearch)}
          value={search.input}
          onChange={search.setInput}
          onClear={search.clear}
          /* Inside the field, at its trailing edge — it fills this box and has nothing to do
             with the kind picker beside it. Absent until something is remembered. */
          trailing={
            recentTerms.length > 0 ? (
              <button
                type="button"
                ref={recentsButtonRef}
                className="proto-library-recents__toggle"
                aria-label="Recent searches"
                title="Recent searches"
                aria-haspopup="dialog"
                aria-expanded={recentsOpen}
                onClick={() => setRecentsOpen((v) => !v)}
              >
                <Icon name="clock-rotate-left" size={14} aria-hidden />
              </button>
            ) : null
          }
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
          <PrototypeLibraryTabs
            tab={view.tab}
            /* Switching tab clears the drill: the row you tapped names a kind, not a place
               inside the one you were already in. */
            onSelect={(tab) => setLibraryPanelView({ tab, drill: null })}
            selection={selection}
          />
        </>
      }
      selectBar={<PrototypeLibrarySelectToggle selection={selection} />}
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
      {/*
        Two states, not three. The library is up until you have typed something, and then it
        is results — focusing the field is no longer a third thing that takes the list away
        before a character has been entered. Past queries are in the header now, behind a
        control, and "Pick up where you left off" is gone with them: the browse body opens
        newest-first, so it was covering the very rows it was recommending.
      */}
      {query.trim() ? (
        <PrototypeLibrarySearchResults
          query={query}
          tab={view.tab}
          navigationItems={navigationItems}
          onResultsSettled={searchHistory.onResultsSettled}
        />
      ) : (
        <PrototypeLibraryBody view={view} selection={selection} />
      )}
      {recentsOpen
        ? createPortal(
            <ProtoPopoverShell
              ref={recentsCardRef}
              className="proto-menu__popover proto-library-recents__popover"
              role="dialog"
              aria-label="Recent searches"
              /* Parked offscreen until measured — the position is computed from the rendered
                 card, so gating the render on it would mean it never renders. */
              style={{
                position: 'fixed',
                top: recentsPosition?.top ?? -9999,
                left: recentsPosition?.left ?? -9999,
                zIndex: 6000,
              }}
            >
              <PrototypeLibraryRecentSearches
                terms={recentTerms}
                onPickRecent={(term) => {
                  setRecentsOpen(false);
                  search.applyImmediate(term);
                }}
                /* The card stays up. Forgetting one term is usually the first of several,
                   and closing after each would make tidying the list a matter of reopening
                   it; the row leaves and the rest stay where they are. The card closes on
                   its own once the last one goes — see the effect above. */
                onForget={(term) => removeRecentSearchTerm(recentSearchScope, term)}
              />
            </ProtoPopoverShell>,
            document.body,
          )
        : null}
    </PrototypeLibraryPanel>
  );


}
