import { useEffect, useRef, useState } from 'react';
import { PROTO_HOME_ENTER_WINDOW_MS, PROTO_POPOVER_MOTION_MS } from '../../layouts/proto-motion';
import { useSettledFlag } from '../../hooks/useSettledFlag';

/** Distinguishes "never entered" from a genuine `undefined`/`null` replayKey. */
const NO_KEY_YET = Symbol('no-key-yet');

/**
 * Staggered section enter for space dashboards (My Home + shared spaces).
 * Fires once when `ready` becomes true; pass `replayKey` to replay when switching spaces.
 *
 * The class is removed again once the sequence finishes. It used to latch on forever,
 * which meant any section mounting later — a slow query landing, a card appearing as data
 * arrived — replayed the 420ms slide-in from `opacity: 0; translateY(10px)` and shoved its
 * siblings down. Because the stagger delays are keyed on `:nth-child`, a section
 * appearing or disappearing also reshuffled every following section's delay and
 * re-triggered the animation on cards that had long since settled.
 */
export function useProtoHomeViewClassName(ready: boolean, replayKey?: string | null): string {
  const [entering, setEntering] = useState(false);
  const enteredForKeyRef = useRef<unknown>(NO_KEY_YET);

  useEffect(() => {
    if (!ready) return;
    if (enteredForKeyRef.current === replayKey) return;
    enteredForKeyRef.current = replayKey;
    setEntering(true);
    const id = window.setTimeout(() => setEntering(false), PROTO_HOME_ENTER_WINDOW_MS);
    return () => window.clearTimeout(id);
  }, [ready, replayKey]);

  return entering ? 'proto-home-view proto-home-view--enter' : 'proto-home-view';
}

/**
 * How long a wait has to last before it is worth admitting to.
 *
 * A dashboard that comes back from cache is ready within a frame or two, and putting the
 * loading dots up for that long is worse than showing nothing: the reader sees a flicker
 * where the content already was and reads it as the app losing its place. Long enough to
 * cover a warm remount, short enough that a real wait still gets its indicator promptly.
 */
const LOADER_GRACE_MS = 150;

export interface ProtoSpaceLoaderState {
  /** Render the dots. False both before the grace period and after the fade-out. */
  showLoader: boolean;
  /** The dots are on their way out — content is ready and being handed the pane. */
  loaderLeaving: boolean;
}

/**
 * When a space dashboard should show its loading dots, and when it should let go of them.
 *
 * Two problems, one state machine, because they are the same moment seen from either side.
 *
 * Going in: `ProtoSpaceLoading` used to appear on the first frame `ready` was false, so
 * every warm remount flashed dots for a few milliseconds. The grace period holds them back.
 *
 * Coming out: the dots used to be replaced by a full dashboard between one frame and the
 * next — the hardest cut in the shell, and the reason the arrival read as a jolt however
 * gently the content itself faded in. Keeping them mounted for a beat while they fade lets
 * the two states overlap instead of swapping, so nothing on screen is ever simply gone.
 *
 * A wait that never showed dots skips the fade entirely: there is nothing to hand over.
 */
export function useProtoSpaceLoaderState(ready: boolean): ProtoSpaceLoaderState {
  const graced = useSettledFlag(!ready, LOADER_GRACE_MS);
  // Whether the dots were ever actually on screen for this wait, which decides if there is
  // anything to fade. Read in an effect, never rendered from, so it cannot desync the pair.
  const wasShownRef = useRef(false);
  const [leaving, setLeaving] = useState(false);

  if (!ready && graced) wasShownRef.current = true;

  useEffect(() => {
    if (!ready) return;
    if (!wasShownRef.current) return;
    wasShownRef.current = false;
    setLeaving(true);
    const id = window.setTimeout(() => setLeaving(false), PROTO_POPOVER_MOTION_MS);
    return () => window.clearTimeout(id);
  }, [ready]);

  return { showLoader: (!ready && graced) || leaving, loaderLeaving: leaving };
}
