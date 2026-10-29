import { useEffect } from 'react';
import { updateStudyDockExpandedMaxHeight } from '@/utils/study-dock-layout';
import { emitProtoViewportSettle } from '@/utils/proto-viewport-settle';

/* A phone-width shell, or any touch screen: iPad landscape and Pro Max landscape are ≥900
   wide but still get a soft keyboard that overlays the page. `any-pointer`, because a
   trackpad iPad reports a fine primary pointer. */
const MOBILE_QUERY = '(max-width: 899px), (any-pointer: coarse)';

/** True when the focused element can raise the soft keyboard. */
export function hasEditableFocus(doc: Document = document): boolean {
  const el = doc.activeElement as HTMLElement | null;
  if (!el || el === doc.body) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === 'TEXTAREA') return true;
  if (tag === 'INPUT') {
    const type = ((el as HTMLInputElement).type || 'text').toLowerCase();
    return !['button', 'checkbox', 'radio', 'range', 'submit', 'reset', 'file', 'color', 'image'].includes(type);
  }
  return false;
}

/**
 * Remove every trace of the keyboard-open frame. Exported so the shell can run it when the
 * route stops hosting an editor: the effect's own cleanup does this too, but a settle pass
 * queued by an earlier build of this hook (or a stray writer elsewhere) must never be able to
 * leave the shell frame at half height on Home or the reader.
 */
export function clearMobileKeyboardFrame(root: HTMLElement = document.documentElement): void {
  root.style.removeProperty('--proto-visible-viewport-height');
  root.removeAttribute('data-proto-keyboard-open');
  document.querySelectorAll<HTMLElement>('.proto-shell-frame').forEach((frame) => {
    frame.style.removeProperty('height');
    frame.style.removeProperty('max-height');
    frame.style.removeProperty('margin-top');
  });
}

/**
 * Mobile soft keyboard: shrink the shell frame to the visual viewport (above the keyboard)
 * so the in-flow editor chrome row (format toolbar) lands just above the keyboard, and hide
 * the study docks while typing. Scoped to routes hosting the note editor, on the mobile
 * breakpoint.
 *
 * Teardown is the part that matters most. Saving a compose on Home or the reader blurs the
 * editor (focusout → a settle pass queued for the next frame) in the same tick that the route
 * stops hosting the editor (cleanup). A settle pass that outlived cleanup used to write the
 * keyboard-height frame back with no listener left to undo it — the "half the screen is
 * clipped" bug. Every queued pass is now cancelled, and `apply` refuses to run once disposed.
 */
