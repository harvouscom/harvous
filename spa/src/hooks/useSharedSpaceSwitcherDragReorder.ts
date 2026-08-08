import { useCallback, useEffect, useRef, useState } from 'react';
import { arrayMove } from '@dnd-kit/sortable';
import { useUpdateSharedSpaceSwitcherOrder } from './mutations/useUpdateSharedSpaceSwitcherOrder';
import { mergeSwitcherOrder } from '../lib/shared-space-switcher-order';

function sameIdOrder(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

/**
 * Order state for one shared-space switcher list.
 *
 * The gesture itself belongs to dnd-kit (see `SpaceSwitcherMenu`) — this owns the
 * optimistic order and the write-back. It used to own an HTML5 drag implementation too,
 * which is why reordering was desktop-only: `draggable` + dragstart/dragover/drop do not
 * fire on touch at all, so the handle was hidden on coarse pointers rather than degrading.
 * Pointer/touch sensors replaced it.
 */
export function useSharedSpaceSwitcherDragReorder({
  orderedSpaceIds,
  storedOrder,
}: {
  orderedSpaceIds: string[];
  /**
   * The full stored preference (`profile.sharedSpaceSwitcherOrder`). Every list writes
   * back to that one array, so it has to be carried through — see `mergeSwitcherOrder`.
   */
  storedOrder?: readonly string[] | null;
}) {
  const updateOrder = useUpdateSharedSpaceSwitcherOrder();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [displayOrderedIds, setDisplayOrderedIds] = useState(orderedSpaceIds);
  const optimisticOrderRef = useRef<string[] | null>(null);
  const draggingIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (draggingIdRef.current) return;

    if (optimisticOrderRef.current) {
      if (sameIdOrder(optimisticOrderRef.current, orderedSpaceIds)) {
        optimisticOrderRef.current = null;
      } else {
        setDisplayOrderedIds(optimisticOrderRef.current);
        return;
      }
    }

    setDisplayOrderedIds(orderedSpaceIds);
  }, [orderedSpaceIds]);

  const storedOrderRef = useRef(storedOrder);
  storedOrderRef.current = storedOrder;

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
      if (!overId || overId === activeId) return;

      setDisplayOrderedIds((current) => {
        const fromIndex = current.indexOf(activeId);
        const toIndex = current.indexOf(overId);
        // A drop on a row from the other list resolves to -1 here. Bail rather than
        // splice at the end, which would silently move the row to the bottom.
        if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return current;

        const next = arrayMove(current, fromIndex, toIndex);
        optimisticOrderRef.current = next;
        updateOrder.mutate(mergeSwitcherOrder(next, storedOrderRef.current));
        return next;
      });
    },
    [updateOrder],
  );

  return {
    draggingId,
    displayOrderedIds,
    isDragging: draggingId != null,
    handleDragStart,
    handleDragEnd,
    handleDragCancel,
    isReordering: updateOrder.isPending,
  };
}
