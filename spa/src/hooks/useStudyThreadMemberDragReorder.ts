import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  applyHtml5DragPreview,
  resolveThreadTrailDragPreviewSource,
} from '@/utils/html5-drag-preview';
import {
  patchStudyThreadMemberOrderInCache,
  useUpdateStudyThreadMemberOrder,
} from './mutations/useUpdateStudyThreadMemberOrder';
import { computeStudyThreadMemberMoveIndex } from './study-thread-member-move-index';
import { useCoarsePointer } from '../lib/use-coarse-pointer';

interface UseStudyThreadMemberDragReorderOptions {
  anchorNoteId: string;
  spaceId: string;
  orderedNoteIds: string[];
  enabled?: boolean;
}

/** Same ids, order ignored. */
function sameIdMembership(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  const set = new Set(a);
  return b.every((id) => set.has(id));
}

function sameIdOrder(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

/** HTML5 drag reorder for study-thread member lists (sidebar drill + thread panel). */
export function useStudyThreadMemberDragReorder({
  anchorNoteId,
  spaceId,
  orderedNoteIds,
  enabled = true,
}: UseStudyThreadMemberDragReorderOptions) {
  const queryClient = useQueryClient();
  const updateOrder = useUpdateStudyThreadMemberOrder();
  const draggingIdRef = useRef<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [displayOrderedIds, setDisplayOrderedIds] = useState(orderedNoteIds);
  const orderedIdsRef = useRef(orderedNoteIds);
  const pendingOrderRef = useRef<string[] | null>(null);
  const lastOrderKeyRef = useRef<string | null>(null);
  const dragStartOrderRef = useRef<string[] | null>(null);
  const optimisticOrderRef = useRef<string[] | null>(null);
  const dragPreviewCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (draggingIdRef.current) return;

    if (optimisticOrderRef.current) {
      if (sameIdOrder(optimisticOrderRef.current, orderedNoteIds)) {
        optimisticOrderRef.current = null;
      } else if (sameIdMembership(optimisticOrderRef.current, orderedNoteIds)) {
        // Same notes, different order — the server just hasn't caught up with the drag
        // that is already on screen. Holding the optimistic order is the whole point.
        orderedIdsRef.current = optimisticOrderRef.current;
        setDisplayOrderedIds(optimisticOrderRef.current);
        return;
      } else {
        /**
         * Different notes — the thread's membership changed under us (a note added from
         * another surface, a sync flush, someone else's edit). The optimistic list is
         * describing a thread that no longer exists, so keeping it meant the next drag
         * submitted N ids for a thread that now has N+1, and the server rejected the
         * whole reorder with INVALID_ORDER. Drop it and take the server's list.
         */
        optimisticOrderRef.current = null;
      }
    }

    orderedIdsRef.current = orderedNoteIds;
    setDisplayOrderedIds(orderedNoteIds);
  }, [orderedNoteIds]);

  useEffect(() => {
    return () => {
      dragPreviewCleanupRef.current?.();
      dragPreviewCleanupRef.current = null;
    };
  }, []);

  /**
   * No drag handle on touch — same reasoning as the space switcher's reorder:
   * this is HTML5 drag-and-drop, which never fires on touch, so the handle is
   * an inert target competing with the row's own tap.
   */
  const coarsePointer = useCoarsePointer();
  const showDragHandle = enabled && orderedNoteIds.length > 1 && !coarsePointer;

  const moveMember = useCallback((draggedId: string, insertBeforeIndex: number) => {
    const currentIds = orderedIdsRef.current;
    const fromIndex = currentIds.indexOf(draggedId);
    if (fromIndex < 0) return;

    const toIndex = computeStudyThreadMemberMoveIndex(fromIndex, insertBeforeIndex);
    if (toIndex === null) return;

    const next = [...currentIds];
    const [item] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, item!);

    const orderKey = next.join('\0');
    if (lastOrderKeyRef.current === orderKey) return;

    orderedIdsRef.current = next;
    lastOrderKeyRef.current = orderKey;
    pendingOrderRef.current = next;
    setDisplayOrderedIds(next);
  }, []);

  const finishDrag = useCallback(() => {
    draggingIdRef.current = null;
    setDraggingId(null);
    lastOrderKeyRef.current = null;
    dragPreviewCleanupRef.current?.();
    dragPreviewCleanupRef.current = null;
  }, []);

  const persistPendingOrder = useCallback(() => {
    const next = pendingOrderRef.current ?? orderedIdsRef.current;
    const baseline = dragStartOrderRef.current;
    pendingOrderRef.current = null;
    dragStartOrderRef.current = null;
    if (!next || !anchorNoteId) return;
    if (baseline && sameIdOrder(baseline, next)) {
      optimisticOrderRef.current = null;
      return;
    }
    optimisticOrderRef.current = [...next];
    patchStudyThreadMemberOrderInCache(queryClient, spaceId, next);
    updateOrder.mutate({ anchorNoteId, spaceId, orderedNoteIds: next });
  }, [anchorNoteId, queryClient, spaceId, updateOrder]);

  const handleDragStart = useCallback(
    (event: React.DragEvent<HTMLElement>, noteId: string, previewSource?: HTMLElement | null) => {
      draggingIdRef.current = noteId;
      dragStartOrderRef.current = [...orderedIdsRef.current];
      setDraggingId(noteId);
      lastOrderKeyRef.current = null;
      event.dataTransfer.setData('text/plain', noteId);
      event.dataTransfer.effectAllowed = 'move';

      dragPreviewCleanupRef.current?.();
      const source =
        resolveThreadTrailDragPreviewSource(previewSource ?? event.currentTarget) ??
        previewSource ??
        null;
      const preview = applyHtml5DragPreview(event, source, {
        className: 'proto-thread-trail__drag-preview',
      });
      dragPreviewCleanupRef.current = preview?.cleanup ?? null;

      event.stopPropagation();
      const handle = event.currentTarget;
      handle.blur();
      if (document.activeElement instanceof HTMLElement && document.activeElement !== handle) {
        document.activeElement.blur();
      }
    },
    [],
  );

  const handleDragEnd = useCallback(
    (event: React.DragEvent<HTMLElement>) => {
      persistPendingOrder();
      finishDrag();
      event.currentTarget.blur();
    },
    [finishDrag, persistPendingOrder],
  );

  const handleDragOver = useCallback(
    (event: React.DragEvent<HTMLElement>, insertBeforeIndex: number) => {
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = 'move';
      const dragged = draggingIdRef.current;
      if (!dragged) return;
      moveMember(dragged, insertBeforeIndex);
    },
    [moveMember],
  );

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();
      persistPendingOrder();
      finishDrag();
    },
    [finishDrag, persistPendingOrder],
  );

  return {
    draggingId,
    displayOrderedIds,
    showDragHandle,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDrop,
    isReordering: updateOrder.isPending,
  };
}
