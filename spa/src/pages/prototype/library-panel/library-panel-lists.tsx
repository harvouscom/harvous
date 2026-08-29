/**
 * The lists the Library panel's views are assembled from.
 *
 * Both the root's four-item previews and a section's full list render the same rows, so
 * each kind's row props are decided once here rather than twice — the root and the
 * section differ only in how many items they are handed.
 *
 * The panel's rows are navigation-first. No multi-select (`selectMode={false}`, no
 * `selectable`), and no row menu where the component lets us drop one: a ⋯ per row would
 * put five mutation paths behind a surface whose whole job is finding things, and the
 * sidebar still owns those actions behind ⇧S.
 */
import { useCallback, useEffect, useState } from 'react';
import {
  HighlightRow,
  PrototypeSidebarNoteRow,
  PrototypeSidebarSharedThreadCard,
  PrototypeSidebarThreadCard,
} from '../sidebar-rows';
import ProtoConfirmDialog from '../ProtoConfirmDialog';
import { protoRelativeCaptionAbbrev } from '../proto-time';
import {
  prototypeHighlightListTitle,
  prototypeHighlightRecencyIso,
  prototypeHighlightSubtitlePreview,
} from '../proto-highlight-subtitle';
import { loadPinnedHighlightIds, togglePinnedHighlightId } from '../proto-pinned-stores';
import { threadClusterDrillSlug } from '@/utils/thread-cluster-bulk-actions';
import { useDeleteHighlight } from '../../../hooks/mutations/useDeleteHighlight';
import { toastError } from '../../../lib/error-copy';
import type { SpaceNoteRow } from '../../../hooks/queries/useSpace';
import type { PrototypeHighlightStudyThreadRow } from '../../../hooks/queries/usePrototypeSpaceStudyThreadHighlights';
import type { StudyThreadCluster } from '../../../hooks/queries/usePrototypeStudyThreads';
import type { SpaceGroupStudyThread } from '../../../hooks/queries/useSpaceGroupThreads';
import type { LibraryPanelData } from './library-panel-data';

export function LibraryNoteList({
  rows,
  data,
  folderRemoval,
  className = 'proto-note-list',
}: {
  rows: SpaceNoteRow[];
  data: LibraryPanelData;
  /** Named folder view only — the one container action a row here offers. */
  folderRemoval?: { folderName: string };
  className?: string;
}) {
  /* Row actions are space-scoped; with no space there is nothing to act on. The list
     cannot have loaded without one, so this is a type guard more than a state. */
  const spaceId = data.spaceId;
  if (!spaceId) return null;
  return (
    <ul className={className} role="list">
      {rows.map((row) => (
        <PrototypeSidebarNoteRow
          key={row.id}
          row={row}
          active={!!(data.activeNoteFullId && row.id === data.activeNoteFullId)}
          homeSpaceId={spaceId}
          activeNoteFullId={data.activeNoteFullId}
          isScopedSharedSpace={data.isScopedSharedSpace}
          sharedSpaceMemberByUserId={data.sharedSpaceMemberByUserId}
          viewerIsSpaceOwner={data.viewerIsSpaceOwner}
          selectMode={false}
          hideMenu={!folderRemoval}
          folderRemoval={folderRemoval}
          prefetchNote={data.prefetchNote}
          onOpenNote={data.openNote}
        />
      ))}
    </ul>
  );
}

/**
 * "Load more" for the paginated note list.
 *
 * A button rather than the sidebar's scroll sentinel: `useIntersectionFetchNextPage`
 * wants the scrolling element, and here that element belongs to the panel chrome
 * (`.proto-library-panel__body`), which the body views deliberately cannot reach.
 */
/**
 * More of the same list.
 *
 * Deliberately not `.proto-collection-grid-actions__btn`, which is the gradient primary the
 * sidebar's "New folder" footer uses. That weight is for starting something; this is a
 * continuation of what you are already reading, and a full-width accent bar at the end of
 * every list pulls the eye to the one row that is not content.
 */
export function LibraryLoadMore({ data }: { data: LibraryPanelData }) {
  if (!data.hasMoreNotes) return null;
  return (
    <div className="proto-library-more">
      <button
        type="button"
        className="proto-library-more__btn"
        disabled={data.isFetchingMoreNotes}
        onClick={data.fetchMoreNotes}
      >
        {data.isFetchingMoreNotes ? 'Loading…' : 'Load more'}
      </button>
    </div>
  );
}

/**
 * Highlights.
 *
 * `HighlightRow` has no way to hide its ⋯, so unlike the note rows this one wires its
 * two actions for real rather than handing the menu no-ops. Both are cheap and honest:
 * the pin is per-device local state the sidebar already keeps in `proto-pinned-stores`,
 * and delete goes through the same confirm-then-mutate the sidebar uses.
 */
