/**
 * Keeps a mid-compose note open across a refresh.
 *
 * Compose deliberately stays on `/` until an idle moment, then replaces the URL with
 * `/{id}` — so a refresh while the user is still typing lands on a blank Home even though
 * the note was persisted seconds earlier. The user then reopens it by hand and, because
 * the draft backstop is newer than the server copy, gets a "Restored unsaved changes"
 * toast on top. This stash closes that gap: while a compose note is persisted but the URL
 * hasn't caught up, remember its id; on booting into Home, reopen it silently.
 *
 * sessionStorage on purpose: it survives a refresh but dies with the tab, so a browser
 * restart (or sign-out, which lands on the auth shell anyway) starts fresh. The TTL
 * covers the walked-away case — after an hour, Home is the right place to land.
 *
 * Lifecycle: written when compose persists a note (PrototypeNotePage), cleared whenever
 * the shell's setComposePersistedNoteId(null) runs — which covers the natural URL
 * replace and every compose-session reset — or when consumed here.
 */

const KEY = 'harvous.compose.restore';

export const COMPOSE_RESTORE_TTL_MS = 60 * 60_000;

export interface ComposeRestoreStash {
  noteId: string;
  /** `space` search param for shared-space compose, absent for My Home. */
  spaceParam?: string;
  at: number;
}

export function stashComposeRestore(noteId: string, spaceParam?: string): void {
  if (typeof window === 'undefined' || !noteId) return;
  try {
    const stash: ComposeRestoreStash = {
      noteId,
      ...(spaceParam ? { spaceParam } : {}),
      at: Date.now(),
    };
    sessionStorage.setItem(KEY, JSON.stringify(stash));
  } catch {
    /* storage disabled — the feature degrades to today's behaviour */
  }
}

export function clearComposeRestoreStash(): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** Pure decision, split out for tests: a stash is only actionable while fresh. */
export function resolveComposeRestoreTarget(
  stash: ComposeRestoreStash | null,
  now: number = Date.now(),
): { noteId: string; spaceParam?: string } | null {
  if (!stash?.noteId) return null;
  if (!Number.isFinite(stash.at)) return null;
  const age = now - stash.at;
  if (age < 0 || age >= COMPOSE_RESTORE_TTL_MS) return null;
  return { noteId: stash.noteId, ...(stash.spaceParam ? { spaceParam: stash.spaceParam } : {}) };
}

/** Read-and-clear. Expired or malformed stashes are cleared too, so nothing lingers. */
export function consumeComposeRestore(): { noteId: string; spaceParam?: string } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    sessionStorage.removeItem(KEY);
    const parsed = JSON.parse(raw) as ComposeRestoreStash;
    return resolveComposeRestoreTarget(parsed);
  } catch {
    return null;
  }
}
