/**
 * One Thread's members, at panel width.
 *
 * Two kinds of Thread reach this view and they are not the same object. A personal
 * Thread is a connected component of the note-connection graph, addressed by its
 * representative note (`threadClusterDrillSlug`); a shared space's Thread is a real
 * `thread_*` record with its own membership. `isSharedSpaceThreadDrillId` is what tells
 * them apart, and it is the same test `PrototypeSidebar` uses.
 *
 * Both render the carded trail the rest of the app reads a Thread in — spine, orbs,
 * banded rows, drag to reorder — because a Thread opened from the panel is the same
 * Thread the sidebar and the note page show, and the order is the content.
 *
 * What this view still does NOT do is reuse `PrototypeSharedThreadDrilldown` for the
 * shared case. That component brings its own header, back control and title editor — a
 * second header inside a panel that already has one — plus plan management (set-current,
 * mode toggle, delete) which is the mutation surface the panel is meant not to be. Order
 * is the exception: it is how the Thread reads, not administration of it, and the
 * sequence endpoint accepts `orderedNoteIds` on its own without touching `mode`.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { arrayMove } from '@dnd-kit/sortable';
import { orderStudyThreadNodesByIds, resolveStudyThreadMemberOrder } from '@/utils/study-thread-trail';
import { normalizeNoteIdFromParam } from '../proto-route-slugs';
import { isSharedSpaceThreadDrillId } from '../shared-space-thread-list';
import ProtoSpaceLoading from '../ProtoSpaceLoading';
import PrototypeListEmptyState from '../PrototypeListEmptyState';
import {
  ProtoThreadTrailSortableList,
  ProtoThreadTrailSortableRow,
} from '../ProtoThreadTrailSortable';
import { PrototypeSidebarNoteRow } from '../sidebar-rows';
import PrototypeThreadPlanProgress from '../PrototypeThreadPlanProgress';
import { usePrototypeStudyThread } from '../../../hooks/queries/usePrototypeStudyThread';
import { useThreadNotes } from '../../../hooks/queries/useThreadNotes';
import { useStudyThreadMemberDragReorder } from '../../../hooks/useStudyThreadMemberDragReorder';
import { useUpdateThreadSequence } from '../../../hooks/mutations/useUpdateThreadSequence';
import { useActiveSpace } from '../../../hooks/useActiveSpace';
import { canManageStudyThreadsInSharedSpace } from '../../../lib/shared-space-capabilities';
import { toastError } from '../../../lib/error-copy';
import type { SpaceNoteRow } from '../../../hooks/queries/useSpace';
import { useLibraryPanelData, type LibraryPanelData } from './library-panel-data';

export default function PrototypeLibraryThreadView({ threadId }: { threadId: string }) {
  const data = useLibraryPanelData();
  const isShared = isSharedSpaceThreadDrillId(threadId);
  return isShared ? (
    <SharedThreadMembers threadId={threadId} data={data} />
  ) : (
    <PersonalThreadMembers threadId={threadId} data={data} />
  );
}

/**
 * The trail's chrome, shared by both kinds.
 *
 * Deliberately NOT the sidebar's `proto-sidebar-thread-trail` on the list. That class
 * carries the sidebar's own gutter (`margin: 0 8px` AND `width: calc(100% - 16px)`), and
 * the `--carded` rules that undo the pair are written against
 * `.proto-sidebar-root:has(…)` — a selector the panel is not inside. Wearing it here
 * would reintroduce exactly the defect those rules exist to answer: a list sitting 16px
 * narrow inside a card, with the hover band stopping short of both edges. The list only
 * has to be a reset here, which is what `proto-shared-thread-note-list` already is, and
 * the panel body's own 10px padding is the gutter — same bargain the note page's trail
 * strikes inside the inspector.
 */
