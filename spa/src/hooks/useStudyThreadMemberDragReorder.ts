import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  patchStudyThreadMemberOrderInCache,
  useUpdateStudyThreadMemberOrder,
} from './mutations/useUpdateStudyThreadMemberOrder';
import { computeStudyThreadMemberMoveIndex } from './study-thread-member-move-index';

interface UseStudyThreadMemberDragReorderOptions {
  anchorNoteId: string;
  spaceId: string;
  orderedNoteIds: string[];
  enabled?: boolean;
}

function sameIdOrder(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

const EMPTY_DRAG_IMAGE = (() => {
  if (typeof document === 'undefined') return null;
  const img = new Image();
  img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAUEBAAAACwAAAAAAQABAAACAkQBADs=';
  return img;
})();

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

  useEffect(() => {
    if (draggingIdRef.current) return;

    if (optimisticOrderRef.current) {
      if (sameIdOrder(optimisticOrderRef.current, orderedNoteIds)) {
        optimisticOrderRef.current = null;
      } else {
        orderedIdsRef.current = optimisticOrderRef.current;
        setDisplayOrderedIds(optimisticOrderRef.current);
        return;
      }
    }

    orderedIdsRef.current = orderedNoteIds;
    setDisplayOrderedIds(orderedNoteIds);
  }, [orderedNoteIds]);

  const showDragHandle = enabled && orderedNoteIds.length > 1;

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

  const handleDragStart = useCallback((event: React.DragEvent<HTMLElement>, noteId: string) => {
    draggingIdRef.current = noteId;
    dragStartOrderRef.current = [...orderedIdsRef.current];
    setDraggingId(noteId);
    lastOrderKeyRef.current = null;
    event.dataTransfer.setData('text/plain', noteId);
    event.dataTransfer.effectAllowed = 'move';
    if (EMPTY_DRAG_IMAGE) {
      event.dataTransfer.setDragImage(EMPTY_DRAG_IMAGE, 0, 0);
    }
    event.stopPropagation();
    const handle = event.currentTarget;
    handle.blur();
    if (document.activeElement instanceof HTMLElement && document.activeElement !== handle) {
      document.activeElement.blur();
    }
  }, []);

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
