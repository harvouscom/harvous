/**
 * Who can actually carry out an organize verb, published by the host that owns the sheets.
 *
 * The twin of `prototype-command-context-store`, and deliberately a second store rather than
 * a second field on that one. They answer different questions and change on different
 * schedules: *what* a verb points at belongs to whichever list is showing and changes as
 * focus and selection move, while *how* a verb is carried out belongs to one host mounted
 * for the whole session. Merging them would mean every list republishing the runner it does
 * not own, and a list unmounting could take the sheets down with it.
 *
 * This exists because the sheets used to live inside `PrototypeSidebar`. That was survivable
 * while the sidebar was always mounted; it is not now that it boots collapsed — collapsed
 * means unmounted, so a verb invoked from anywhere else had nowhere to open.
 */
import { useSyncExternalStore } from 'react';
import type { CommandContext, PrototypeCommandId } from './prototype-commands';

export type OrganizeRunOptions = {
  /**
   * What a confirm should point at. Destructives anchor to the control that raised them —
   * a dialog in the opposite corner of the window reads as an unrelated alert rather than
   * an answer to the tap. Null falls back to the host's own centring.
   */
  anchorRect?: DOMRect | null;
};

export type OrganizeRunner = (
  id: PrototypeCommandId,
  ctx: CommandContext,
  options?: OrganizeRunOptions,
) => void;

/** Prefill for the create-Thread sheet, when something already knows the notes and a name. */
export type CreateThreadPrefill = {
  noteIds: string[];
  threadName?: string;
  /** Fired once the Thread actually exists — see `handleRecallCompleted`. */
  onCreated?: () => void;
};

/**
 * The host's whole surface.
 *
 * The two openers are not verbs and deliberately do not go through `run`: "New folder" from
 * an empty list acts on nothing, so it has no `CommandContext` to carry and would have to
 * invent one to satisfy the gate. They open the same sheets a verb opens, which is the point
 * — one create-folder sheet in the app, not one per caller.
 */
export type OrganizeApi = {
  run: OrganizeRunner;
  openCreateFolder: (noteIds?: string[]) => void;
  openCreateThread: (prefill?: CreateThreadPrefill) => void;
};

let current: OrganizeApi | null = null;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

/** Mount-time registration. Returns an unpublish for effect cleanup. */
export function publishOrganizeApi(api: OrganizeApi): () => void {
  current = api;
  emit();
  return () => {
    /* Only clear if nobody else has published since — the same guard the context store
       keeps, so a remount ordering cannot leave the app with no host. */
    if (current === api) {
      current = null;
      emit();
    }
  };
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function getSnapshot(): OrganizeApi | null {
  return current;
}

function getServerSnapshot(): OrganizeApi | null {
  return null;
}

/**
 * The host's API, or null before it has mounted.
 *
 * Callers should treat null as "not yet", not as "never" — a bulk bar rendered in that frame
 * should stay inert rather than disappear, because the host mounts in the same commit and
 * the bar would flicker.
 */
export function useOrganizeApi(): OrganizeApi | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
