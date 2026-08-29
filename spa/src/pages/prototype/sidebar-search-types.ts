import { highlightEntryKindIconName } from './proto-highlight-subtitle';

export type SidebarSearchResultKind =
  | 'note'
  | 'folder'
  | 'threadCluster'
  | 'highlight'
  | 'scriptureBook'
  | 'scripturePassage'
  /** A passage the query itself names, whether or not any note cites it. */
  | 'scriptureReference'
  /**
   * A curated library item. Only the Library panel produces these — the sidebar's own
   * search has no Resources scope — but the kind lives here so one row component can
   * render every result the app knows how to show.
   */
  | 'resource';

export type SidebarElsewhereTypeFilter =
  | 'all'
  | 'notes'
  | 'folders'
  | 'threads'
  | 'highlights'
  | 'scripture';

export type HighlightKindFilter = 'all' | 'notes' | 'connected' | 'scripture' | 'references';

/**
 * The five, in the order they are offered.
 *
 * One table, because there were two identical ones — the sidebar's list and its search
 * results each kept a copy — and the search panel was about to make a third. They are the
 * same five kinds wherever highlights are filtered, so a kind added in one place has to
 * appear in the others or the surfaces quietly disagree about what a highlight can be.
 *
 * "All" is a member rather than the absence of one: exactly one of these is on at any time.
 */
export const HIGHLIGHT_KIND_OPTIONS: { id: HighlightKindFilter; label: string; iconName?: string }[] =
  [
    { id: 'all', label: 'All' },
    { id: 'notes', label: 'Notes', iconName: 'note-sticky' },
    { id: 'connected', label: 'Connected', iconName: 'arrow-right-arrow-left' },
    { id: 'scripture', label: 'Scripture', iconName: 'scroll' },
    { id: 'references', label: 'References', iconName: 'lines-leaning' },
  ];

export type SidebarSearchScope = 'active' | 'elsewhere' | 'my-home';

export const SIDEBAR_ELSEWHERE_TYPE_OPTIONS: {
  id: SidebarElsewhereTypeFilter;
  label: string;
  iconName?: string;
}[] = [
  { id: 'all', label: 'All' },
  { id: 'notes', label: 'Notes', iconName: 'note-sticky' },
  { id: 'folders', label: 'Folders', iconName: 'folder' },
  { id: 'threads', label: 'Threads', iconName: 'arrow-right-arrow-left' },
  { id: 'highlights', label: 'Highlights', iconName: 'highlighter' },
  { id: 'scripture', label: 'Scripture', iconName: 'scroll' },
];

export type SidebarSearchResult = {
  id: string;
  kind: SidebarSearchResultKind;
  title: string;
  subtitle?: string;
  highlightEntryKind?: string | null;
  noteId?: string;
  folderKey?: string | null;
  threadClusterId?: string;
  highlightId?: string;
  scriptureBookOrder?: number;
  scripturePassageKey?: string;
  /** Canonical reference to open, e.g. "John 15:1-27". Set on `scriptureReference` results. */
  scriptureReference?: string;
  /**
   * Verse to open at, only when the query actually named one. Absent for a chapter query,
   * which must open at the top of the chapter rather than scrolled to verse 1 — the canonical
   * reference cannot answer this, since "John 15" normalizes to "John 15:1-27".
   */
  scriptureFocusVerse?: number;
  ftsExcerpt?: string;
};

export function sidebarSearchResultStableId(
  kind: SidebarSearchResultKind,
  key: string,
): string {
  return `${kind}:${key}`;
}

export function sidebarSearchResultIcon(
  kind: SidebarSearchResultKind,
  highlightEntryKind?: string | null,
): string {
  if (kind === 'highlight') return highlightEntryKindIconName(highlightEntryKind);
  switch (kind) {
    case 'note':
      return 'note-sticky';
    case 'folder':
      return 'folder';
    case 'threadCluster':
      return 'arrow-right-arrow-left';
    case 'scriptureBook':
    case 'scripturePassage':
    case 'scriptureReference':
      return 'book-open';
    case 'resource':
      return 'newspaper';
    default:
      return 'note-sticky';
  }
}

