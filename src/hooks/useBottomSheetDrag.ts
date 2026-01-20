import { useEffect, useRef, useState, useCallback } from 'react';

interface UseBottomSheetDragOptions {
  sheetRef: React.RefObject<HTMLElement>;
  onDismiss: () => Promise<void> | void;
  isOpen: boolean;
}

interface DragState {
  isDragging: boolean;
  startY: number;
  currentY: number;
  startTime: number;
  isSnappingBack: boolean;
}

const DISTANCE_THRESHOLD = 150; // px - dismiss if dragged this far
const VELOCITY_THRESHOLD = 0.5; // px/ms - dismiss on quick swipe
const MIN_DRAG_DISTANCE = 10; // px - minimum distance to start drag (prevents accidental drags)

export function useBottomSheetDrag({ sheetRef, onDismiss, isOpen }: UseBottomSheetDragOptions) {
  const [dragY, setDragY] = useState(0);
  const [isSnappingBack, setIsSnappingBack] = useState(false);
  const dragStateRef = useRef<DragState>({
    isDragging: false,
    startY: 0,
    currentY: 0,
    startTime: 0,
    isSnappingBack: false,
  });

  // Reset drag state when sheet closes
  useEffect(() => {
    if (!isOpen) {
      setDragY(0);
      setIsSnappingBack(false);
      dragStateRef.current = {
        isDragging: false,
        startY: 0,
        currentY: 0,
        startTime: 0,
        isSnappingBack: false,
      };
    }
  }, [isOpen]);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    const sheet = sheetRef.current;
    if (!sheet) return;

    // Don't interfere with interactive elements (buttons, links, inputs)
    const target = e.target as HTMLElement;
    if (target) {
      const isInteractive = target.closest('button, a, input, textarea, select, [role="button"]');
      if (isInteractive) return;
    }

    // Only allow drag from the top portion of the sheet (first 100px)
    const rect = sheet.getBoundingClientRect();
    const touchY = e.touches[0].clientY;
    const relativeY = touchY - rect.top;
    
    // Only start drag if touching near the top of the sheet
    if (relativeY > 100) return;

    // Check if content is scrollable and not at top
    const scrollableContent = sheet.querySelector('.bottom-sheet__inner, .mobile-nav__sheet-inner');
    if (scrollableContent) {
      const isScrollable = scrollableContent.scrollHeight > scrollableContent.clientHeight;
      const isAtTop = scrollableContent.scrollTop === 0;
      
      // If content is scrollable and not at top, let native scroll happen
      if (isScrollable && !isAtTop) {
        return;
      }
    }

    dragStateRef.current = {
      isDragging: false, // Don't set to true until we've moved MIN_DRAG_DISTANCE
      startY: e.touches[0].clientY,
      currentY: e.touches[0].clientY,
      startTime: Date.now(),
      isSnappingBack: false,
    };
  }, [sheetRef]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    const state = dragStateRef.current;
    if (state.isSnappingBack) return;

    const currentY = e.touches[0].clientY;
    const deltaY = currentY - state.startY;
    const deltaX = Math.abs(e.touches[0].clientX - (e.touches[0].clientX)); // Placeholder for horizontal check

    // Only allow downward drags (positive deltaY)
    if (deltaY < 0) return;

    // Check if we've moved enough to start dragging
    if (!state.isDragging && deltaY < MIN_DRAG_DISTANCE) {
      return;
    }

    // Start dragging
    if (!state.isDragging) {
      state.isDragging = true;
      // Prevent default to stop any scrolling
      e.preventDefault();
    }

    // Prevent default once we're dragging
    if (state.isDragging) {
      e.preventDefault();
      state.currentY = currentY;
      setDragY(deltaY);
    }
  }, []);

  const handleTouchEnd = useCallback(async () => {
    const state = dragStateRef.current;
    if (!state.isDragging) {
      // Reset state if we never actually started dragging
      dragStateRef.current = {
        isDragging: false,
        startY: 0,
        currentY: 0,
        startTime: 0,
        isSnappingBack: false,
      };
      return;
    }

    const deltaY = state.currentY - state.startY;
    const deltaTime = Date.now() - state.startTime;
    const velocity = deltaTime > 0 ? deltaY / deltaTime : 0;

    // Determine if we should dismiss
    const shouldDismiss = deltaY > DISTANCE_THRESHOLD || velocity > VELOCITY_THRESHOLD;

    if (shouldDismiss) {
      // Dismiss the sheet
      state.isSnappingBack = true;
      await onDismiss();
      
      // Reset after dismiss animation completes
      setTimeout(() => {
        setDragY(0);
        setIsSnappingBack(false);
        dragStateRef.current = {
          isDragging: false,
          startY: 0,
          currentY: 0,
          startTime: 0,
          isSnappingBack: false,
        };
      }, 300);
    } else {
      // Snap back
      setIsSnappingBack(true);
      state.isSnappingBack = true;
      setDragY(0);
      
      // Reset after snap-back animation
      setTimeout(() => {
        setIsSnappingBack(false);
        dragStateRef.current = {
          isDragging: false,
          startY: 0,
          currentY: 0,
          startTime: 0,
          isSnappingBack: false,
        };
      }, 300);
    }
  }, [onDismiss]);

  // Attach touch event listeners
  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet || !isOpen) return;

    sheet.addEventListener('touchstart', handleTouchStart, { passive: true });
    sheet.addEventListener('touchmove', handleTouchMove, { passive: false });
    sheet.addEventListener('touchend', handleTouchEnd, { passive: true });
    sheet.addEventListener('touchcancel', handleTouchEnd, { passive: true });

    return () => {
      sheet.removeEventListener('touchstart', handleTouchStart);
      sheet.removeEventListener('touchmove', handleTouchMove);
      sheet.removeEventListener('touchend', handleTouchEnd);
      sheet.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [sheetRef, isOpen, handleTouchStart, handleTouchMove, handleTouchEnd]);

  return {
    dragY,
    isSnappingBack,
    isDragging: dragStateRef.current.isDragging,
  };
}
