/**
 * The wiring between the Harvous 3 welcome and the two things that talk to it.
 *
 * Both halves exist because the sheet is mounted once, in the shell, while the things that
 * need it live elsewhere — the what's-new row is somewhere down Activity, and the update toast
 * is a sibling that must not talk over it.
 *
 * ## Opening it
 *
 * The what's-new row asks for the sheet rather than rendering its own, so there is exactly one
 * instance and no chance of two overlapping copies of the same modal. A window event rather
 * than context, matching `PROTO_APP_UPDATE_EVENT`: the row and the sheet share no ancestor
 * worth threading a provider through.
 *
 * ## Holding the toast
 *
 * The two can genuinely coincide: the welcome shows on the first 3.0 load, and a service
 * worker that finishes installing a moment later fires the toast on top of it. Two overlapping
 * announcements about the same release, one of them asking you to reload out of the other.
 *
 * A hold rather than a suppression — the reload prompt is real and still needs saying, so it
 * is deferred and flushed when the welcome closes rather than dropped.
 */
/** Asks the shell's welcome sheet to open. Dispatched by the what's-new row. */
export const PROTO_WELCOME_3_OPEN_EVENT = 'harvous-prototype-welcome-3-open';

export function openWelcome3(): void {
  window.dispatchEvent(new CustomEvent(PROTO_WELCOME_3_OPEN_EVENT));
}

/** Subscribe to open requests. Returns an unsubscribe. */
export function onWelcome3OpenRequest(fn: () => void): () => void {
  window.addEventListener(PROTO_WELCOME_3_OPEN_EVENT, fn);
  return () => window.removeEventListener(PROTO_WELCOME_3_OPEN_EVENT, fn);
}

let held = false;
const listeners = new Set<() => void>();

export function isAppUpdateToastHeld(): boolean {
  return held;
}

/** Called by the welcome as it mounts and unmounts. Releasing notifies anything waiting. */
export function setAppUpdateToastHold(next: boolean): void {
  if (held === next) return;
  held = next;
  if (!held) for (const fn of listeners) fn();
}

/** Subscribe to the release. Returns an unsubscribe. */
export function onAppUpdateToastRelease(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}
