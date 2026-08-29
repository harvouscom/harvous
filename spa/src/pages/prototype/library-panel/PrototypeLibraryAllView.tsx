/**
 * The All tab — every kind the library holds, newest first.
 *
 * The tab that replaced the old browse home. That surface answered "what kinds of thing do
 * I have" with five headed previews; this one answers "what have I got, most recent first",
 * which is the question someone reopening the panel actually arrives with.
 *
 * Rows, not cards. Folders, Threads and Scripture books each earn a card in their own tab,
 * but a mixed list cannot be cards and rows at once without the reader reading the shape as
 * a grouping that isn't there — so every kind wears the search-result row, which already
 * knows how to render all of them and carries each kind's glyph.
 *
 * The merge itself is `buildLibraryAllItems`, kept pure and structural next door. This file
 * is the adaptation layer on both sides of it: query rows in, `SidebarSearchResult` out.
 */
import { useMemo, useState } from 'react';
import { threadClusterDrillSlug } from '@/utils/thread-cluster-bulk-actions';
import PrototypeListEmptyState from '../PrototypeListEmptyState';
import PrototypeSidebarSearchResultItem from '../PrototypeSidebarSearchResultItem';
import { ProtoNotesListLoading } from '../sidebar-rows';
import {
  prototypeHighlightListTitle,
  prototypeHighlightRecencyIso,
  prototypeHighlightSubtitlePreview,
} from '../proto-highlight-subtitle';
import type { SidebarSearchResult } from '../sidebar-search-types';
import { useProtoShell } from '../../../layouts/proto-shell-context';
import { usePrototypeSpaceScriptureIndex } from '../../../hooks/queries/usePrototypeSpaceScriptureIndex';
import { usePrototypeSpaceStudyThreadHighlights } from '../../../hooks/queries/usePrototypeSpaceStudyThreadHighlights';
import type { PrototypeHighlightStudyThreadRow } from '../../../hooks/queries/usePrototypeSpaceStudyThreadHighlights';
import { usePrototypeStudyThreads } from '../../../hooks/queries/usePrototypeStudyThreads';
import { useSpaceGroupThreads } from '../../../hooks/queries/useSpaceGroupThreads';
import { useLibrary } from '../../../hooks/queries/useLibrary';
import { buildLibraryAllItems, type LibraryAllItem } from './library-all-items';
import { useLibraryPanelData } from './library-panel-data';

/** How many merged rows the tab shows before "Load more", and how far each press widens it. */
const ALL_WINDOW_STEP = 40;

/**
 * One shared empty array for every not-yet-loaded corpus.
 *
 * A fresh `[]` per render would be a new dependency identity every render, and the merge
 * below is memoized on all five — so with any one query still pending, an inline literal
 * would re-merge and re-sort the whole library on every keystroke elsewhere in the panel.
 */
const NONE: never[] = [];

/**
 * A merged item, as a row the search-result component can render.
 *
 * Deliberately here rather than in `library-all-items.ts`: the merger is pure and knows
 * nothing about how anything looks, and giving it a `SidebarSearchResult` import would tie
 * the model to the row component it happens to be drawn with today.
 *
 * `item.id` is already `${kind}:${sourceId}` — the same shape `sidebarSearchResultStableId`
 * produces — so it carries straight through as the result id.
 */
function allItemAsSearchResult(item: LibraryAllItem): SidebarSearchResult {
  switch (item.kind) {
    case 'note':
      return { id: item.id, kind: 'note', title: item.title, noteId: item.sourceId };
    case 'highlight':
      return {
        id: item.id,
        kind: 'highlight',
        title: item.title,
        subtitle: item.subtitle,
        highlightId: item.sourceId,
        highlightEntryKind: item.highlightEntryKind,
      };
    case 'thread':
      return {
        id: item.id,
        kind: 'threadCluster',
        title: item.title,
        subtitle: item.subtitle,
        threadClusterId: item.sourceId,
      };
    case 'scriptureBook':
      return {
        id: item.id,
        kind: 'scriptureBook',
        title: item.title,
        subtitle: item.subtitle,
        scriptureBookOrder: item.scriptureBookOrder,
      };
    case 'resource':
      return { id: item.id, kind: 'resource', title: item.title, subtitle: item.subtitle };
  }
}

