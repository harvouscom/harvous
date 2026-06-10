import type { SidebarListMode } from '../../layouts/proto-shell-context';
import type { SpaceNoteRow } from '../../hooks/queries/useSpace';
import type { PrototypeHighlightStudyThreadRow } from '../../hooks/queries/usePrototypeSpaceStudyThreadHighlights';
import type { StudyThreadCluster } from '../../hooks/queries/usePrototypeStudyThreads';
import type {
  ScriptureIndexBook,
  ScriptureIndexPassage,
} from '../../hooks/queries/usePrototypeSpaceScriptureIndex';
import type { SearchResult } from '@/hooks/useSearch';
import { noteFolderMembershipLabels } from '@/utils/note-folder-display';
import { stripHtmlForListPreview } from '@/utils/html-stripper';
import { stripServerAutoUntitledNoteTitleForDisplay } from '@/utils/server-auto-untitled-note-display';
import {
  prototypeHighlightListTitle,
  prototypeHighlightSubtitlePreview,
} from './proto-highlight-subtitle';
import type {
  HighlightKindFilter,
  SidebarElsewhereTypeFilter,
  SidebarSearchResult,
  SidebarSearchResultKind,
} from './sidebar-search-types';
import {
  elsewhereTypeFilterMatches,
  sidebarSearchResultStableId,
} from './sidebar-search-types';

export const SIDEBAR_ELSEWHERE_RESULTS_CAP = 50;

export type ScriptureDrillState =
  | { level: 'books' }
  | { level: 'passages'; bookOrder: number; bookTitle?: string }
  | { level: 'notes'; bookOrder: number; passageKey: string; passageTitle?: string };

export type FolderBucket = {
  name: string | null;
  count: number;
  mostRecentIso: string | null;
};

export type ActiveSearchContext = {
  mode: SidebarListMode;
  folderDrill: string | null | undefined;
  threadDrillId: string | undefined;
  threadDrillTitle?: string;
  scriptureDrill: ScriptureDrillState;
  highlightKindFilter: HighlightKindFilter;
};

export type UniversalSearchData = {
  notes: SpaceNoteRow[];
  folders: FolderBucket[];
  highlights: PrototypeHighlightStudyThreadRow[];
  scriptureBooks: ScriptureIndexBook[];
  threadClusters: StudyThreadCluster[];
  threadDrillNodes: { id: string; title: string | null; resourceTitle?: string | null }[];
  ftsNotes?: SearchResult[];
};

export function highlightKindMatches(
  filter: HighlightKindFilter,
  entryKind: string | null | undefined,
): boolean {
  switch (filter) {
    case 'all':
      return true;
    case 'notes':
      return entryKind === 'workspace' || entryKind === 'miniNote';
    case 'connected':
      return entryKind === 'linkedNote';
    case 'scripture':
      return entryKind === 'scriptureLink';
    case 'references':
      return entryKind === 'reference';
    default:
      return true;
  }
}

function normalizedQuery(q: string): string {
  return q.trim().toLowerCase();
}

function noteMatchesQuery(
  note: { title?: string | null; content?: string | null },
  q: string,
): boolean {
  const t = normalizedQuery(q);
  if (!t) return true;
  const title = (note.title ?? '').toLowerCase();
  const body = stripHtmlForListPreview(note.content ?? '', 800).toLowerCase();
  return title.includes(t) || body.includes(t);
}

function highlightMatchesQuery(row: PrototypeHighlightStudyThreadRow, q: string): boolean {
  const t = normalizedQuery(q);
  if (!t) return true;
  const hay = [
    row.focusTitle,
    row.anchorTextSnapshot,
    row.parentNoteTitle,
    row.miniNoteBody,
    row.sourceSnippet,
    row.scriptureReference,
    row.scripturePassageExcerpt,
  ]
    .join(' ')
    .toLowerCase();
  return hay.includes(t);
}

function matchRank(title: string, q: string): number {
  const lower = title.toLowerCase();
  const query = normalizedQuery(q);
  if (!query) return 0;
  if (lower.startsWith(query)) return 0;
  if (lower.includes(query)) return 1;
  return 2;
}