function LibraryThreadTrail({
  dragging,
  header,
  children,
}: {
  dragging: boolean;
  /**
   * Anything that belongs to the Thread as a whole rather than to one of its
   * rows — today the plan-progress line. Outside the card, because the card is
   * the trail's spine and a row that is not a step must not sit on it.
   */
  header?: ReactNode;
  children: ReactNode;
}) {
  return (
    /* Same grouped-row card the note-page trail wears, so a Thread reads the same
       whichever way it was opened. */
    <div className="proto-thread-trail proto-thread-trail--carded">
      {header}
      <div className="proto-glass-surface proto-glass-surface--panel proto-church-tools proto-thread-trail__card">
        <ul
          className={`proto-shared-thread-note-list proto-thread-trail__spine proto-thread-trail__spine--fill${
            dragging ? ' proto-thread-trail__spine--dragging' : ''
          }`}
          role="list"
        >
          {children}
        </ul>
      </div>
    </div>
  );
}

function PersonalThreadMembers({
  threadId,
  data,
}: {
  threadId: string;
  data: LibraryPanelData;
}) {
  const threadQuery = usePrototypeStudyThread(threadId, data.spaceId);

  /* Same order the note page's trail reads in: the author's manual order when they
     set one, otherwise the graph walk from the representative note. */
  const repNoteId = threadQuery.data?.repNoteId ?? normalizeNoteIdFromParam(threadId);
  const nodesSorted = useMemo(() => {
    const nodes = threadQuery.data?.nodes ?? [];
    if (nodes.length === 0) return nodes;
    return resolveStudyThreadMemberOrder(
      nodes,
      threadQuery.data?.edges ?? [],
      repNoteId,
      threadQuery.data?.memberOrder ?? null,
    );
  }, [
    threadQuery.data?.nodes,
    threadQuery.data?.edges,
    threadQuery.data?.memberOrder,
    repNoteId,
  ]);

  const orderedNoteIds = useMemo(() => nodesSorted.map((node) => node.id), [nodesSorted]);
  /* Membership, not order — this is the list remove-from-Thread rewrites, so it comes
     off the raw nodes rather than the arranged ones. */
  const memberIds = useMemo(
    () => threadQuery.data?.nodes.map((n) => n.id) ?? [],
    [threadQuery.data?.nodes],
  );

  const spaceId = data.spaceId;
  const drag = useStudyThreadMemberDragReorder({
    anchorNoteId: normalizeNoteIdFromParam(threadId),
    spaceId: spaceId ?? '',
    orderedNoteIds,
    enabled: Boolean(spaceId && orderedNoteIds.length > 1),
  });

  const displayNodes = useMemo(
    () => orderStudyThreadNodesByIds(nodesSorted, drag.displayOrderedIds),
    [nodesSorted, drag.displayOrderedIds],
  );

  if (threadQuery.isPending) return <ProtoSpaceLoading label="Loading Thread" />;
  if (threadQuery.isError) {
    return (
      <PrototypeListEmptyState
        iconName="arrow-right-arrow-left"
        title="Could not load Thread"
        description="This Thread did not load. Try again in a moment."
      />
    );
  }
  if (displayNodes.length === 0) {
    return (
      <PrototypeListEmptyState
        iconName="arrow-right-arrow-left"
        title="No notes in this Thread"
        description="Connect notes to each other and they will gather here."
      />
    );
  }
  /* Row actions are space-scoped; with no space there is nothing to act on. The Thread
     cannot have loaded without one, so this is a type guard more than a state. */
  if (!spaceId) return null;

  return (
    <LibraryThreadTrail dragging={Boolean(drag.draggingId)}>
      <ProtoThreadTrailSortableList
        items={drag.displayOrderedIds}
        onDragStart={drag.handleDragStart}
        onDragEnd={drag.handleDragEnd}
        onDragCancel={drag.handleDragCancel}
      >
        {displayNodes.map((node) => {
          const row = data.resolveDrillNoteRow({
            id: node.id,
            title: node.title || node.resourceTitle || null,
            content: node.content ?? node.resourceDescription ?? '',
            updatedAt: node.updatedAt,
          });
          return (
            <ProtoThreadTrailSortableRow key={node.id} id={node.id}>
              {(sortable) => (
                <PrototypeSidebarNoteRow
                  row={row}
                  active={!!(data.activeNoteFullId && node.id === data.activeNoteFullId)}
                  homeSpaceId={spaceId}
                  activeNoteFullId={data.activeNoteFullId}
                  isScopedSharedSpace={data.isScopedSharedSpace}
                  sharedSpaceMemberByUserId={data.sharedSpaceMemberByUserId}
                  viewerIsSpaceOwner={data.viewerIsSpaceOwner}
                  prefetchNote={data.prefetchNote}
                  trailLayout
                  isDragging={drag.draggingId === node.id}
                  trailSortable={drag.showDragHandle ? sortable : null}
                  threadRemoval={{ memberIds }}
                  onOpenNote={data.openNote}
                />
              )}
            </ProtoThreadTrailSortableRow>
          );
        })}
      </ProtoThreadTrailSortableList>
    </LibraryThreadTrail>
  );
}

