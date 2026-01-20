import { useEffect, useRef } from 'react';

interface UseBottomSheetDragOptions {
  onDismiss: () => void;
  enabled?: boolean;
}

const DISTANCE_THRESHOLD = 100; // px - dismiss if dragged this far
const VELOCITY_THRESHOLD = 0.3; // px/ms - dismiss on quick swipe
const MIN_DRAG_DISTANCE = 5; // px - minimum distance to start drag

/**
 * Attaches drag-to-dismiss functionality to a bottom sheet.
 * Uses direct DOM manipulation to avoid React state updates that could cause re-renders.
 * 
 * @param onDismiss - Function to call when the sheet should be dismissed
 * @param enabled - Whether the drag functionality is enabled (default: true)
 * @returns A ref callback to attach to the sheet element
 */
export function useBottomSheetDrag({ onDismiss, enabled = true }: UseBottomSheetDragOptions) {
  const sheetRef = useRef<HTMLElement | null>(null);
  const stateRef = useRef({
    isDragging: false,
    startY: 0,
    currentY: 0,
    startTime: 0,
    startX: 0,
  });

  useEffect(() => {
    const sheet = sheetRef.current;
    if (!sheet || !enabled) return;

    const handleTouchStart = (e: TouchEvent) => {
      // Don't interfere with interactive elements
      const target = e.target as HTMLElement;
      if (target?.closest('button, a, input, textarea, select, [role="button"]')) {
        return;
      }

      // Check if there's scrollable content that's not at the top
      const scrollableContent = sheet.querySelector('.mobile-nav__sheet-inner, .bottom-sheet__inner');
      if (scrollableContent && scrollableContent.scrollTop > 0) {
        // Content is scrolled down, don't allow drag - let scroll happen
        return;
      }

      stateRef.current = {
        isDragging: false,
        startY: e.touches[0].clientY,
        currentY: e.touches[0].clientY,
        startTime: Date.now(),
        startX: e.touches[0].clientX,
      };
    };

    const handleTouchMove = (e: TouchEvent) => {
      const state = stateRef.current;
      if (state.startY === 0) return; // Touch didn't start in valid area

      const currentY = e.touches[0].clientY;
      const currentX = e.touches[0].clientX;
      const deltaY = currentY - state.startY;
      const deltaX = Math.abs(currentX - state.startX);

      // Only allow downward drags
      if (deltaY < 0) return;

      // If horizontal movement is greater, don't treat as drag
      if (deltaX > deltaY && !state.isDragging) return;

      // Check if we've moved enough to start dragging
      if (!state.isDragging && deltaY < MIN_DRAG_DISTANCE) {
        return;
      }

      // Start dragging - directly manipulate DOM
      if (!state.isDragging) {
        state.isDragging = true;
        sheet.style.transition = 'none';
      }

      e.preventDefault();
      state.currentY = currentY;
      
      // Apply transform directly to DOM
      sheet.style.transform = `translateY(${deltaY}px)`;
    };

    const handleTouchEnd = () => {
      const state = stateRef.current;
      
      if (!state.isDragging) {
        // Reset state
        stateRef.current = { isDragging: false, startY: 0, currentY: 0, startTime: 0, startX: 0 };
        return;
      }

      const deltaY = state.currentY - state.startY;
      const deltaTime = Date.now() - state.startTime;
      const velocity = deltaTime > 0 ? deltaY / deltaTime : 0;

      // Determine if we should dismiss
      const shouldDismiss = deltaY > DISTANCE_THRESHOLD || velocity > VELOCITY_THRESHOLD;

      if (shouldDismiss) {
        // Animate out and dismiss
        sheet.style.transition = 'transform 0.2s ease-out';
        sheet.style.transform = 'translateY(100%)';
        
        setTimeout(() => {
          sheet.style.transform = '';
          sheet.style.transition = '';
          onDismiss();
        }, 200);
      } else {
        // Snap back
        sheet.style.transition = 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
        sheet.style.transform = '';
        
        setTimeout(() => {
          sheet.style.transition = '';
        }, 300);
      }

      // Reset state
      stateRef.current = { isDragging: false, startY: 0, currentY: 0, startTime: 0, startX: 0 };
    };

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
  }, [onDismiss, enabled]);

  // Return a ref callback that can be used with the sheet element
  const setRef = (el: HTMLElement | null) => {
    sheetRef.current = el;
  };

  return setRef;
}
