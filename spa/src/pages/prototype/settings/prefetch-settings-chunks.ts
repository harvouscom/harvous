/**
 * Prefetch lazy settings category modules so category switches feel instant
 * after the first Settings open. Layout/Index/Account are eager in the router.
 */

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
  void import('./PrototypeTranslationPage').catch(swallow);
  void import('./PrototypeAppearancePage').catch(swallow);
  void import('./PrototypeChurchPage').catch(swallow);
  void import('./PrototypeLockPinPage').catch(swallow);
  void import('./PrototypeSharingPage').catch(swallow);
  void import('./PrototypeAddonsPage').catch(swallow);
  void import('./PrototypeDataPage').catch(swallow);
  void import('./PrototypeSupportPage').catch(swallow);
  void import('./PrototypeKeyboardShortcutsPage').catch(swallow);
}

/** Hover/focus hint from the Account menu — same as category prefetch today. */
export function prefetchSettingsOpenPath(): void {
  prefetchSettingsCategoryChunks();
}
