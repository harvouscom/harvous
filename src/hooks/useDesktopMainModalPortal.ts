import type { CSSProperties } from 'react';

/**
 * All modals portal to `document.body` with `position: fixed` (full-viewport hit layer).
 * Desktop visual placement in the main column is handled by CSS grid on `.modal-overlay-enter`
 * (see animations.css).
 */
export function useDesktopMainModalPortal(): {
  portalTarget: HTMLElement;
  /** Kept for call-site compatibility; always false — layout is CSS-driven now. */
  overlayUsesMainColumn: boolean;
} {
  return { portalTarget: document.body, overlayUsesMainColumn: false };
}

/** Shared inline styles for `.modal-overlay-enter` wrappers. Desktop grid padding is CSS (!important); these min 12px values align before paint / as fallback. */
export function getModalOverlayBaseStyle(_overlayUsesMainColumn: boolean): CSSProperties {
  return {
    position: 'fixed',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000025,
    padding: 'max(12px, 1rem)',
    paddingTop: 'max(12px, 1rem, env(safe-area-inset-top))',
    paddingBottom: 'max(12px, 1rem, env(safe-area-inset-bottom))',
  };
}
