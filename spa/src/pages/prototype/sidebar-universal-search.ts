import type { SidebarListMode } from '../../layouts/proto-shell-context';
import type { SpaceNoteRow } from '../../hooks/queries/useSpace';
import type { PrototypeHighlightStudyThreadRow } from '../../hooks/queries/usePrototypeSpaceStudyThreadHighlights';
import type { StudyThreadCluster } from '../../hooks/queries/usePrototypeStudyThreads';
import type {
  ScriptureIndexBook,
  ScriptureIndexPassage,
} from '../../hooks/queries/usePrototypeSpaceScriptureIndex';
import type { SearchResult } from '@/hooks/useSearch';
import { noteFolderMembershipLabels, noteBelongsToFolderBucket, normalizeFolderKey } from '@/utils/note-folder-display';
import { sortFolderBucketsAlphabetically } from '@/utils/sorting';
import { stripHtmlForListPreview } from '@/utils/html-stripper';
import { stripServerAutoUntitledNoteTitleForDisplay } from '@/utils/server-auto-untitled-note-display';
import { parseReaderQuery } from '@/utils/parse-reader-query';
import {
  prototypeHighlightListTitle,
  prototypeHighlightSubtitlePreview,
} from './proto-highlight-subtitle';
import { fuzzyFilter, fuzzyMatches } from './fuzzy-search';
import type {
  HighlightKindFilter,
  SidebarElsewhereTypeFilter,
  SidebarSearchResult,
} from './sidebar-search-types';
import {
  elsewhereTypeFilterMatches,
  sidebarSearchResultStableId,
} from './sidebar-search-types';
import { SIDEBAR_NO_MATCH_COPY } from './sidebar-no-match-copy';

export const SIDEBAR_ELSEWHERE_RESULTS_CAP = 50;

export type ScriptureDrillState =
  | { level: 'books' }
  | { level: 'passages'; bookOrder: number; bookTitle?: string }
  | { level: 'notes'; bookOrder: number; passageKey: string; passageTitle?: string };

