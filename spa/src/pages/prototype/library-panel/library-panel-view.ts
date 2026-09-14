/**
 * What the Library panel is currently showing.
 *
 * A tab, and optionally a drill pushed on top of it. The two used to be one sum type
 * (`root | section | folder | thread | scripture | search`), which meant a drill had to
 * *imply* which section it belonged to — a folder implied Notes, a thread implied Threads.
 * Carrying the tab explicitly deletes that inference and the whole class of "which section
 * am I in" ambiguity with it: open a folder from All and you go back to All, where you
 * actually came from, rather than to Notes, which you never visited.
 *
 * The drill state lives in shell context rather than inside the panel because callers
 * outside the panel name destinations — Activity's greeting chips and the reader both do —
 * and the sidebar's equivalent could not, which is why its scripture chip could only ever
 * open the list rather than the book.
 *
 * Nothing here is persisted. Every open derives its view from where the reader already is.
 */
import type { ScriptureDrillState } from '../sidebar-universal-search';
/* Type-only, and it must stay that way: this module is in the eager graph (proto-shell-context
   and NativeToolbar both import it), so a value import would drag the tab table and its icon
   deps out of the lazy panel chunk and into the initial payload. */
import type { LibraryTab } from '../sidebar-search-types';

export type { LibraryTab };

/** Pushed on top of a tab. Never replaces it — the tab is where Back returns to. */
export type LibraryDrill =
  /** `null` folderKey is the Unsorted bucket, mirroring `SidebarFolderDrilldown`. */
  | { kind: 'folder'; folderKey: string | null }
  | { kind: 'thread'; threadId: string }
  | { kind: 'scripture'; drill: ScriptureDrillState };

export type LibraryPanelView = {
  tab: LibraryTab;
  drill: LibraryDrill | null;
  /**
   * Opening query, when whatever opened the panel already knew one — a tag chip on
   * Activity. An opening condition, not live state: the query itself is panel-local.
   */
  querySeed?: string;
  /**
   * Whether the search field takes focus on open.
   *
   * Set by anything that means "search" — the chords, and the chip, which reads "Search"
   * and so promises a place to type. Reaching for ⇧K is already the first keystroke of a
   * query; clicking a control labelled Search is the same intent by another hand, and
   * making the reader click twice to start typing is a step the label already took.
   *
   * Left off everywhere else: a drill names a destination, not a query.
   *
   * The ask is not the answer — the panel refuses it on a touch device, where a caret
   * raises the on-screen keyboard over the results the tap was meant to show. See
   * `PrototypeLibraryPanelHost`.
   *
   * An opening condition like `querySeed`, so `isSameLibraryPanelView` ignores it — two
   * openings of the same place are the same place however focus was handled.
   */
  autoFocusSearch?: boolean;
  /**
   * Open with selection already on.
   *
   * For a destination whose whole point is acting on several things at once — "8 notes need a
   * folder" is not an invitation to browse, it is a job. Arriving in browse mode would make
   * the reader find the way into selecting before they could start, which is a step the row
   * they pressed already implied.
   */
  selectOnOpen?: boolean;
};

/**
 * Does the search field actually take the caret on this open?
 *
 * The opener only asks (`autoFocusSearch`); this decides. Two refusals rather than one,
 * because they catch different devices: the breakpoint catches the phone, where the panel
 * is a bottom sheet and a caret raises the keyboard over the list; the pointer catches the
 * tablet that is wide enough to be laid out as a desktop and still has no keyboard but
 * that one. A mouse on a narrow window is the case the breakpoint alone would get wrong in
 * the other direction, and it is why neither check is dropped for the other.
 */
export function shouldAutoFocusLibrarySearch({
  view,
  isMobileSidebar,
  isCoarsePointer,
}: {
  view: Pick<LibraryPanelView, 'autoFocusSearch'>;
  isMobileSidebar: boolean;
  isCoarsePointer: boolean;
}): boolean {
  if (!view.autoFocusSearch) return false;
  return !isMobileSidebar && !isCoarsePointer;
}

/** Tab order for the chip row and for ⇧← / ⇧→ cycling. */
export const LIBRARY_TABS: LibraryTab[] = [
  'all',
  'notes',
  'folders',
  'threads',
  'highlights',
  'scripture',
  'resources',
];

