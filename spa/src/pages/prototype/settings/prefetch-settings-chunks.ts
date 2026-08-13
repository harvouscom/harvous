/**
 * Prefetch lazy settings category modules so category switches feel instant
 * after the first Settings open. Layout/Index/Account are eager in the router.
 */

import { PROTO_VOTD_SHEET_MOTION_MS } from '../../../layouts/proto-motion';

let prefetchStarted = false;

/**
 * Fire-and-forget dynamic imports for non-eager settings pages.
 *
 * Every import is caught. A prefetch miss is expected after a deploy (the hashed chunk this
 * build references is gone), and an uncaught rejection here would surface as nine
 * "Failed to fetch dynamically imported module" diagnostics events for what is only a warm-up.
 * Real navigation to the page still reports through the router, and `vite:preloadError`
 * in main.tsx owns recovery.
 */
export function prefetchSettingsCategoryChunks(): void {
  if (prefetchStarted) return;
  prefetchStarted = true;
  const swallow = () => {
    /* prefetch is best-effort — see above */
  };
  const load = () => {
    void import('./PrototypeTranslationPage').catch(swallow);
    void import('./PrototypeAppearancePage').catch(swallow);
    void import('./PrototypeChurchPage').catch(swallow);
    // PrototypeLockPinPage intentionally not prefetched — its route isn't
    // registered while note lock is disabled. See settingsCategories.ts.
    void import('./PrototypeSharingPage').catch(swallow);
    void import('./PrototypeAddonsPage').catch(swallow);
    void import('./PrototypeDataPage').catch(swallow);
    void import('./PrototypeSupportPage').catch(swallow);
    void import('./PrototypeKeyboardShortcutsPage').catch(swallow);
  };

  // Wait for idle. This is called from the settings layout's mount effect, which lands exactly
  // when Vaul starts animating the sheet in — eight parallel chunk fetches plus their parse
  // cost landing in that window is what made the sheet feel like it stuttered on open, on a
  // phone most of all. Nothing here is needed for the pane the user is looking at; it is warm-up
  // for the *next* category they might pick, so it can always yield to the animation.
  if (typeof requestIdleCallback === 'function') {
    requestIdleCallback(load, { timeout: 2000 });
  } else {
    // Safari has no requestIdleCallback. Clear the sheet transition and go.
    setTimeout(load, PROTO_VOTD_SHEET_MOTION_MS);
  }
}

/**
 * Open-intent hint from the Account menu.
 *
 * Bound to pointerdown as well as pointerenter: on touch there is no hover, so `pointerenter`
 * fires simultaneously with the click and buys nothing. `pointerdown` lands on finger-down,
 * which is the only free time a touch device offers — typically 80-150ms before the tap
 * completes, and more if the user is deliberate about it.
 */
export function prefetchSettingsOpenPath(): void {
  prefetchSettingsCategoryChunks();
}
