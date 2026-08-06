import { useCallback, useEffect, useRef, useState } from 'react';
import { applyHtml5DragPreview } from '@/utils/html5-drag-preview';
import { useUpdateSharedSpaceSwitcherOrder } from './mutations/useUpdateSharedSpaceSwitcherOrder';
import { computeStudyThreadMemberMoveIndex } from './study-thread-member-move-index';
import { normalizeSharedSpaceSwitcherId } from '../lib/shared-space-switcher-order';
import { useCoarsePointer } from '../lib/use-coarse-pointer';

function sameIdOrder(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

/** HTML5 drag reorder for the My Home shared-space switcher list. */
export function useSharedSpaceSwitcherDragReorder({
  orderedSpaceIds,
  enabled = true,
}: {
  orderedSpaceIds: string[];
  enabled?: boolean;
}) {
  const updateOrder = useUpdateSharedSpaceSwitcherOrder();
  const draggingIdRef = useRef<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [displayOrderedIds, setDisplayOrderedIds] = useState(orderedSpaceIds);
  const orderedIdsRef = useRef(orderedSpaceIds);
  const pendingOrderRef = useRef<string[] | null>(null);
  const lastOrderKeyRef = useRef<string | null>(null);
  const dragStartOrderRef = useRef<string[] | null>(null);
  const optimisticOrderRef = useRef<string[] | null>(null);
  const dragPreviewCleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (draggingIdRef.current) return;

    if (optimisticOrderRef.current) {
      if (sameIdOrder(optimisticOrderRef.current, orderedSpaceIds)) {
        optimisticOrderRef.current = null;
      } else {
        orderedIdsRef.current = optimisticOrderRef.current;
        setDisplayOrderedIds(optimisticOrderRef.current);
        return;
      }
    }

    orderedIdsRef.current = orderedSpaceIds;
    setDisplayOrderedIds(orderedSpaceIds);
  }, [orderedSpaceIds]);

  useEffect(() => {
    return () => {
      dragPreviewCleanupRef.current?.();
      dragPreviewCleanupRef.current = null;
    };
  }, []);

  /**
   * No drag handle on touch. Reordering here is HTML5 drag-and-drop
   * (`draggable` + dragstart/dragover/drop), which does not fire on touch at
   * all — so on a phone the handle was pure cost: a 22×28px `draggable` element
   * sitting exactly where the thumb lands, swallowing the first tap on a menu
   * row and buying nothing. Desktop keeps it; touch reordering would need a
   * real pointer-events sort, which this does not attempt.
   */
  const coarsePointer = useCoarsePointer();
  const showDragHandle = enabled && orderedSpaceIds.length > 1 && !coarsePointer;

  const moveItem = useCallback((draggedId: string, insertBeforeIndex: number) => {
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
    if (!next) return;
    if (baseline && sameIdOrder(baseline, next)) {
      optimisticOrderRef.current = null;
      return;
    }
    optimisticOrderRef.current = [...next];
    updateOrder.mutate(next.map(normalizeSharedSpaceSwitcherId));
  }, [updateOrder]);

  const handleDragStart = useCallback(
    (event: React.DragEvent<HTMLElement>, spaceId: string, rowEl?: HTMLElement | null) => {
      draggingIdRef.current = spaceId;
      dragStartOrderRef.current = [...orderedIdsRef.current];
      setDraggingId(spaceId);
      lastOrderKeyRef.current = null;
      event.dataTransfer.setData('text/plain', spaceId);
      event.dataTransfer.effectAllowed = 'move';

      dragPreviewCleanupRef.current?.();
      const source = rowEl ?? (event.currentTarget.closest('.proto-space-switcher__row') as HTMLElement | null);
      const preview = applyHtml5DragPreview(event, source, {
        className: 'proto-space-switcher__drag-preview',
      });
      dragPreviewCleanupRef.current = preview?.cleanup ?? null;

      event.stopPropagation();
      event.currentTarget.blur();
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
      moveItem(dragged, insertBeforeIndex);
    },
    [moveItem],
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
    isDragging: draggingId != null,
    handleDragStart,
    handleDragEnd,
    handleDragOver,
    handleDrop,
    isReordering: updateOrder.isPending,
  };
}
