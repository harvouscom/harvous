/**
 * What the Library panel's Actions group is allowed to act on, published by whichever list
 * is showing.
 *
 * The panel is mounted by the shell so ⇧K works with the sidebar collapsed, hidden, or
 * swapped for the admin or church views — but the *target* of an organize verb is known
 * only to the list holding the rows. Rather than lift selection plumbing into the shell
 * context (which every consumer would then re-render on), the list publishes here and the
 * panel subscribes.
 *
 * Two lists publish today: the sidebar's (`PrototypeSidebar`) and the panel's own
 * (`library-panel/use-library-selection`), which is why opening the panel over a standing
 * sidebar selection keeps it.
 *
 * Module-level with `useSyncExternalStore`, the same shape as `usePrototypeShiftHints`.
 * When nothing publishes — no list mounted, nothing selected, no row focused — the value
 * is null and the Actions group simply does not render, which is the honest answer.
 */
import { useSyncExternalStore } from 'react';
import type { CommandContext, PrototypeCommandId } from './prototype-commands';

export type PrototypeCommandRunner = (id: PrototypeCommandId) => void;

/**
 * A *getter*, not a value.
 *
 * Part of the context is which row holds keyboard focus, and focus moves without
 * re-rendering React. Publishing a snapshot would hand the reader whatever was true at
 * the last render — so ⇧↓ ⇧↓ ⇧K would offer actions for the row you started on. The
 * consumer calls this when the panel opens instead; see
 * `library-panel/use-library-command-context`, which also explains why a panel that stays
 * mounted while you type may only ever *improve* on that first answer.
 */
type Published = {
  getContext: (() => CommandContext | null) | null;
  run: PrototypeCommandRunner | null;
};

const EMPTY: Published = { getContext: null, run: null };

let current: Published = EMPTY;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

/**
 * Replace what the panel sees. Returns an unpublish function for effect cleanup.
 *
 * Later publishers win outright rather than merging: two lists are never both the subject
 * of a verb, and a merge would invent a target that neither list would act on.
 */
export function publishPrototypeCommandContext(
  getContext: () => CommandContext | null,
  run: PrototypeCommandRunner,
): () => void {
  const entry: Published = { getContext, run };
  current = entry;
  emit();
  return () => {
    /* Only clear if nobody else has published since — otherwise a list unmounting would
       wipe the list that replaced it. */
    if (current === entry) {
      current = EMPTY;
      emit();
    }
  };
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function getSnapshot(): Published {
  return current;
}

function getServerSnapshot(): Published {
  return EMPTY;
}

export function usePrototypeCommandContext(): Published {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
