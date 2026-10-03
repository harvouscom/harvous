/**
 * How much the app is allowed to make a sound — three named choices, never a volume dial.
 *
 * Device-local on purpose, like the reading face: a phone on the couch and a laptop in a library
 * want different answers, and an account-wide setting would make one of them wrong. Follows the
 * font prefs' shape (localStorage + a subscription + a cached snapshot) rather than inventing a
 * second settings mechanism.
 *
 * - `everywhere` — Review, the things you finish, and moving around the app.
 * - `moments` — Review and the things you finish; the interface itself stays quiet.
 * - `off` — nothing.
 */

export type SoundPreference = 'everywhere' | 'moments' | 'off';

export const SOUND_PREFERENCES: readonly {
  id: SoundPreference;
  label: string;
  description: string;
}[] = [
  {
    id: 'everywhere',
    label: 'Everywhere',
    description: 'Reviews, things you finish, and moving around the app.',
  },
  { id: 'moments', label: 'Moments only', description: 'Reviews and things you finish.' },
  { id: 'off', label: 'Off', description: 'No sounds.' },
];

export const DEFAULT_SOUND_PREFERENCE: SoundPreference = 'everywhere';

const STORAGE_KEY = 'harvous-proto-sounds';

function isPreference(value: unknown): value is SoundPreference {
  return SOUND_PREFERENCES.some((p) => p.id === value);
}

export function readSoundPreference(): SoundPreference {
  if (typeof window === 'undefined') return DEFAULT_SOUND_PREFERENCE;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return isPreference(raw) ? raw : DEFAULT_SOUND_PREFERENCE;
  } catch {
    return DEFAULT_SOUND_PREFERENCE;
  }
}

const listeners = new Set<() => void>();
let snapshot: SoundPreference | null = null;
let watchingOtherTabs = false;

/*
 * Another tab changing the choice changes it here too. Without this a tab left open keeps
 * playing sounds its reader has already turned off somewhere else, until it is reloaded.
 */
function watchOtherTabs() {
  if (watchingOtherTabs || typeof window === 'undefined') return;
  watchingOtherTabs = true;
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return;
    snapshot = readSoundPreference();
    listeners.forEach((fn) => fn());
  });
}

export function subscribeSoundPreference(onStoreChange: () => void): () => void {
  watchOtherTabs();
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

export function getSoundPreferenceSnapshot(): SoundPreference {
  if (!snapshot) {
    snapshot = readSoundPreference();
    watchOtherTabs();
  }
  return snapshot;
}

export function getSoundPreferenceServerSnapshot(): SoundPreference {
  return DEFAULT_SOUND_PREFERENCE;
}

export function writeSoundPreference(next: SoundPreference): void {
  snapshot = next;
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* quota / storage disabled — the choice still holds for this session */
  }
  listeners.forEach((fn) => fn());
}

/** Test seam: forget the cached snapshot so the next read goes back to storage. */
export function resetSoundPreferenceForTests(): void {
  snapshot = null;
}