/**
 * Where the chip opens the panel: the same place, every time.
 *
 * This used to branch by shell mode — a note opened its folder, the reader opened its book.
 * That went when the chip stopped naming them: a control reading "Search" that drops you
 * into one folder is answering a question nobody asked, and the folder was already in the
 * note's inspector and the chapter already on screen.
 *
 * Greeting chips are the exception and still drill, because those *do* name their
 * destination — see `useLibraryPanelNav`. The rule was never "never drill", it is that a
 * control opens what it says it opens.
 */
export const LIBRARY_CHIP_OPENING_VIEW: LibraryPanelView = {
  tab: 'all',
  drill: null,
  /* The chip says Search, so it opens ready to search — the same landing ⇧K gets. Only
     on a pointer that is not a finger; see `autoFocusSearch`. */
  autoFocusSearch: true,
};

/**
 * ⇧← / ⇧→ — walk the tabs.
 *
 * Clears the drill, because the keys mean "next tab" and landing on a tab still showing
 * one folder's contents would be answering a different question than the one asked.
 */
export function cycleLibraryTab(view: LibraryPanelView, step: 1 | -1): LibraryPanelView {
  const current = LIBRARY_TABS.indexOf(view.tab);
  const from = current === -1 ? 0 : current;
  const next = (from + step + LIBRARY_TABS.length) % LIBRARY_TABS.length;
  return { tab: LIBRARY_TABS[next]!, drill: null };
}

/** What a drill is, said the way the sidebar's back row says it. */
export function libraryDrillKind(view: LibraryPanelView): string | null {
  if (!view.drill) return null;
  switch (view.drill.kind) {
    case 'folder':
      return 'Folder';
    case 'thread':
      return 'Thread';
    case 'scripture':
      return view.drill.drill.level === 'notes' ? 'Passage' : 'Scripture';
  }
}

/** Tab names, for the back tile that says which one it returns to. */
export const LIBRARY_TAB_LABELS: Record<LibraryTab, string> = {
  all: 'Everything',
  notes: 'Notes',
  folders: 'Folders',
  threads: 'Threads',
  highlights: 'Highlights',
  scripture: 'Scripture',
  resources: 'Resources',
};

/** The header's back affordance shows only when there is a drill to come back from. */
export function libraryPanelShowsBack(view: LibraryPanelView): boolean {
  return view.drill !== null;
}

/**
 * The header's title for a drill, or null at a bare tab.
 *
 * Null rather than the tab's name on purpose: the surface has no title of its own — the
 * search field is its identity — so the header only speaks when you have drilled into
 * something specific enough to need naming.
 *
 * Drills that name a thing the panel had to load (a thread's title, a passage's label)
 * pass it in as `subject`; the rest is answerable here.
 */
export function libraryDrillTitle(
  view: LibraryPanelView,
  subject?: string | null,
): string | null {
  if (!view.drill) return null;
  switch (view.drill.kind) {
    case 'folder':
      return subject ?? view.drill.folderKey ?? 'Unsorted';
    case 'thread':
      return subject ?? 'Thread';
    case 'scripture':
      switch (view.drill.drill.level) {
        case 'books':
          return subject ?? 'Scripture';
        case 'passages':
          return subject ?? view.drill.drill.bookTitle ?? 'Scripture';
        case 'notes':
          return subject ?? view.drill.drill.passageTitle ?? 'Passage';
      }
  }
}

function isSameDrill(a: LibraryDrill | null, b: LibraryDrill | null): boolean {
  if (a === null || b === null) return a === b;
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case 'folder':
      return a.folderKey === (b as typeof a).folderKey;
    case 'thread':
      return a.threadId === (b as typeof a).threadId;
    case 'scripture': {
      const other = (b as typeof a).drill;
      if (a.drill.level !== other.level) return false;
      if (a.drill.level === 'books') return true;
      if (a.drill.level === 'passages') {
        return a.drill.bookOrder === (other as typeof a.drill).bookOrder;
      }
      return (
        a.drill.bookOrder === (other as typeof a.drill).bookOrder &&
        a.drill.passageKey === (other as typeof a.drill).passageKey
      );
    }
  }
}

/** Same view, for skipping redundant state writes on repeated opens. */
export function isSameLibraryPanelView(a: LibraryPanelView, b: LibraryPanelView): boolean {
  return a.tab === b.tab && a.querySeed === b.querySeed && isSameDrill(a.drill, b.drill);
}
