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
import { packMixedId, type LibrarySelection } from './use-library-selection';
import { useMemo, useState } from 'react';
import { threadClusterDrillSlug } from '@/utils/thread-cluster-bulk-actions';
import PrototypeListEmptyState from '../PrototypeListEmptyState';
import Icon, { type IconName } from '@/components/react/Icon';
import { buildFoldersFromNotes, mergeFoldersWithRegistry } from '../sidebar-universal-search';
import { noteFolderMembershipLabels, normalizeFolderKey } from '@/utils/note-folder-display';
import { usePrototypeFolderRegistry } from '../../../hooks/mutations/usePrototypeFolderRegistry';
import type { SpaceNoteRow } from '../../../hooks/queries/useSpace';
import PrototypeSidebarSearchResultItem from '../PrototypeSidebarSearchResultItem';
import {
  PrototypeSidebarFolderCard,
  PrototypeSidebarSharedThreadCard,
  PrototypeSidebarThreadCard,
} from '../sidebar-rows';
import { LibraryScriptureBookCard } from './PrototypeLibraryScriptureView';
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
import { buildLibraryAllItems, type LibraryAllItem, type LibraryAllItemKind } from './library-all-items';
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
/**
 * Rows only. Folders, Threads and Scripture are drawn by their own components below, so this
 * no longer has a case for them — a `SidebarSearchResult` cannot express a card.
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
    case 'resource':
      return { id: item.id, kind: 'resource', title: item.title, subtitle: item.subtitle };
    default:
      return { id: item.id, kind: 'note', title: item.title, subtitle: item.subtitle };
  }
}

/**
 * The glyph each kind leads with, matching the tab it comes from.
 *
 * Notes carry one too. On their own tab they need none — everything there is a note — but a
 * mixed list has to say so, and leaving the commonest kind unmarked would make "no glyph"
 * mean note, which is a thing the reader has to learn rather than read.
 */
const ALL_KIND_ICONS: Partial<Record<LibraryAllItemKind, IconName>> = {
  note: 'note-sticky',
  thread: 'arrow-right-arrow-left',
  highlight: 'highlighter',
  scriptureBook: 'book',
  resource: 'newspaper',
};