function sortByMatchRank(results: SidebarSearchResult[], q: string): SidebarSearchResult[] {
  return [...results].sort((a, b) => {
    const rankDiff = matchRank(a.title, q) - matchRank(b.title, q);
    if (rankDiff !== 0) return rankDiff;
    return a.title.localeCompare(b.title);
  });
}

export function activeSearchSectionHeader(ctx: ActiveSearchContext): string {
  const { mode, folderDrill, threadDrillTitle, scriptureDrill } = ctx;
  if (mode === 'notes') return 'In Notes';
  if (mode === 'folders') {
    if (folderDrill !== undefined) return `In “${folderDrill ?? 'Unsorted'}”`;
    return 'In Folders';
  }
  if (mode === 'threads') {
    if (ctx.threadDrillId) return `In “${threadDrillTitle?.trim() || 'Thread'}”`;
    return 'In Threads';
  }
  if (mode === 'highlights') return 'In Highlights';
  if (mode === 'scripture') {
    if (scriptureDrill.level === 'notes') {
      return `In “${scriptureDrill.passageTitle?.trim() || 'Passage'}”`;
    }
    if (scriptureDrill.level === 'passages') {
      return `In “${scriptureDrill.bookTitle?.trim() || 'Book'}”`;
    }
    return 'In Scripture';
  }
  return 'In this view';
}

function noteToResult(note: SpaceNoteRow, subtitle?: string, ftsExcerpt?: string): SidebarSearchResult {
  const title =
    stripServerAutoUntitledNoteTitleForDisplay(note.title ?? '') || 'New Note';
  return {
    id: sidebarSearchResultStableId('note', note.id),
    kind: 'note',
    title,
    subtitle,
    noteId: note.id,
    ftsExcerpt,
  };
}

function folderToResult(folder: FolderBucket): SidebarSearchResult {
  const label = folder.name ?? 'Unsorted';
  return {
    id: sidebarSearchResultStableId('folder', folder.name ?? '__none__'),
    kind: 'folder',
    title: label,
    subtitle: `${folder.count} note${folder.count !== 1 ? 's' : ''}`,
    folderKey: folder.name,
  };
}

function threadClusterToResult(cluster: StudyThreadCluster, title: string): SidebarSearchResult {
  return {
    id: sidebarSearchResultStableId('threadCluster', cluster.id),
    kind: 'threadCluster',
    title,
    subtitle: `${cluster.noteCount} note${cluster.noteCount !== 1 ? 's' : ''}`,
    threadClusterId: cluster.id,
  };
}

function highlightToResult(row: PrototypeHighlightStudyThreadRow): SidebarSearchResult {
  return {
    id: sidebarSearchResultStableId('highlight', row.id),
    kind: 'highlight',
    title: prototypeHighlightListTitle(row),
    subtitle: prototypeHighlightSubtitlePreview(row, row.parentNoteTitle ?? ''),
    highlightEntryKind: row.entryKind,
    highlightId: row.id,
    noteId: row.parentNoteId,
  };
}

function scriptureBookToResult(book: ScriptureIndexBook): SidebarSearchResult {
  return {
    id: sidebarSearchResultStableId('scriptureBook', String(book.bookOrder)),
    kind: 'scriptureBook',
    title: book.title,
    subtitle: `${book.passages.length} passage${book.passages.length !== 1 ? 's' : ''} · ${book.noteCount} note${book.noteCount !== 1 ? 's' : ''}`,
    scriptureBookOrder: book.bookOrder,
  };
}

function scripturePassageToResult(bookOrder: number, passage: ScriptureIndexPassage): SidebarSearchResult {
  return {
    id: sidebarSearchResultStableId('scripturePassage', `${bookOrder}:${passage.passageKey}`),
    kind: 'scripturePassage',
    title: passage.displayRef,
    subtitle: `${passage.noteCount} note${passage.noteCount !== 1 ? 's' : ''}`,
    scriptureBookOrder: bookOrder,
    scripturePassageKey: passage.passageKey,
  };
}

function ftsNoteToResult(result: SearchResult): SidebarSearchResult {
  const title =
    stripServerAutoUntitledNoteTitleForDisplay(result.title ?? '') || 'New Note';
  const excerpt = (result as { excerpt?: string | null }).excerpt ?? undefined;
  return {
    id: sidebarSearchResultStableId('note', result.id),
    kind: 'note',
    title,
    subtitle: result.threadTitle ?? undefined,
    noteId: result.id,
    ftsExcerpt: excerpt ?? undefined,
  };
}