export default function PrototypeLibraryAllView() {
  const data = useLibraryPanelData();
  const { setLibraryPanelView } = useProtoShell();

  /* Personal Threads are graph clusters, a shared space's are records — one query each,
     and only the one that applies to the active space is enabled. */
  const clustersQuery = usePrototypeStudyThreads(
    data.isScopedSharedSpace ? undefined : data.spaceId ?? undefined,
  );
  const groupThreadsQuery = useSpaceGroupThreads(
    data.isScopedSharedSpace ? data.spaceId ?? undefined : undefined,
  );
  const highlightsQuery = usePrototypeSpaceStudyThreadHighlights(data.spaceId ?? undefined);
  const scriptureQuery = usePrototypeSpaceScriptureIndex(data.spaceId ?? undefined);
  const libraryQuery = useLibrary();

  const clusters = clustersQuery.data ?? NONE;
  const sharedThreads = groupThreadsQuery.data ?? NONE;
  const highlights = highlightsQuery.data ?? NONE;
  const books = scriptureQuery.data ?? NONE;
  /*
   * Resources are personal even while a shared space is open — `useLibrary` fetches the
   * viewer's own shelf regardless of scope (see its docblock). Merging them into a
   * space-scoped list would present your private shelf as if it belonged to the room, so
   * inside a shared space the kind is omitted rather than filtered: there is no
   * space-scoped resource corpus to show yet.
   */
  const resources = data.isScopedSharedSpace ? NONE : libraryQuery.data?.items ?? NONE;

  const highlightsById = useMemo(() => {
    const map = new Map<string, PrototypeHighlightStudyThreadRow>();
    for (const row of highlights) map.set(row.id, row);
    return map;
  }, [highlights]);

  const items = useMemo(
    () =>
      buildLibraryAllItems({
        notes: data.notes,
        highlights: highlights.map((row) => ({
          id: row.id,
          title: prototypeHighlightListTitle(row),
          subtitle: prototypeHighlightSubtitlePreview(row, row.parentNoteTitle ?? ''),
          entryKind: row.entryKind,
          recencyIso: prototypeHighlightRecencyIso(row),
        })),
        threads: data.isScopedSharedSpace
          ? sharedThreads.map((thread) => ({
              id: thread.id,
              title: thread.title,
              subtitle: thread.subtitle ?? undefined,
              updatedAt: thread.updatedAt,
            }))
          : clusters.map((cluster) => ({
              /* The drill slug, not the raw cluster id, so `sourceId` is the value the
                 thread drill wants — the same slug `LibraryThreadCards` opens with. */
              id: threadClusterDrillSlug(cluster.id),
              /* Same fallback chain the Thread cards use for a cluster's display name. */
              title: cluster.title?.trim() || cluster.suggestedTitle?.trim() || 'Untitled note',
              subtitle: `${cluster.noteCount} note${cluster.noteCount === 1 ? '' : 's'}`,
              updatedAt: cluster.updatedAt,
            })),
        scriptureBooks: books.map((book) => ({
          bookOrder: book.bookOrder,
          title: book.title,
          subtitle: `${book.passages.length} passage${
            book.passages.length !== 1 ? 's' : ''
          } · ${book.noteCount} note${book.noteCount !== 1 ? 's' : ''}`,
          passages: book.passages,
        })),
        resources: resources.map((item) => ({
          id: item.id,
          title: item.title,
          subtitle: item.sourceSiteName || item.sourceDomain || item.fileName || undefined,
          updatedAt: item.updatedAt,
          createdAt: item.createdAt,
        })),
      }),
    [data.notes, data.isScopedSharedSpace, highlights, sharedThreads, clusters, books, resources],
  );

  const [visibleCount, setVisibleCount] = useState(ALL_WINDOW_STEP);
  const visible = items.slice(0, visibleCount);

  const activate = (item: LibraryAllItem) => {
    switch (item.kind) {
      case 'note': {
        const row = data.notesById.get(item.sourceId);
        if (row) data.openNote(row);
        return;
      }
      case 'highlight': {
        const row = highlightsById.get(item.sourceId);
        if (row) data.openHighlight(row);
        return;
      }
      case 'resource': {
        const resource = resources.find((r) => r.id === item.sourceId);
        if (resource) data.openResource(resource);
        return;
      }
      /*
       * Drills stay on All, they do not jump to the kind's own tab.
       *
       * The tab is where Back returns to, and you came from All — being returned to
       * Scripture, a tab you never visited, is the exact confusion carrying the tab
       * explicitly was meant to remove. The tab row keeps reading "All" while you look at
       * one book, which is honest: All is still the list you are drilled into.
       */
      case 'thread':
        setLibraryPanelView({
          tab: 'all',
          drill: { kind: 'thread', threadId: item.sourceId },
        });
        return;
      case 'scriptureBook':
        if (typeof item.scriptureBookOrder !== 'number') return;
        setLibraryPanelView({
          tab: 'all',
          drill: {
            kind: 'scripture',
            drill: { level: 'passages', bookOrder: item.scriptureBookOrder, bookTitle: item.title },
          },
        });
        return;
    }
  };

  /*
   * "Load more" does double duty, and has to.
   *
   * Notes arrive 20 at a time from a paginated query while every other kind arrives whole,
   * so a window that only widened would run out of notes at the first page and quietly cap
   * the tab at ~20 of them however far you scrolled. Widening the window is the local half;
   * asking for the next note page once the window has caught up to the merged end is the
   * half that keeps the corpus growing.
   */
  const windowReachedEnd = visibleCount >= items.length;
  const canLoadMore = !windowReachedEnd || data.hasMoreNotes;
  const waitingOnNotes = windowReachedEnd && data.isFetchingMoreNotes;
  const loadMore = canLoadMore ? (
    <div className="proto-library-more">
      <button
        type="button"
        className="proto-library-more__btn"
        disabled={waitingOnNotes}
        onClick={() => {
          setVisibleCount((count) => count + ALL_WINDOW_STEP);
          if (windowReachedEnd && data.hasMoreNotes) data.fetchMoreNotes();
        }}
      >
        {waitingOnNotes ? 'Loading…' : 'Load more'}
      </button>
    </div>
  ) : null;

  if (data.notesPhase === 'loading') return <ProtoNotesListLoading />;

  if (items.length === 0) {
    return (
      <div className="proto-library-root">
        <PrototypeListEmptyState
          iconName="folder-open"
          title="Nothing here yet"
          description={
            data.isScopedSharedSpace
              ? 'Notes shared into this space will show up here as you go.'
              : 'Write a note and your folders, Threads and Scripture index build themselves from it.'
          }
        />
        {/* A first page that was all empty scratch notes merges to nothing while more
            pages still exist, so the pager stays reachable rather than the tab claiming
            an emptiness it has not actually established. */}
        {loadMore}
      </div>
    );
  }

  return (
    <div className="proto-library-root">
      <ul className="proto-note-list" role="list">
        {visible.map((item) => (
          <PrototypeSidebarSearchResultItem
            key={item.id}
            result={allItemAsSearchResult(item)}
            onActivate={() => activate(item)}
            notesById={data.notesById}
            highlightsById={highlightsById}
          />
        ))}
      </ul>
      {loadMore}
    </div>
  );
}
