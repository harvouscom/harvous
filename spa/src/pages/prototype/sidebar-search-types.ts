import { highlightEntryKindIconName } from './proto-highlight-subtitle';

export type SidebarSearchResultKind =
  | 'note'
  | 'folder'
  | 'threadCluster'
  | 'highlight'
  | 'scriptureBook'
  | 'scripturePassage'
  | 'readerChapter';

export type SidebarElsewhereTypeFilter =
  | 'all'
  | 'notes'
  | 'folders'
  | 'threads'
  | 'highlights'
  | 'scripture';

export type HighlightKindFilter = 'all' | 'notes' | 'connected' | 'scripture' | 'references';

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
  readerBook?: string;
  readerChapter?: number;
  readerVerse?: number | null;
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
    case 'readerChapter':
      return 'book-open';
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
    case 'readerChapter':
      return 'Read in the Bible';
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
      return kind === 'scriptureBook' || kind === 'scripturePassage' || kind === 'readerChapter';
    default:
      return true;
  }
}