export function buildActiveViewResults(
  ctx: ActiveSearchContext,
  q: string,
  data: UniversalSearchData,
  resolveClusterTitle: (cluster: StudyThreadCluster) => string,
): SidebarSearchResult[] {
  const query = q.trim();
  if (!query) return [];

  const { mode } = ctx;

  if (mode === 'notes') {
    return data.notes
      .filter((n) => noteMatchesQuery(n, query))
      .map((n) => noteToResult(n, stripHtmlForListPreview(n.content ?? '', 80) || undefined));
  }

  if (mode === 'folders') {
    if (ctx.folderDrill !== undefined) {
      const inFolder = data.notes.filter((n) => {
        const enriched = n as SpaceNoteRow & {
          primaryCollection?: string | null;
          secondaryCollections?: string[];
        };
        const labels = noteFolderMembershipLabels({
          primaryCollection: enriched.primaryCollection ?? null,
          secondaryCollections: enriched.secondaryCollections ?? [],
        });
        if (ctx.folderDrill === null) return labels.length === 0;
        return labels.includes(ctx.folderDrill);
      });
      return inFolder
        .filter((n) => noteMatchesQuery(n, query))
        .map((n) => noteToResult(n, stripHtmlForListPreview(n.content ?? '', 80) || undefined));
    }
    return data.folders
      .filter((f) => (f.name ?? 'Unsorted').toLowerCase().includes(normalizedQuery(query)))
      .map(folderToResult);
  }

  if (mode === 'threads') {
    if (ctx.threadDrillId) {
      return data.threadDrillNodes
        .filter((node) => {
          const title = (node.title || node.resourceTitle || '').toLowerCase();
          return title.includes(normalizedQuery(query));
        })
        .map((node) =>
          noteToResult({
            id: node.id,
            title: node.title || node.resourceTitle || null,
            content: '',
          } as SpaceNoteRow),
        );
    }
    return data.threadClusters
      .filter((c) => resolveClusterTitle(c).toLowerCase().includes(normalizedQuery(query)))
      .map((c) => threadClusterToResult(c, resolveClusterTitle(c)));
  }

  if (mode === 'highlights') {
    return data.highlights
      .filter((r) => highlightKindMatches(ctx.highlightKindFilter, r.entryKind))
      .filter((r) => highlightMatchesQuery(r, query))
      .map(highlightToResult);
  }

  if (mode === 'scripture') {
    const { scriptureDrill } = ctx;
    if (scriptureDrill.level === 'books') {
      return data.scriptureBooks
        .filter((b) => {
          if (b.title.toLowerCase().includes(normalizedQuery(query))) return true;
          return b.passages.some((p) => {
            if (p.displayRef.toLowerCase().includes(normalizedQuery(query))) return true;
            return p.notes.some((n) => (n.title ?? '').toLowerCase().includes(normalizedQuery(query)));
          });
        })
        .map(scriptureBookToResult);
    }
    if (scriptureDrill.level === 'passages') {
      const book = data.scriptureBooks.find((b) => b.bookOrder === scriptureDrill.bookOrder);
      const passages = book?.passages ?? [];
      return passages
        .filter((p) => {
          if (p.displayRef.toLowerCase().includes(normalizedQuery(query))) return true;
          return p.notes.some((n) => (n.title ?? '').toLowerCase().includes(normalizedQuery(query)));
        })
        .map((p) => scripturePassageToResult(scriptureDrill.bookOrder, p));
    }
    if (scriptureDrill.level === 'notes') {
      const book = data.scriptureBooks.find((b) => b.bookOrder === scriptureDrill.bookOrder);
      const passage = book?.passages.find((p) => p.passageKey === scriptureDrill.passageKey);
      return (passage?.notes ?? [])
        .filter((n) => (n.title ?? '').toLowerCase().includes(normalizedQuery(query)))
        .map((n) =>
          noteToResult({
            id: n.id,
            title: n.title,
            content: '',
            updatedAt: n.updatedAt,
            createdAt: n.createdAt,
          } as SpaceNoteRow),
        );
    }
  }

  return [];
}