export default function PrototypeLibraryAllView({ selection }: { selection?: LibrarySelection }) {
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

  /*
   * Folders, and when each was last touched.
   *
   * A folder has no timestamp of its own — it is a label some notes carry — so its recency is
   * the newest note wearing it. Same shape as a scripture book inheriting its passages'
   * newest note, and the reason both are resolved here rather than in the merger: knowing
   * which notes claim a folder means knowing how membership is declared, which is search's
   * business rather than the merger's.
   */
  const folderRegistryQuery = usePrototypeFolderRegistry(data.spaceId ?? undefined);
  const folders = useMemo(() => {
    const buckets = mergeFoldersWithRegistry(
      buildFoldersFromNotes(data.notes),
      folderRegistryQuery.data ?? [],
    );
    const newest = new Map<string, number>();
    for (const note of data.notes) {
      const row = note as SpaceNoteRow & {
        primaryCollection?: string | null;
        secondaryCollections?: string[];
      };
      const stamp = Math.max(
        new Date(row.updatedAt ?? 0).getTime() || 0,
        new Date(row.createdAt ?? 0).getTime() || 0,
      );
      if (!stamp) continue;
      for (const label of noteFolderMembershipLabels({
        primaryCollection: row.primaryCollection ?? null,
        secondaryCollections: row.secondaryCollections ?? [],
      })) {
        const key = normalizeFolderKey(label);
        if (stamp > (newest.get(key) ?? 0)) newest.set(key, stamp);
      }
    }
    return buckets.map((bucket) => ({
      name: bucket.name,
      count: bucket.count,
      recencyIso: bucket.name
        ? new Date(newest.get(normalizeFolderKey(bucket.name)) ?? 0).toISOString()
        : undefined,
    }));
  }, [data.notes, folderRegistryQuery.data]);

  const highlightsById = useMemo(() => {
    const map = new Map<string, PrototypeHighlightStudyThreadRow>();
    for (const row of highlights) map.set(row.id, row);
    return map;
  }, [highlights]);

  /*
   * The row components ask for selection per row, by their own id. Here that id has to be the
   * composite one — a bare note id and a bare folder name could collide, and the selection
   * would not know which it was holding.
   */
  const rowSelection = useMemo(() => {
    if (!selection?.available) return undefined;
    return {
      for: (kind: 'note' | 'highlight', sourceId: string, label: string) => {
        const id = packMixedId(kind, sourceId);
        const selected = selection.isSelected(id);
        return {
          selectMode: selection.active,
          selected,
          checkbox: {
            selected,
            label,
            onToggle: () => (selection.active ? selection.toggle(id) : selection.beginWith(id)),
          },
        };
      },
    };
  }, [selection]);

  const items = useMemo(
    () =>
      buildLibraryAllItems({
        notes: data.notes,
        folders,
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
              /* A shared space's current thread is the pinned one — `selectCurrentSpaceThread`
                 finds it by exactly this flag — so it is the room's answer to "what are we on",
                 and the one row in here that should never be scrolled past. */
              isPinned: thread.isPinned === true,
            }))
          : clusters.map((cluster) => ({
              /* The drill slug, not the raw cluster id, so `sourceId` is the value the
                 thread drill wants — the same slug `LibraryThreadCards` opens with. */
              id: threadClusterDrillSlug(cluster.id),
              /* Same fallback chain the Thread cards use for a cluster's display name. */
              title: cluster.title?.trim() || cluster.suggestedTitle?.trim() || 'Untitled note',
              subtitle: `${cluster.noteCount} note${cluster.noteCount === 1 ? '' : 's'}`,
              updatedAt: cluster.updatedAt,
              /* The same flag the thread card draws its pin from, so the row's glyph and its
                 place in the list cannot disagree. */
              isPinned: cluster.studyThreadPinned === true,
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
          /* No pin: this tab's resources are the personal library, whose rows carry no
             `pinned` field — that one belongs to a space's shelf, which this view does not
             show (`resources` is NONE inside a shared space). */
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
        <span>{waitingOnNotes ? 'Loading…' : 'Load more'}</span>
        {waitingOnNotes ? null : <Icon name="caret-down" size={10} aria-hidden />}
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
      {/* One list holding two furnitures. Cards style themselves off
          `.proto-collection-grid-item`, rows off `.proto-note-row-item`, and neither needs
          anything from the container beyond a column with a gap. */}
      <ul className="proto-note-list proto-library-all-list" role="list">
        {visible.map((item) => {
          /*
           * Each kind wears what it wears on its own tab.
           *
           * Folders, Threads and Scripture are cards there, so they are cards here — the same
           * components, not a flattened imitation of them. Notes, highlights and resources are
           * rows on their own tabs too, and they lead with their kind's glyph because in a
           * list that interleaves everything, what a row *is* has to be legible before what it
           * says.
           */
          if (item.kind === 'folder') {
            const bucket = folders.find((f) => f.name === item.sourceId);
            return (
              <PrototypeSidebarFolderCard
                key={item.id}
                folder={{ name: item.sourceId, count: bucket?.count ?? 0 }}
                isPinned={false}
                showMenu={false}
                selectMode={selection?.active ?? false}
                selectable={Boolean(selection)}
                selected={selection?.isSelected(packMixedId('folder', item.sourceId)) ?? false}
                onToggleSelected={() => {
                  const id = packMixedId('folder', item.sourceId);
                  if (selection?.active) selection.toggle(id);
                  else selection?.beginWith(id);
                }}
                onOpen={() => activate(item)}
                onTogglePin={() => {}}
                onDelete={() => {}}
                isDeleting={false}
              />
            );
          }
          if (item.kind === 'thread') {
            /*
             * A shared space's Threads are records rather than graph clusters, so they come
             * from a different query and wear a different card. Without this they fell through
             * to the row renderer and were the one kind in the list not wearing its own
             * chrome — visible only inside a shared space, which is exactly where it would
             * have gone unnoticed.
             */
            const shared = data.isScopedSharedSpace
              ? sharedThreads.find((t) => t.id === item.sourceId)
              : undefined;
            if (shared) {
              return (
                <PrototypeSidebarSharedThreadCard
                  key={item.id}
                  thread={shared}
                  showMenu={false}
                  onOpen={() => activate(item)}
                  onSetCurrent={() => {}}
                  onDelete={() => {}}
                  isDeleting={false}
                  setCurrentPending={false}
                />
              );
            }
            const cluster = clusters.find((c) => threadClusterDrillSlug(c.id) === item.sourceId);
            if (cluster) {
              return (
                <PrototypeSidebarThreadCard
                  key={item.id}
                  cluster={cluster}
                  title={item.title}
                  isPinned={cluster.studyThreadPinned === true}
                  showMenu={false}
                  selectMode={selection?.active ?? false}
                  selectable={Boolean(selection)}
                  selected={selection?.isSelected(packMixedId('thread', cluster.id)) ?? false}
                  onToggleSelected={() => {
                    const id = packMixedId('thread', cluster.id);
                    if (selection?.active) selection.toggle(id);
                    else selection?.beginWith(id);
                  }}
                  onOpen={() => activate(item)}
                  onTogglePin={() => {}}
                  onDelete={() => {}}
                  isDeleting={false}
                />
              );
            }
          }
          if (item.kind === 'scriptureBook') {
            const book = books.find((b) => b.bookOrder === item.scriptureBookOrder);
            if (book) {
              return (
                <LibraryScriptureBookCard key={item.id} book={book} onOpen={() => activate(item)} />
              );
            }
          }
          return (
            <PrototypeSidebarSearchResultItem
              key={item.id}
              result={allItemAsSearchResult(item)}
              onActivate={() => activate(item)}
              notesById={data.notesById}
              highlightsById={highlightsById}
              leadIcon={ALL_KIND_ICONS[item.kind]}
              selection={rowSelection}
            />
          );
        })}
      </ul>
      {loadMore}
    </div>
  );
}
