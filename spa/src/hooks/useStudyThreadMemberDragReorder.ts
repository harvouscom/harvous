import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { arrayMove } from '@dnd-kit/sortable';
import {
  patchStudyThreadMemberOrderInCache,
  useUpdateStudyThreadMemberOrder,
} from './mutations/useUpdateStudyThreadMemberOrder';

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

/**
 * Order state for one study-thread member list (sidebar drill + thread panel).
 *
 * The gesture itself belongs to dnd-kit — see `ProtoThreadTrailSortable`, and
 * `useSharedSpaceSwitcherDragReorder`, which made this move first. This owns the
 * optimistic order and the write-back, nothing else.
 *
 * It used to own an HTML5 drag implementation too, which is why reordering was
 * desktop-only: `draggable` + dragstart/dragover/drop do not fire on touch at
 * all, so the handle was hidden on coarse pointers rather than degrading.
 * Pointer/touch sensors replaced it.
 */
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
  const optimisticOrderRef = useRef<string[] | null>(null);

  useEffect(() => {
    if (draggingIdRef.current) return;

    if (optimisticOrderRef.current) {
      if (sameIdOrder(optimisticOrderRef.current, orderedNoteIds)) {
        optimisticOrderRef.current = null;
      } else if (sameIdMembership(optimisticOrderRef.current, orderedNoteIds)) {
        // Same notes, different order — the server just hasn't caught up with the drag
        // that is already on screen. Holding the optimistic order is the whole point.
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

    setDisplayOrderedIds(orderedNoteIds);
  }, [orderedNoteIds]);

  /**
   * The handle is a cue and a keyboard activator, not the drag surface — touch
   * starts the gesture from the row. So this is no longer gated on pointer type;
   * it only asks whether there is anything to reorder.
   */
  const showDragHandle = enabled && orderedNoteIds.length > 1;

  const handleDragStart = useCallback((id: string) => {
    draggingIdRef.current = id;
    setDraggingId(id);
  }, []);

  const handleDragCancel = useCallback(() => {
    draggingIdRef.current = null;
    setDraggingId(null);
  }, []);

  /** `overId` is the row the pointer released on; null / same id is a no-op drop. */
  const handleDragEnd = useCallback(
    (activeId: string, overId: string | null) => {
      draggingIdRef.current = null;
      setDraggingId(null);
      if (!overId || overId === activeId || !anchorNoteId) return;

      setDisplayOrderedIds((current) => {
        const fromIndex = current.indexOf(activeId);
        const toIndex = current.indexOf(overId);
        if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return current;

        const next = arrayMove(current, fromIndex, toIndex);
        optimisticOrderRef.current = next;
        patchStudyThreadMemberOrderInCache(queryClient, spaceId, next);
        updateOrder.mutate({ anchorNoteId, spaceId, orderedNoteIds: next });
        return next;
      });
    },
    [anchorNoteId, queryClient, spaceId, updateOrder]
  );

  return {
    draggingId,
    displayOrderedIds,
    showDragHandle,
    handleDragStart,
    handleDragEnd,
    handleDragCancel,
    isReordering: updateOrder.isPending
  };
}