function collectAllElsewhereCandidates(
  q: string,
  data: UniversalSearchData,
  resolveClusterTitle: (cluster: StudyThreadCluster) => string,
): SidebarSearchResult[] {
  const query = q.trim();
  if (!query) return [];

  const results: SidebarSearchResult[] = [];
  const loadedNoteIds = new Set(data.notes.map((n) => n.id));

  for (const note of data.notes) {
    if (noteMatchesQuery(note, query)) {
      results.push(noteToResult(note, stripHtmlForListPreview(note.content ?? '', 80) || undefined));
    }
  }

  for (const fts of data.ftsNotes ?? []) {
    if (fts.type !== 'note') continue;
    if (loadedNoteIds.has(fts.id)) continue;
    results.push(ftsNoteToResult(fts));
  }

  for (const folder of data.folders) {
    if ((folder.name ?? 'Unsorted').toLowerCase().includes(normalizedQuery(query))) {
      results.push(folderToResult(folder));
    }
  }

  for (const cluster of data.threadClusters) {
    const title = resolveClusterTitle(cluster);
    if (title.toLowerCase().includes(normalizedQuery(query))) {
      results.push(threadClusterToResult(cluster, title));
    }
  }

  for (const row of data.highlights) {
    if (highlightMatchesQuery(row, query)) {
      results.push(highlightToResult(row));
    }
  }

  for (const book of data.scriptureBooks) {
    const bookTitleMatch = book.title.toLowerCase().includes(normalizedQuery(query));
    if (bookTitleMatch) {
      results.push(scriptureBookToResult(book));
    }
    for (const passage of book.passages) {
      const passageMatch =
        passage.displayRef.toLowerCase().includes(normalizedQuery(query)) ||
        passage.notes.some((n) => (n.title ?? '').toLowerCase().includes(normalizedQuery(query)));
      if (passageMatch) {
        results.push(scripturePassageToResult(book.bookOrder, passage));
      }
    }
  }

  return results;
}

export function buildElsewhereResults(
  q: string,
  data: UniversalSearchData,
  excludeIds: Set<string>,
  typeFilter: SidebarElsewhereTypeFilter,
  resolveClusterTitle: (cluster: StudyThreadCluster) => string,
): SidebarSearchResult[] {
  const query = q.trim();
  if (!query) return [];

  const candidates = collectAllElsewhereCandidates(q, data, resolveClusterTitle);
  const deduped = new Map<string, SidebarSearchResult>();
  for (const r of candidates) {
    if (excludeIds.has(r.id)) continue;
    if (!elsewhereTypeFilterMatches(typeFilter, r.kind)) continue;
    if (!deduped.has(r.id)) deduped.set(r.id, r);
  }

  return sortByMatchRank(Array.from(deduped.values()), query).slice(0, SIDEBAR_ELSEWHERE_RESULTS_CAP);
}

export function buildFoldersFromNotes(notes: SpaceNoteRow[]): FolderBucket[] {
  const buckets = new Map<string, { count: number; mostRecentIso: string | null }>();
  for (const note of notes) {
    const n = note as SpaceNoteRow & { primaryCollection?: string | null; secondaryCollections?: string[] };
    const labels = noteFolderMembershipLabels({
      primaryCollection: n.primaryCollection ?? null,
      secondaryCollections: n.secondaryCollections ?? [],
    });
    const keys = labels.length > 0 ? labels : [null];
    const iso = note.updatedAt ?? note.createdAt ?? null;
    for (const label of keys) {
      const bucketKey = label ?? '__none__';
      const existing = buckets.get(bucketKey) ?? { count: 0, mostRecentIso: null };
      existing.count += 1;
      if (iso && (!existing.mostRecentIso || iso > existing.mostRecentIso)) {
        existing.mostRecentIso = iso;
      }
      buckets.set(bucketKey, existing);
    }
  }
  const result: FolderBucket[] = [];
  buckets.forEach((v, k) => {
    result.push({ name: k === '__none__' ? null : k, count: v.count, mostRecentIso: v.mostRecentIso });
  });
  return result.sort((a, b) => {
    if (a.name === null) return 1;
    if (b.name === null) return -1;
    if (a.mostRecentIso && b.mostRecentIso) return b.mostRecentIso.localeCompare(a.mostRecentIso);
    return 0;
  });
}
