import { useCallback, useEffect, useRef } from 'react';

interface UseSwipeNavigationOptions {
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  enabled?: boolean;
  canSwipeLeft?: boolean;
  canSwipeRight?: boolean;
}

const DISTANCE_THRESHOLD = 50;
const VELOCITY_THRESHOLD = 0.3;
const EDGE_EXCLUSION_PX = 20;
const LOCK_THRESHOLD = 10;
const DAMPING = 0.65;
const DAMPING_INVALID = 0.15;
const SLIDE_OUT_MS = 180;
const SPRING_BACK_MS = 250;

export function useSwipeNavigation({
  onSwipeLeft,
  onSwipeRight,
  enabled = true,
  canSwipeLeft = true,
  canSwipeRight = true
}: UseSwipeNavigationOptions) {
  const cleanupRef = useRef<(() => void) | null>(null);
  const enabledRef = useRef(enabled);
  const onSwipeLeftRef = useRef(onSwipeLeft);
  const onSwipeRightRef = useRef(onSwipeRight);
  const canSwipeLeftRef = useRef(canSwipeLeft);
  const canSwipeRightRef = useRef(canSwipeRight);

  useEffect(() => {
    enabledRef.current = enabled;
    onSwipeLeftRef.current = onSwipeLeft;
    onSwipeRightRef.current = onSwipeRight;
    canSwipeLeftRef.current = canSwipeLeft;
    canSwipeRightRef.current = canSwipeRight;
  }, [enabled, onSwipeLeft, onSwipeRight, canSwipeLeft, canSwipeRight]);

  useEffect(() => {
    return () => cleanupRef.current?.();
  }, []);

  const setRef = useCallback((el: HTMLElement | null) => {
    cleanupRef.current?.();
    cleanupRef.current = null;
    if (!el) return;

    // Tell the browser we only need native vertical panning;
    // horizontal movement is handled entirely by JS. This eliminates
    // "[Intervention] Unable to preventDefault inside passive event
    // listener" warnings because the browser never starts a horizontal
    // scroll gesture — no preventDefault needed.
    el.style.touchAction = 'pan-y';

    const state = {
      tracking: false,
      locked: false as false | 'horizontal' | 'vertical',
      startX: 0,
      startY: 0,
      currentX: 0,
      currentY: 0,
      startTime: 0,
      peekEl: null as HTMLElement | null
    };

    const getScrollEl = (): HTMLElement | null =>
      el.querySelector('.main-column__scroll');

    const getDockEl = (): HTMLElement | null =>
      el.querySelector('.mobile-action-strip-dock');

    const isBottomSheetOpen = () => {
      const root = document.getElementById('layout-root');
      return !!root?.classList.contains('bottom-sheet-open');
    };

    const setDockVisible = (visible: boolean) => {
      const dock = getDockEl();
      if (!dock) return;
      if (visible) {
        dock.style.removeProperty('opacity');
        dock.style.removeProperty('pointer-events');
        dock.style.removeProperty('transition');
      } else {
        dock.style.transition = 'opacity 0.12s ease-out';
        dock.style.opacity = '0';
        dock.style.pointerEvents = 'none';
      }
    };

    const createPeekCard = (): HTMLElement => {
      if (state.peekEl) return state.peekEl;
      const peek = document.createElement('div');
      Object.assign(peek.style, {
        position: 'absolute',
        top: '0',
        left: '0',
        right: '0',
        bottom: '0',
        background: '#fff',
        borderRadius: '24px',
        zIndex: '0',
        pointerEvents: 'none',
        willChange: 'transform, opacity',
        transform: 'scale(0.94)',
        opacity: '0.5',
        transition: 'none'
      });
      const scrollEl = getScrollEl();
      if (scrollEl) {
        el.insertBefore(peek, scrollEl);
      } else {
        el.appendChild(peek);
      }
      state.peekEl = peek;
      return peek;
    };

    const removePeekCard = () => {
      if (state.peekEl) {
        state.peekEl.remove();
        state.peekEl = null;
      }
    };

    const updatePeek = (progress: number, valid: boolean) => {
      if (!state.peekEl) return;
      if (!valid) {
        state.peekEl.style.transform = 'scale(0.94)';
        state.peekEl.style.opacity = '0.5';
        return;
      }
      const t = Math.min(progress, 1);
      state.peekEl.style.transform = `scale(${0.94 + 0.06 * t})`;
      state.peekEl.style.opacity = String(0.5 + 0.5 * t);
    };

    const applyTranslate = (px: number) => {
      const scrollEl = getScrollEl();
      if (!scrollEl) return;
      scrollEl.style.transition = 'none';
      scrollEl.style.transform = `translateX(${px}px)`;
      scrollEl.style.willChange = 'transform';
    };

    const clearTransform = (scrollEl: HTMLElement) => {
      scrollEl.style.removeProperty('transform');
      scrollEl.style.removeProperty('transition');
      scrollEl.style.removeProperty('will-change');
      scrollEl.style.removeProperty('opacity');
    };

    const endSwipe = () => {
      el.style.overflow = 'visible';
      setDockVisible(true);
      removePeekCard();
    };

    const animateSpringBack = () => {
      const scrollEl = getScrollEl();
      if (!scrollEl) { endSwipe(); return; }
      scrollEl.style.transition = `transform ${SPRING_BACK_MS}ms cubic-bezier(0.16, 1, 0.3, 1)`;
      scrollEl.style.transform = 'translateX(0)';
      setTimeout(() => {
        clearTransform(scrollEl);
        endSwipe();
      }, SPRING_BACK_MS);
    };

    const animateSlideOut = (direction: 'left' | 'right', callback: () => void) => {
      const scrollEl = getScrollEl();
      if (!scrollEl) { endSwipe(); callback(); return; }
      const target = direction === 'left' ? -window.innerWidth * 0.35 : window.innerWidth * 0.35;
      scrollEl.style.transition = `transform ${SLIDE_OUT_MS}ms ease-in, opacity ${SLIDE_OUT_MS}ms ease-in`;
      scrollEl.style.transform = `translateX(${target}px)`;
      scrollEl.style.opacity = '0';
      if (state.peekEl) {
        state.peekEl.style.transition = `transform ${SLIDE_OUT_MS}ms ease-out, opacity ${SLIDE_OUT_MS}ms ease-out`;
        state.peekEl.style.transform = 'scale(1)';
        state.peekEl.style.opacity = '1';
      }
      setTimeout(() => {
        clearTransform(scrollEl);
        endSwipe();
        callback();
      }, SLIDE_OUT_MS);
    };

    const onTouchStart = (event: TouchEvent) => {
      if (!enabledRef.current || isBottomSheetOpen()) return;
      const touch = event.touches[0];
      if (!touch) return;
      if (touch.clientX <= EDGE_EXCLUSION_PX || touch.clientX >= window.innerWidth - EDGE_EXCLUSION_PX) return;
      const target = event.target as HTMLElement | null;
      if (target?.closest('button, a, input, textarea, select, [role="button"]')) return;
      state.tracking = true;
      state.locked = false;
      state.startX = touch.clientX;
      state.startY = touch.clientY;
      state.currentX = touch.clientX;
      state.currentY = touch.clientY;
      state.startTime = Date.now();
    };

    const onTouchMove = (event: TouchEvent) => {
      if (!state.tracking) return;
      const touch = event.touches[0];
      if (!touch) return;
      state.currentX = touch.clientX;
      state.currentY = touch.clientY;
      const deltaX = Math.abs(state.currentX - state.startX);
      const deltaY = Math.abs(state.currentY - state.startY);

      if (!state.locked && (deltaX > LOCK_THRESHOLD || deltaY > LOCK_THRESHOLD)) {
        state.locked = deltaX > deltaY * 1.5 ? 'horizontal' : 'vertical';
        if (state.locked === 'horizontal') {
          el.style.overflow = 'hidden';
          setDockVisible(false);
          createPeekCard();
        }
      }

      if (state.locked === 'horizontal') {
        const rawDelta = state.currentX - state.startX;
        const valid = rawDelta < 0 ? canSwipeLeftRef.current : canSwipeRightRef.current;
        const damping = valid ? DAMPING : DAMPING_INVALID;
        const translated = rawDelta * damping;
        applyTranslate(translated);
        updatePeek(Math.abs(translated) / DISTANCE_THRESHOLD, valid);
      }

      if (state.locked === 'vertical') {
        state.tracking = false;
      }
    };

    const onTouchEnd = () => {
      if (!state.tracking) {
        state.locked = false;
        return;
      }
      const deltaX = state.currentX - state.startX;
      const deltaTime = Date.now() - state.startTime;
      const velocityX = deltaTime > 0 ? Math.abs(deltaX) / deltaTime : 0;
      const valid = deltaX < 0 ? canSwipeLeftRef.current : canSwipeRightRef.current;
      const meetsThreshold = Math.abs(deltaX) > DISTANCE_THRESHOLD || velocityX > VELOCITY_THRESHOLD;
      const confirmed = state.locked === 'horizontal' && valid && meetsThreshold;

      if (confirmed) {
        const direction = deltaX < 0 ? 'left' : 'right';
        const cb = direction === 'left' ? onSwipeLeftRef.current : onSwipeRightRef.current;
        animateSlideOut(direction, cb);
      } else if (state.locked === 'horizontal') {
        animateSpringBack();
      }

      state.tracking = false;
      state.locked = false;
      state.startX = 0;
      state.startY = 0;
      state.currentX = 0;
      state.currentY = 0;
      state.startTime = 0;
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: true });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchEnd, { passive: true });

    cleanupRef.current = () => {
      el.style.removeProperty('touch-action');
      removePeekCard();
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchEnd);
    };
  }, []);

  return setRef;
}
