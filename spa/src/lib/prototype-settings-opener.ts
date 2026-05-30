/** sessionStorage key — path to return to when closing the settings overlay. */
export const PROTO_SETTINGS_OPENER_KEY = 'harvous-proto-settings-opener';

export function storeSettingsOpenerPath(path: string) {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(PROTO_SETTINGS_OPENER_KEY, path);
  } catch {
    /* ignore */
  }
}

export function readSettingsOpenerPath(): string {
  if (typeof window === 'undefined') return '/prototype';
  try {
    const stored = sessionStorage.getItem(PROTO_SETTINGS_OPENER_KEY);
    if (stored && stored.startsWith('/prototype') && !stored.startsWith('/prototype/settings')) {
      return stored;
    }
  } catch {
    /* ignore */
  }
  return '/prototype';
}