export function useMobileKeyboardFrame(active: boolean): void {
  useEffect(() => {
    if (!active) {
      // Nothing should be holding the frame when no editor is hosted.
      if (typeof document !== 'undefined' && document.documentElement.hasAttribute('data-proto-keyboard-open')) {
        clearMobileKeyboardFrame();
      }
      return undefined;
    }
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!vv) return undefined;
    const mq = window.matchMedia(MOBILE_QUERY);
    const root = document.documentElement;
    let disposed = false;
    let settleTimers: ReturnType<typeof setTimeout>[] = [];
    const rafs = new Set<number>();
    // Last committed frame geometry. `apply()` re-runs several times per settle window and is
    // usually a no-op; only announce the passes that actually moved the chrome, so overlay
    // consumers don't re-measure three times for nothing. See utils/proto-viewport-settle.ts.
    let appliedGeometry: string | null = null;
    const announceGeometry = (next: string | null) => {
      if (appliedGeometry === next) return;
      appliedGeometry = next;
      emitProtoViewportSettle();
    };
    const clearSettleTimers = () => {
      settleTimers.forEach((t) => clearTimeout(t));
      settleTimers = [];
    };
    const queueFrame = (fn: () => void) => {
      const id = requestAnimationFrame(() => {
        rafs.delete(id);
        fn();
      });
      rafs.add(id);
    };

    /*
     * The lock itself is `data-proto-keyboard-open`, set in `apply()` below — that is the
     * attribute `prototype-shell.css` hangs `overflow: hidden` on. What pinning contributes is
     * holding document scroll at 0: iOS can still pan the visual viewport to chase the caret
     * while document scroll is held, and that pan is what leaves a white strip under the
     * format bar.
     */
    const pinPageScroll = () => {
      if (window.scrollY !== 0 || vv.offsetTop !== 0) {
        window.scrollTo(0, 0);
      }
    };

    const clearKeyboardState = () => {
      clearMobileKeyboardFrame(root);
      if (window.scrollY !== 0) window.scrollTo(0, 0);
      announceGeometry(null);
    };

    // Size the shell frame to exactly the visual viewport (above the keyboard) and let the
    // editor chrome row (format toolbar) stay in normal flow at the frame's bottom edge.
    const apply = () => {
      if (disposed) return;
      updateStudyDockExpandedMaxHeight();
      if (!mq.matches) {
        clearKeyboardState();
        return;
      }
      // A shrunken visual viewport only means "keyboard" while something editable has focus.
      // iOS can leave vv.height short after the keyboard closes (resume from background, a
      // blur that lands mid-animation); without this gate the frame would stay half height.
      const keyboardOpen = vv.height < window.innerHeight * 0.75 && hasEditableFocus();
      if (!keyboardOpen) {
        clearKeyboardState();
        return;
      }
      // Pin first, then read: scrolling the document back to 0 can change vv.offsetTop, and a
      // margin computed from the pre-pin offset over-pushes the frame (gap above the toolbar)
      // while the editor's caret is painted against the settled one.
      pinPageScroll();
      const visibleHeight = Math.round(vv.height);
      const frameInset =
        parseFloat(getComputedStyle(root).getPropertyValue('--pds-shell-frame-inset')) || 8;
      // Anchor the frame to the *visual* viewport, not the layout top: push its top down by
      // offsetTop so it still sits `frameInset` below the visual top, and subtract the inset on
      // both ends so the bottom edge sits `frameInset` above the keyboard.
      const offsetTop = Math.max(0, Math.round(vv.offsetTop));
      const frameHeight = Math.max(120, visibleHeight - frameInset * 2);
      root.style.setProperty('--proto-visible-viewport-height', `${frameHeight}px`);
      root.setAttribute('data-proto-keyboard-open', '');
      document.querySelectorAll<HTMLElement>('.proto-shell-frame').forEach((frame) => {
        frame.style.height = `${frameHeight}px`;
        frame.style.maxHeight = `${frameHeight}px`;
        frame.style.marginTop = `${frameInset + offsetTop}px`;
      });
      announceGeometry(`${frameHeight}:${frameInset + offsetTop}`);
    };

    apply();
    queueFrame(apply);
    const onViewportChange = () => {
      apply();
      if (!disposed && root.hasAttribute('data-proto-keyboard-open')) pinPageScroll();
    };
    // visualViewport resize/scroll is the primary signal; focus nudges a re-apply across the
    // settle window. iOS finishes the keyboard animation over a few hundred ms — without
    // re-applying past that, the frame stays sized to a mid-animation height.
    const scheduleSettle = () => {
      if (disposed) return;
      queueFrame(apply);
      clearSettleTimers();
      settleTimers = [setTimeout(apply, 150), setTimeout(apply, 450)];
    };
    // Returning to the app (background → foreground, bfcache restore, window refocus) gets
    // no viewport event on iOS when the keyboard closed while we were away.
    const onVisibility = () => {
      if (document.visibilityState === 'visible') scheduleSettle();
    };
    vv.addEventListener('resize', onViewportChange);
    vv.addEventListener('scroll', onViewportChange);
    // Layout-viewport resize also shifts vv.height (rotation) and does not always emit a vv
    // resize — route it through apply() so the frame re-anchors.
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('pageshow', scheduleSettle);
    window.addEventListener('focus', scheduleSettle);
    document.addEventListener('visibilitychange', onVisibility);
    document.addEventListener('focusin', scheduleSettle);
    document.addEventListener('focusout', scheduleSettle);

    return () => {
      disposed = true;
      rafs.forEach((id) => cancelAnimationFrame(id));
      rafs.clear();
      clearSettleTimers();
      vv.removeEventListener('resize', onViewportChange);
      vv.removeEventListener('scroll', onViewportChange);
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('pageshow', scheduleSettle);
      window.removeEventListener('focus', scheduleSettle);
      document.removeEventListener('visibilitychange', onVisibility);
      document.removeEventListener('focusin', scheduleSettle);
      document.removeEventListener('focusout', scheduleSettle);
      root.style.removeProperty('--proto-dock-expanded-max-height');
      clearMobileKeyboardFrame(root);
      if (window.scrollY !== 0) window.scrollTo(0, 0);
      announceGeometry(null);
    };
  }, [active]);
}