function SharedThreadMembers({ threadId, data }: { threadId: string; data: LibraryPanelData }) {
  const notesQuery = useThreadNotes(threadId, data.spaceId ?? undefined);
  const { space } = useActiveSpace();
  const updateSequence = useUpdateThreadSequence();

  /*
    The server already returned the notes in authored order, so their position here IS
    the plan — the same reading `PrototypeSharedThreadDrilldown` takes.
  */
  const notes = useMemo(
    () => (notesQuery.data?.pages ?? []).flatMap((page) => page.notes),
    [notesQuery.data?.pages],
  );

  /* Mode, step count and the viewer's own progress describe the Thread, not the
     page of it in hand — the same reading the drilldown takes. */
  const firstPage = notesQuery.data?.pages?.[0];

  /*
    Reordering is not the same act as making a study plan: `orderedNoteIds` is accepted
    on its own by the sequence endpoint, which writes the order and leaves `mode` alone.
    Who may arrange it is the space's thread-structure rule — this order is shared with
    the room, unlike the per-viewer one on a connected-notes trail, so a member reading
    along must not be able to move it.
  */
  const canReorder = canManageStudyThreadsInSharedSpace({
    isOwner: data.viewerIsSpaceOwner,
    membershipRole: space?.role,
    type: space?.type,
    orgId: space?.orgId,
  });

  /*
    Optimistic order, held until the refetch agrees.

    The sequence mutation invalidates rather than patching the thread's note pages, so
    without this the dropped row snaps back to the server order for as long as the
    refetch takes and then jumps again. `useStudyThreadMemberDragReorder` is the personal
    Thread's equivalent and cannot be borrowed: it writes through the note-anchored
    member-order endpoint, which a `thread_*` record has none of.
  */
  const [dragOrder, setDragOrder] = useState<string[] | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);

  const displayNotes = useMemo(() => {
    if (!dragOrder) return notes;
    const byId = new Map(notes.map((note) => [note.id, note]));
    const placed = new Set<string>();
    const out: typeof notes = [];
    for (const id of dragOrder) {
      const note = byId.get(id);
      if (note) {
        out.push(note);
        placed.add(id);
      }
    }
    // A note that arrived while the drag was in flight keeps its own place.
    for (const note of notes) if (!placed.has(note.id)) out.push(note);
    return out;
  }, [notes, dragOrder]);

  useEffect(() => {
    if (!dragOrder) return;
    const server = notes.map((note) => note.id);
    // The server caught up — stop holding the optimistic list over it.
    if (server.length === dragOrder.length && server.every((id, i) => id === dragOrder[i])) {
      setDragOrder(null);
    }
  }, [notes, dragOrder]);

  const displayOrderedIds = useMemo(() => displayNotes.map((note) => note.id), [displayNotes]);

  function handleReorder(activeId: string, overId: string | null) {
    setDraggingId(null);
    if (!overId || overId === activeId) return;
    const from = displayOrderedIds.indexOf(activeId);
    const to = displayOrderedIds.indexOf(overId);
    if (from < 0 || to < 0 || from === to) return;
    const next = arrayMove(displayOrderedIds, from, to);
    setDragOrder(next);
    updateSequence.mutate(
      { threadId, spaceId: data.spaceId, orderedNoteIds: next },
      {
        onError: (err) => {
          /* Let the next refetch win rather than leaving a reorder on screen that the
             server never took. */
          setDragOrder(null);
          toastError(err, 'Could not reorder this Thread');
        },
      },
    );
  }

  if (notesQuery.isPending) return <ProtoSpaceLoading label="Loading Thread" />;
  if (notesQuery.isError) {
    return (
      <PrototypeListEmptyState
        iconName="arrow-right-arrow-left"
        title="Could not load Thread"
        description="This Thread did not load. Try again in a moment."
      />
    );
  }
  if (displayNotes.length === 0) {
    return (
      <PrototypeListEmptyState
        iconName="arrow-right-arrow-left"
        title="No notes in this Thread"
        description="Notes added to this Thread will appear here."
      />
    );
  }
  const spaceId = data.spaceId;
  if (!spaceId) return null;

  /*
    One note is an order already; the grip would be a control with nothing to do.

    And the order is sent whole — `orderedNoteIds` replaces the stored one, and the
    server appends whatever it did not hear about. So a Thread longer than the page we
    are holding must not be draggable here: the unloaded tail would come back in the
    server's own order rather than the one the leader arranged. The panel has no "load
    more" for Thread members (the drilldown does), so the honest answer at panel width is
    to show the trail and withhold the gesture.
  */
  const showDragHandle = canReorder && !notesQuery.hasNextPage && displayNotes.length > 1;

  return (
    <LibraryThreadTrail
      dragging={Boolean(draggingId)}
      /*
        Where the viewer stands in this plan, and the one control that changes
        it. The exception this view already makes for order applies again: this
        is a fact about reading the Thread, not administration of it, so it is
        not the set-current / mode-toggle / delete surface the panel withholds.

        And this is the only place a **personal** reading plan is ever drawn —
        the drilldown only opens from a space hub — so without it a plan you
        finished could never leave Home, which drops completed plans.
      */
      header={
        <PrototypeThreadPlanProgress
          threadId={threadId}
          isSequence={firstPage?.mode === 'sequence'}
          total={firstPage?.sequence?.total ?? 0}
          viewerOpenedNoteIds={firstPage?.viewerOpenedNoteIds ?? []}
          viewerCompletedAt={firstPage?.viewerCompletedAt ?? null}
        />
      }
    >
      <ProtoThreadTrailSortableList
        items={displayOrderedIds}
        onDragStart={setDraggingId}
        onDragEnd={handleReorder}
        onDragCancel={() => setDraggingId(null)}
      >
        {displayNotes.map((note) => {
          const row = data.resolveDrillNoteRow({
            id: note.id,
            title: note.title,
            content: note.content,
            updatedAt: note.updatedAt,
            createdAt: note.createdAt,
          }) as SpaceNoteRow;
          return (
            <ProtoThreadTrailSortableRow key={note.id} id={note.id}>
              {(sortable) => (
                <PrototypeSidebarNoteRow
                  row={row}
                  active={!!(data.activeNoteFullId && note.id === data.activeNoteFullId)}
                  homeSpaceId={spaceId}
                  activeNoteFullId={data.activeNoteFullId}
                  isScopedSharedSpace={data.isScopedSharedSpace}
                  sharedSpaceMemberByUserId={data.sharedSpaceMemberByUserId}
                  viewerIsSpaceOwner={data.viewerIsSpaceOwner}
                  prefetchNote={data.prefetchNote}
                  trailLayout
                  isDragging={draggingId === note.id}
                  trailSortable={showDragHandle ? sortable : null}
                  /* No `threadRemoval`: that prop drives the personal cluster's
                     member-order mutation, which is not what takes a note out of a
                     shared space's Thread. Removal stays in the drilldown. */
                  onOpenNote={data.openNote}
                />
              )}
            </ProtoThreadTrailSortableRow>
          );
        })}
      </ProtoThreadTrailSortableList>
    </LibraryThreadTrail>
  );
}
