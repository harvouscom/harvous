import { useEffect, useRef, useState } from 'react';

/**
 * How long `--enter` stays on the view: the 0.42s section animation plus the largest
 * `:nth-child` stagger delay, with slack. Must cover the whole staggered sequence in
 * `prototype-components.css`.
 */
const ENTER_WINDOW_MS = 800;

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
    const id = window.setTimeout(() => setEntering(false), ENTER_WINDOW_MS);
    return () => window.clearTimeout(id);
  }, [ready, replayKey]);

  return entering ? 'proto-home-view proto-home-view--enter' : 'proto-home-view';
}
