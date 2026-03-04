/**
 * UNUSED: View Transitions API wrapper was removed to reduce navigation lag.
 * Route transitions were removed from AppLayout to avoid main-column flash.
 * Kept for reference; re-enable by importing and calling wrapNavigateWithViewTransition(router) in router.tsx.
 *
 * Wraps router.navigate with the View Transitions API when supported.
 * Provides smooth crossfade/transition on route change (Chrome, Safari 18+, Edge).
 * Falls back to instant navigation when unsupported (e.g. Firefox).
 */
import type { AnyRouter } from '@tanstack/react-router';

/**
 * Wait for the next frame after React has committed and the browser has painted.
 * Used so startViewTransition captures the correct "new" DOM state.
 */
function waitForPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

/**
 * Patches the router so that navigate() uses document.startViewTransition when
 * available. Call once after createRouter().
 *
 * Navigate options can include viewTransition: false to skip the transition
 * (e.g. for auth redirects).
 */
export function wrapNavigateWithViewTransition(router: AnyRouter): void {
  const originalNavigate = router.navigate.bind(router);

  (router as any).navigate = function (
    options: Parameters<typeof originalNavigate>[0] & { viewTransition?: boolean }
  ): ReturnType<typeof originalNavigate> {
    const { viewTransition = true, ...navigateOpts } = options as typeof options & { viewTransition?: boolean };

    if (viewTransition === false || typeof document.startViewTransition !== 'function') {
      return originalNavigate(navigateOpts);
    }

    const vt = document.startViewTransition!(async () => {
      originalNavigate(navigateOpts);
      await waitForPaint();
    });

    return vt.finished as ReturnType<typeof originalNavigate>;
  };
}
