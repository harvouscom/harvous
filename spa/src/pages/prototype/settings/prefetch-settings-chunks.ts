/**
 * Prefetch lazy settings category modules so category switches feel instant
 * after the first Settings open. Layout/Index/Account are eager in the router.
 */

let prefetchStarted = false;

/** Fire-and-forget dynamic imports for non-eager settings pages. */
export function prefetchSettingsCategoryChunks(): void {
  if (prefetchStarted) return;
  prefetchStarted = true;
  void import('./PrototypeTranslationPage');
  void import('./PrototypeAppearancePage');
  void import('./PrototypeChurchPage');
  void import('./PrototypeLockPinPage');
  void import('./PrototypeSharingPage');
  void import('./PrototypeAddonsPage');
  void import('./PrototypeDataPage');
  void import('./PrototypeSupportPage');
  void import('./PrototypeKeyboardShortcutsPage');
}

/** Hover/focus hint from the Account menu — same as category prefetch today. */
export function prefetchSettingsOpenPath(): void {
  prefetchSettingsCategoryChunks();
}