export type FolderBucket = {
  name: string | null;
  count: number;
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

function noteSearchTitle(note: { title?: string | null }): string {
  return stripServerAutoUntitledNoteTitleForDisplay(note.title ?? '') || 'New Note';
}

function filterNotesByQuery(notes: SpaceNoteRow[], query: string): SpaceNoteRow[] {
  const searchable = notes.map((note) => ({
    note,
    title: noteSearchTitle(note),
    body: stripHtmlForListPreview(note.content ?? '', 800),
    // Local tag match keeps the active view at parity with native (NoteSearchIndex.swift)
    // and with server FTS, which resolves tags for the Elsewhere tab.
    tags: (note.tags ?? []).join(' '),
  }));
  return fuzzyFilter(searchable, ['title', 'body', 'tags'], query).map((entry) => entry.note);
}

function highlightSearchText(row: PrototypeHighlightStudyThreadRow): string {
  return [
    row.focusTitle,
    row.anchorTextSnapshot,
    row.parentNoteTitle,
    row.miniNoteBody,
    row.sourceSnippet,
    row.scriptureReference,
    row.scripturePassageExcerpt,
  ]
    .filter(Boolean)
    .join(' ');
}

function filterHighlightsByQuery(
  rows: PrototypeHighlightStudyThreadRow[],
  query: string,
): PrototypeHighlightStudyThreadRow[] {
  const searchable = rows.map((row) => ({ row, searchText: highlightSearchText(row) }));
  return fuzzyFilter(searchable, ['searchText'], query).map((entry) => entry.row);
}

function scriptureBookMatchesQuery(book: ScriptureIndexBook, query: string): boolean {
  if (fuzzyMatches(query, book.title)) return true;
  return book.passages.some(
    (p) =>
      fuzzyMatches(query, p.displayRef) ||
      p.notes.some((n) => fuzzyMatches(query, n.title)),
  );
}

function scripturePassageMatchesQuery(passage: ScriptureIndexPassage, query: string): boolean {
  if (fuzzyMatches(query, passage.displayRef)) return true;
  return passage.notes.some((n) => fuzzyMatches(query, n.title));
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

/** Elsewhere empty-state title — type-filter specific, or mirrors active section when filter is All. */
export function elsewhereEmptyStateTitle(
  ctx: ActiveSearchContext,
  typeFilter: SidebarElsewhereTypeFilter,
): string {
  if (typeFilter !== 'all') {
    switch (typeFilter) {
      case 'notes':
        return SIDEBAR_NO_MATCH_COPY.noNotesMatch;
      case 'folders':
        return SIDEBAR_NO_MATCH_COPY.noFoldersMatch;
      case 'threads':
        return SIDEBAR_NO_MATCH_COPY.noThreadsMatch;
      case 'highlights':
        return SIDEBAR_NO_MATCH_COPY.noHighlightsMatch;
      case 'scripture':
        return SIDEBAR_NO_MATCH_COPY.noScriptureMatch;
      default:
        return SIDEBAR_NO_MATCH_COPY.noOtherMatches;
    }
  }

  const { mode, folderDrill, threadDrillTitle, scriptureDrill } = ctx;
  if (mode === 'notes') return 'Nothing outside Notes';
  if (mode === 'folders') {
    if (folderDrill !== undefined) return `Nothing outside “${folderDrill ?? 'Unsorted'}”`;
    return 'Nothing outside Folders';
  }
  if (mode === 'threads') {
    if (ctx.threadDrillId) return `Nothing outside “${threadDrillTitle?.trim() || 'Thread'}”`;
    return 'Nothing outside Threads';
  }
  if (mode === 'highlights') return 'Nothing outside Highlights';
  if (mode === 'scripture') {
    if (scriptureDrill.level === 'notes') {
      return `Nothing outside “${scriptureDrill.passageTitle?.trim() || 'Passage'}”`;
    }
    if (scriptureDrill.level === 'passages') {
      return `Nothing outside “${scriptureDrill.bookTitle?.trim() || 'Book'}”`;
    }
    return 'Nothing outside Scripture';
  }
  return SIDEBAR_NO_MATCH_COPY.noOtherMatches;
}

/** My Home cross-space search empty-state title (shared shell, personal notes scope). */
export function myHomeEmptyStateTitle(typeFilter: SidebarElsewhereTypeFilter): string {
  if (typeFilter !== 'all') {
    switch (typeFilter) {
      case 'notes':
        return SIDEBAR_NO_MATCH_COPY.noNotesMatch;
      case 'folders':
        return SIDEBAR_NO_MATCH_COPY.noFoldersMatch;
      case 'threads':
        return SIDEBAR_NO_MATCH_COPY.noThreadsMatch;
      case 'highlights':
        return SIDEBAR_NO_MATCH_COPY.noHighlightsMatch;
      case 'scripture':
        return SIDEBAR_NO_MATCH_COPY.noScriptureMatch;
      default:
        return 'Nothing in My Home';
    }
  }
  return 'Nothing in My Home';
}

function noteToResult(note: SpaceNoteRow, subtitle?: string, ftsExcerpt?: string): SidebarSearchResult {
  const title = noteSearchTitle(note);
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

/**
 * The chapter a typed reference points at, whether or not anything has been written on it.
 *
 * Every other result here is something the reader already owns — a note, a folder, a passage
 * they annotated. This one is the text itself, and it is the only result that can exist for a
 * book nobody has touched yet. Without it, searching "Nahum 2" in an app that contains the
 * whole Bible answered "no matches".
 */
function readerChapterToResult(match: ReturnType<typeof parseReaderQuery>): SidebarSearchResult | null {
  if (!match) return null;
  return {
    id: sidebarSearchResultStableId('readerChapter', `${match.book}:${match.chapter}:${match.verse ?? ''}`),
    kind: 'readerChapter',
    title: match.reference,
    // Says which of the two things it is: the chapter you named, or the one we picked for you.
    subtitle: match.chapterAssumed ? 'Open the book at chapter 1' : 'Read this chapter',
    readerBook: match.book,
    readerChapter: match.chapter,
    readerVerse: match.verse,
  };
}

function ftsNoteToResult(result: SearchResult): SidebarSearchResult {
  const title = noteSearchTitle(result);
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
    return filterNotesByQuery(data.notes, query).map((n) =>
      noteToResult(n, stripHtmlForListPreview(n.content ?? '', 80) || undefined),
    );
  }

  if (mode === 'folders') {
    if (ctx.folderDrill !== undefined) {
      const inFolder = data.notes.filter((n) => {
        const enriched = n as SpaceNoteRow & {
          primaryCollection?: string | null;
          secondaryCollections?: string[];
        };
        // noteBelongsToFolderBucket compares on the normalized key, so a collapsed bucket surfaces
        // notes from every apostrophe/whitespace/case variant of the folder name.
        return noteBelongsToFolderBucket(
          {
            primaryCollection: enriched.primaryCollection ?? null,
            secondaryCollections: enriched.secondaryCollections ?? [],
          },
          ctx.folderDrill ?? null,
        );
      });
      return filterNotesByQuery(inFolder, query).map((n) =>
        noteToResult(n, stripHtmlForListPreview(n.content ?? '', 80) || undefined),
      );
    }
    const searchable = data.folders.map((folder) => ({
      folder,
      label: folder.name ?? 'Unsorted',
    }));
    return fuzzyFilter(searchable, ['label'], query).map((entry) => folderToResult(entry.folder));
  }

  if (mode === 'threads') {
    if (ctx.threadDrillId) {
      const searchable = data.threadDrillNodes.map((node) => ({
        node,
        title: node.title || node.resourceTitle || '',
      }));
      return fuzzyFilter(searchable, ['title'], query).map((entry) =>
        noteToResult({
          id: entry.node.id,
          title: entry.node.title || entry.node.resourceTitle || null,
          content: '',
        } as SpaceNoteRow),
      );
    }
    const searchable = data.threadClusters.map((cluster) => ({
      cluster,
      title: resolveClusterTitle(cluster),
    }));
    return fuzzyFilter(searchable, ['title'], query).map((entry) =>
      threadClusterToResult(entry.cluster, entry.title),
    );
  }

  if (mode === 'highlights') {
    const kindFiltered = data.highlights.filter((r) =>
      highlightKindMatches(ctx.highlightKindFilter, r.entryKind),
    );
    return filterHighlightsByQuery(kindFiltered, query).map(highlightToResult);
  }

  if (mode === 'scripture') {
    const { scriptureDrill } = ctx;
    if (scriptureDrill.level === 'books') {
      return data.scriptureBooks
        .filter((book) => scriptureBookMatchesQuery(book, query))
        .map(scriptureBookToResult);
    }
    if (scriptureDrill.level === 'passages') {
      const book = data.scriptureBooks.find((b) => b.bookOrder === scriptureDrill.bookOrder);
      const passages = book?.passages ?? [];
      return passages
        .filter((passage) => scripturePassageMatchesQuery(passage, query))
        .map((passage) => scripturePassageToResult(scriptureDrill.bookOrder, passage));
    }
    if (scriptureDrill.level === 'notes') {
      const book = data.scriptureBooks.find((b) => b.bookOrder === scriptureDrill.bookOrder);
      const passage = book?.passages.find((p) => p.passageKey === scriptureDrill.passageKey);
      const searchable = (passage?.notes ?? []).map((note) => ({
        note,
        title: note.title ?? '',
      }));
      return fuzzyFilter(searchable, ['title'], query).map((entry) =>
        noteToResult({
          id: entry.note.id,
          title: entry.note.title,
          content: '',
          updatedAt: entry.note.updatedAt,
          createdAt: entry.note.createdAt,
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
  const locallyMatchedNoteIds = new Set<string>();

  /*
   * First, so that when ranking ties — "John 3" is an exact title prefix, and so is a note
   * called "John 3 notes" — the passage itself wins. Someone who types a reference is asking
   * to go there; their notes on it are one row below, which is where they should be.
   */
  const readerResult = readerChapterToResult(parseReaderQuery(query));
  if (readerResult) results.push(readerResult);

  for (const note of filterNotesByQuery(data.notes, query)) {
    locallyMatchedNoteIds.add(note.id);
    results.push(noteToResult(note, stripHtmlForListPreview(note.content ?? '', 80) || undefined));
  }

  // Skip only notes the local pass already matched — a loaded note can still be an
  // FTS-only hit (tag match, or body past the local preview truncation), and dropping
  // every loaded id would silently discard those.
  for (const fts of data.ftsNotes ?? []) {
    if (fts.type !== 'note') continue;
    if (locallyMatchedNoteIds.has(fts.id)) continue;
    results.push(ftsNoteToResult(fts));
  }

  const folderMatches = fuzzyFilter(
    data.folders.map((folder) => ({ folder, label: folder.name ?? 'Unsorted' })),
    ['label'],
    query,
  );
  for (const entry of folderMatches) {
    results.push(folderToResult(entry.folder));
  }

  const threadMatches = fuzzyFilter(
    data.threadClusters.map((cluster) => ({
      cluster,
      title: resolveClusterTitle(cluster),
    })),
    ['title'],
    query,
  );
  for (const entry of threadMatches) {
    results.push(threadClusterToResult(entry.cluster, entry.title));
  }

  for (const row of filterHighlightsByQuery(data.highlights, query)) {
    results.push(highlightToResult(row));
  }

  for (const book of data.scriptureBooks) {
    if (fuzzyMatches(query, book.title)) {
      results.push(scriptureBookToResult(book));
    }
    for (const passage of book.passages) {
      if (
        fuzzyMatches(query, passage.displayRef) ||
        passage.notes.some((n) => fuzzyMatches(query, n.title))
      ) {
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

  // Rank by title only — never re-filter by it. Every candidate already earned its
  // place through its own matcher (note body, highlight text, server FTS/tags), and a
  // title-only pass here dropped all of those: a note whose body says "Ps Jeff" but
  // whose title doesn't mention Jeff vanished from Elsewhere while showing In Notes.
  return Array.from(deduped.values())
    .map((result, index) => ({ result, index, rank: titleMatchRank(result.title, query) }))
    .sort((a, b) => (a.rank !== b.rank ? a.rank - b.rank : a.index - b.index))
    .slice(0, SIDEBAR_ELSEWHERE_RESULTS_CAP)
    .map((entry) => entry.result);
}

/** Title-affinity rank for Elsewhere ordering: exact prefix, substring, fuzzy, then body/tag-only hits. */
function titleMatchRank(title: string, query: string): number {
  const t = title.trim().toLowerCase();
  const q = query.trim().toLowerCase();
  if (!q) return 3;
  if (t.startsWith(q)) return 0;
  if (t.includes(q)) return 1;
  if (fuzzyMatches(query, title)) return 2;
  return 3;
}

export function buildFoldersFromNotes(notes: SpaceNoteRow[]): FolderBucket[] {
  // Bucket by the normalized key so apostrophe/whitespace/case variants of the same folder collapse
  // into one entry; keep the first-seen original label as the canonical display name.
  const buckets = new Map<string, { name: string | null; count: number }>();
  for (const note of notes) {
    const n = note as SpaceNoteRow & { primaryCollection?: string | null; secondaryCollections?: string[] };
    const labels = noteFolderMembershipLabels({
      primaryCollection: n.primaryCollection ?? null,
      secondaryCollections: n.secondaryCollections ?? [],
    });
    const keys: (string | null)[] = labels.length > 0 ? labels : [null];
    for (const label of keys) {
      const bucketKey = label === null ? '__none__' : normalizeFolderKey(label);
      const existing = buckets.get(bucketKey);
      if (existing) existing.count += 1;
      else buckets.set(bucketKey, { name: label, count: 1 });
    }
  }
  const result: FolderBucket[] = [];
  buckets.forEach(({ name, count }) => {
    result.push({ name, count });
  });
  return sortFolderBucketsAlphabetically(result);
}

/** Merge empty-folder registry labels into note-derived folder buckets. */
export function mergeFoldersWithRegistry(
  fromNotes: FolderBucket[],
  registryLabels: string[],
): FolderBucket[] {
  if (registryLabels.length === 0) return fromNotes;
  const byKey = new Map<string, FolderBucket>();
  for (const bucket of fromNotes) {
    const key = bucket.name === null ? '__none__' : normalizeFolderKey(bucket.name);
    byKey.set(key, bucket);
  }
  for (const label of registryLabels) {
    const trimmed = label.trim();
    if (!trimmed) continue;
    const key = normalizeFolderKey(trimmed);
    if (byKey.has(key)) continue;
    byKey.set(key, { name: trimmed, count: 0 });
  }
  return sortFolderBucketsAlphabetically([...byKey.values()]);
}
