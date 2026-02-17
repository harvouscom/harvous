import { useEffect, useRef, useCallback } from 'react';

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
 * Listeners are attached directly in the ref callback to avoid timing issues
 * where useEffect runs before the ref is set.
 * 
 * @param onDismiss - Function to call when the sheet should be dismissed
 * @param enabled - Whether the drag functionality is enabled (default: true)
 * @returns A ref callback to attach to the sheet element
 */
export function useBottomSheetDrag({ onDismiss, enabled = true }: UseBottomSheetDragOptions) {
  const cleanupRef = useRef<(() => void) | null>(null);
  const onDismissRef = useRef(onDismiss);
  const enabledRef = useRef(enabled);
  
  // Keep refs in sync with props
  useEffect(() => {
    onDismissRef.current = onDismiss;
    enabledRef.current = enabled;
  }, [onDismiss, enabled]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
        cleanupRef.current = null;
      }
    };
  }, []);

  // Ref callback that attaches listeners immediately when element is available
  const setRef = useCallback((el: HTMLElement | null) => {
    // Cleanup previous listeners
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }

    if (!el) return;

    // Drag state (stored in closure, not React state)
    const state = {
      isDragging: false,
      startY: 0,
      currentY: 0,
      startTime: 0,
      startX: 0,
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (!enabledRef.current) return;

      // Don't interfere with interactive elements
      const target = e.target as HTMLElement;
      if (target?.closest('button, a, input, textarea, select, [role="button"]')) {
        return;
      }

      // Check for scrollable content - including nested TiptapEditor
      const scrollableContent = el.querySelector('.mobile-nav__sheet-inner, .bottom-sheet__inner');
      const tiptapContent = el.querySelector('.tiptap-content') as HTMLElement;

      // Check if touch target is within a scrollable element
      const scrollableElement = target.closest('.tiptap-content, .mobile-nav__sheet-inner, .bottom-sheet__inner') as HTMLElement;

      // If we're in a scrollable element, check its scroll position
      if (scrollableElement) {
        if (scrollableElement.scrollTop > 0) {
          // Content is scrolled down, don't allow drag - let scroll happen
          return;
        }
      }

      // Also check parent containers for scroll position
      if (scrollableContent && scrollableContent.scrollTop > 0) {
        return;
      }
      if (tiptapContent && tiptapContent.scrollTop > 0) {
        return;
      }

      state.isDragging = false;
      state.startY = e.touches[0].clientY;
      state.currentY = e.touches[0].clientY;
      state.startTime = Date.now();
      state.startX = e.touches[0].clientX;
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!enabledRef.current) return;
      if (state.startY === 0) return; // Touch didn't start in valid area

      const currentY = e.touches[0].clientY;
      const currentX = e.touches[0].clientX;
      const deltaY = currentY - state.startY;
      const deltaX = Math.abs(currentX - state.startX);

      // Only allow downward drags
      if (deltaY < 0) return;

      // If horizontal movement is greater, don't treat as drag
      if (deltaX > deltaY && !state.isDragging) return;

      // Before starting drag, check if we're in a scrollable element that can still scroll
      const target = e.target as HTMLElement;
      const scrollableElement = target.closest('.tiptap-content, .mobile-nav__sheet-inner, .bottom-sheet__inner') as HTMLElement;

      if (scrollableElement && !state.isDragging) {
        // Check if element can scroll in the direction we're moving
        const canScrollDown = scrollableElement.scrollTop < (scrollableElement.scrollHeight - scrollableElement.clientHeight);
        const canScrollUp = scrollableElement.scrollTop > 0;
        
        // If moving down and element can scroll down, allow scrolling instead of drag
        if (deltaY > 0 && canScrollDown) {
          return; // Let native scroll happen
        }
        
        // If moving up and element can scroll up, allow scrolling
        if (deltaY < 0 && canScrollUp) {
          return; // Let native scroll happen
        }
        
        // Only allow drag if scrollable element is at its boundary
        // For downward drag, element must be at top (scrollTop === 0)
        if (deltaY > 0 && scrollableElement.scrollTop > 0) {
          return; // Still can scroll, don't drag
        }
      }

      // Check if we've moved enough to start dragging
      if (!state.isDragging && deltaY < MIN_DRAG_DISTANCE) {
        return;
      }

      // Start dragging - directly manipulate DOM
      if (!state.isDragging) {
        state.isDragging = true;
        el.style.transition = 'none';
      }

      e.preventDefault();
      state.currentY = currentY;

      // Apply transform with !important to override CSS animations
      el.style.setProperty('transform', `translateY(${deltaY}px)`, 'important');
      el.style.setProperty('will-change', 'transform', 'important');

      // Find and update overlay opacity for visual feedback
      const overlay = document.querySelector('.sheet-overlay') as HTMLElement;
      if (overlay) {
        // Calculate opacity: fade backdrop as sheet is dragged down
        // Max drag distance of ~300px for full fade, minimum opacity of 0.3
        const maxDrag = 300;
        const minOpacity = 0.3;
        const opacity = Math.max(minOpacity, 1 - (deltaY / maxDrag));
        overlay.style.opacity = opacity.toString();
        overlay.style.transition = 'none'; // Disable transition during drag
      }
    };

    const handleTouchEnd = () => {
      if (!state.isDragging) {
        // Reset state
        state.startY = 0;
        state.currentY = 0;
        state.startTime = 0;
        state.startX = 0;
        return;
      }

      const deltaY = state.currentY - state.startY;
      const deltaTime = Date.now() - state.startTime;
      const velocity = deltaTime > 0 ? deltaY / deltaTime : 0;

      // Determine if we should dismiss
      const shouldDismiss = deltaY > DISTANCE_THRESHOLD || velocity > VELOCITY_THRESHOLD;

      // Reset transform and will-change
      el.style.removeProperty('will-change');

      const overlay = document.querySelector('.sheet-overlay') as HTMLElement;

      if (shouldDismiss) {
        // Fade overlay out alongside the sheet slide-out
        if (overlay) {
          overlay.style.transition = 'opacity 0.2s ease-out';
          overlay.style.opacity = '0';
        }

        // Animate out and dismiss
        el.style.transition = 'transform 0.2s ease-out';
        el.style.setProperty('transform', 'translateY(100%)', 'important');

        setTimeout(() => {
          el.style.removeProperty('transform');
          el.style.transition = '';
          // Clear inline overlay styles so Radix's data-state CSS takes over cleanly
          if (overlay) {
            overlay.style.opacity = '';
            overlay.style.transition = '';
          }
          onDismissRef.current();
        }, 200);
      } else {
        // Snap back: restore overlay to full opacity
        if (overlay) {
          overlay.style.transition = 'opacity 0.3s ease-out';
          overlay.style.opacity = '1';
          setTimeout(() => {
            overlay.style.transition = '';
            overlay.style.opacity = '';
          }, 300);
        }

        // Snap back sheet
        el.style.transition = 'transform 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
        el.style.removeProperty('transform');

        setTimeout(() => {
          el.style.transition = '';
        }, 300);
      }

      // Reset state
      state.isDragging = false;
      state.startY = 0;
      state.currentY = 0;
      state.startTime = 0;
      state.startX = 0;
    };

    // Attach listeners
    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchmove', handleTouchMove, { passive: false });
    el.addEventListener('touchend', handleTouchEnd, { passive: true });
    el.addEventListener('touchcancel', handleTouchEnd, { passive: true });

    // Store cleanup function
    cleanupRef.current = () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
      el.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, []); // No dependencies - we use refs for latest values

  return setRef;
}