export function sidebarSearchResultAriaLabel(
  kind: SidebarSearchResultKind,
  highlightEntryKind?: string | null,
): string {
  switch (kind) {
    case 'note':
      return 'Note';
    case 'folder':
      return 'Folder';
    case 'threadCluster':
      return 'Thread';
    case 'scriptureBook':
      return 'Scripture book';
    case 'scripturePassage':
      return 'Scripture passage';
    case 'scriptureReference':
      return 'Read passage';
    case 'resource':
      return 'Resource';
    case 'highlight':
      switch (highlightEntryKind) {
        case 'linkedNote':
          return 'Connected highlight';
        case 'scriptureLink':
          return 'Scripture highlight';
        case 'reference':
          return 'Reference highlight';
        default:
          return 'Highlight';
      }
    default:
      return 'Result';
  }
}

export function elsewhereTypeFilterMatches(
  filter: SidebarElsewhereTypeFilter,
  kind: SidebarSearchResultKind,
): boolean {
  if (filter === 'all') return true;
  switch (filter) {
    case 'notes':
      return kind === 'note';
    case 'folders':
      return kind === 'folder';
    case 'threads':
      return kind === 'threadCluster';
    case 'highlights':
      return kind === 'highlight';
    case 'scripture':
      return (
        kind === 'scriptureBook' || kind === 'scripturePassage' || kind === 'scriptureReference'
      );
    default:
      return true;
  }
}

/**
 * The Library panel's tabs.
 *
 * Derived from the search filter rather than listed again, which is the whole mechanism
 * keeping browse and search honest with each other: a kind that becomes searchable becomes
 * browsable in the same edit, and neither list can quietly grow a member the other lacks.
 *
 * Resources are the one addition. The sidebar's search has no Resources scope, so the
 * filter above does not carry one — but the panel browses them, so the tab table does.
 */
export type LibraryTab = SidebarElsewhereTypeFilter | 'resources';

export const LIBRARY_TAB_OPTIONS: {
  id: LibraryTab;
  label: string;
  iconName?: string;
}[] = [
  ...SIDEBAR_ELSEWHERE_TYPE_OPTIONS.map((option) =>
    /*
     * "Everything", with a glyph — two departures from the shared filter, both about this
     * being a menu rather than a chip row.
     *
     * The word: the field beside it already says "Search everything…", so the kind saying
     * "Everything" makes one sentence out of the two controls. The sidebar's chip stays
     * "All" because a chip row is short on width and long on context.
     *
     * The glyph: every other row here has one, and a single iconless row starts its label
     * at a different x than its neighbours — the ragged edge reads as a rendering fault
     * rather than a category.
     *
     * `layer-group`, the same mark the study feed's scope picker already wears for "All
     * activity". This was `table-cells` for a while on the theory that the layers belonged
     * to the Activity segment and a row wearing the shell's navigation mark would read as a
     * way out of the menu. That was wrong twice over: the segment shows the *space tile* and
     * only falls back to layers when there is none, and the scope picker had already
     * established the mark as meaning "all of it" rather than "go here". One idea, one
     * glyph, wherever the app offers to stop narrowing.
     */
    option.id === 'all'
      ? { ...option, label: 'Everything', iconName: 'layer-group' }
      : option,
  ),
  /* Matches the sidebar's Resources list mode, so the same shelf wears one glyph. */
  { id: 'resources', label: 'Resources', iconName: 'newspaper' },
];

/** Whether a result belongs under a tab. Delegates to the search filter for the shared six. */
export function libraryTabMatches(tab: LibraryTab, kind: SidebarSearchResultKind): boolean {
  if (tab === 'resources') return kind === 'resource';
  /* `all` includes resources here even though the search filter has never seen the kind —
     "all" means all, and the panel is the only surface that can produce one. */
  if (tab === 'all') return true;
  return elsewhereTypeFilterMatches(tab, kind);
}
