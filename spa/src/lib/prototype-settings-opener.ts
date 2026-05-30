import {
  isPrototypeSettingsPath,
  isPrototypeShellPath,
  prototypeHomePath,
} from '@/lib/prototype-path';

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
  if (typeof window === 'undefined') return prototypeHomePath();
  try {
    const stored = sessionStorage.getItem(PROTO_SETTINGS_OPENER_KEY);
    if (stored && isPrototypeShellPath(stored) && !isPrototypeSettingsPath(stored)) {
      return stored;
    }
  } catch {
    /* ignore */
  }
  return prototypeHomePath();
}
