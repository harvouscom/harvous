/**
 * "Open the church request form when Settings › My Church loads" — set by /churches/start.
 *
 * sessionStorage, not the URL: the shell's path canonicalisation (/prototype/settings/… →
 * /settings/…) drops the query string before Settings mounts, so a `?bring=1` never arrived.
 */
export const CHURCH_BRING_FLAG = 'harvous-church-bring';

export function markChurchBringRequested(): void {
  try {
    sessionStorage.setItem(CHURCH_BRING_FLAG, '1');
  } catch {
    /* private mode — they land on My Church and find the row themselves */
  }
}

/** Whether it is set. Pure read — safe in a useState initializer, which StrictMode runs twice. */
export function readChurchBringRequested(): boolean {
  try {
    return sessionStorage.getItem(CHURCH_BRING_FLAG) === '1';
  } catch {
    return false;
  }
}

/** Clear it once used, from an effect, so a later visit to My Church doesn't reopen the form. */
export function clearChurchBringRequested(): void {
  try {
    sessionStorage.removeItem(CHURCH_BRING_FLAG);
  } catch {
    /* ignore */
  }
}