export function LibraryHighlightList({
  rows,
  data,
  className = 'proto-note-list',
}: {
  rows: PrototypeHighlightStudyThreadRow[];
  data: LibraryPanelData;
  className?: string;
}) {
  const deleteHighlight = useDeleteHighlight();
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<{
    row: PrototypeHighlightStudyThreadRow;
    anchorRect: DOMRect;
  } | null>(null);

  useEffect(() => {
    setPinnedIds(loadPinnedHighlightIds(data.spaceId ?? undefined));
  }, [data.spaceId]);

  const togglePin = useCallback(
    (id: string) => {
      if (!data.spaceId) return;
      setPinnedIds(togglePinnedHighlightId(data.spaceId, id));
    },
    [data.spaceId],
  );

  const onConfirmDelete = () => {
    if (!data.spaceId || !deleteTarget) return;
    const { row } = deleteTarget;
    deleteHighlight.mutate(
      { id: row.id, spaceId: data.spaceId, parentNoteId: row.parentNoteId },
      {
        onSuccess: () => setDeleteTarget(null),
        onError: (err) => {
          setDeleteTarget(null);
          toastError(err, 'Could not delete highlight');
        },
      },
    );
  };

  return (
    <>
      <ul className={className} role="list">
        {rows.map((row) => (
          <HighlightRow
            key={row.id}
            isActive={false}
            isPinned={pinnedIds.includes(row.id)}
            entryKind={row.entryKind}
            title={prototypeHighlightListTitle(row)}
            rel={protoRelativeCaptionAbbrev(prototypeHighlightRecencyIso(row)) ?? undefined}
            preview={prototypeHighlightSubtitlePreview(row, row.parentNoteTitle ?? '')}
            isScopedSharedSpace={data.isScopedSharedSpace}
            sharedSpaceMemberByUserId={data.sharedSpaceMemberByUserId}
            authorDisplayName={row.authorDisplayName}
            authorColor={row.authorColor}
            authorUserId={row.userId}
            isOwnHighlight={row.isOwnHighlight !== false}
            selectMode={false}
            onOpen={() => data.openHighlight(row)}
            onTogglePin={() => togglePin(row.id)}
            onDelete={(anchorRect) => setDeleteTarget({ row, anchorRect })}
            isDeleting={deleteHighlight.isPending && deleteHighlight.variables?.id === row.id}
          />
        ))}
      </ul>
      {deleteTarget ? (
        <ProtoConfirmDialog
          anchorRect={deleteTarget.anchorRect}
          confirmLabel="Delete"
          busy={deleteHighlight.isPending}
          onConfirm={onConfirmDelete}
          onCancel={() => {
            if (!deleteHighlight.isPending) setDeleteTarget(null);
          }}
        />
      ) : null}
    </>
  );
}

/** A personal Thread's display name — the cluster's own title, with its fallbacks. */
function libraryThreadClusterTitle(cluster: StudyThreadCluster): string {
  return cluster.title?.trim() || cluster.suggestedTitle?.trim() || 'Untitled note';
}

export function LibraryThreadCards({
  clusters,
  onOpen,
  className = 'proto-collection-grid',
}: {
  clusters: StudyThreadCluster[];
  onOpen: (threadId: string) => void;
  className?: string;
}) {
  return (
    <ul className={className}>
      {clusters.map((cluster) => (
        <PrototypeSidebarThreadCard
          key={cluster.id}
          cluster={cluster}
          title={libraryThreadClusterTitle(cluster)}
          isPinned={cluster.studyThreadPinned === true}
          showMenu={false}
          onOpen={() => onOpen(threadClusterDrillSlug(cluster.id))}
          /* Never reached with `showMenu={false}`; the card's props are required. */
          onTogglePin={() => {}}
          onDelete={() => {}}
          isDeleting={false}
        />
      ))}
    </ul>
  );
}

export function LibrarySharedThreadCards({
  threads,
  onOpen,
  className = 'proto-collection-grid',
}: {
  threads: SpaceGroupStudyThread[];
  onOpen: (threadId: string) => void;
  className?: string;
}) {
  return (
    <ul className={className}>
      {threads.map((thread) => (
        <PrototypeSidebarSharedThreadCard
          key={thread.id}
          thread={thread}
          showMenu={false}
          onOpen={() => onOpen(thread.id)}
          onSetCurrent={() => {}}
          onDelete={() => {}}
          isDeleting={false}
          setCurrentPending={false}
        />
      ))}
    </ul>
  );
}
