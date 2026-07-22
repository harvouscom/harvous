import type { PrototypeNotesListPhase } from './prototype-notes-list-phase';

export interface PrototypeHomeContentReadyInput {
  notesListPhase: PrototypeNotesListPhase;
}

/**
 * True when notes have loaded enough to leave a hard-error/loading notes phase.
 *
 * Prefer {@link isPrototypeHomePresentationReady} for painting the home view — that waits
 * until greeting + card enrichment queries have settled, then presents top-to-bottom.
 */
export function isPrototypeHomeContentReady(input: PrototypeHomeContentReadyInput): boolean {
  const { notesListPhase } = input;
  if (notesListPhase === 'loading' || notesListPhase === 'error') return false;
  return notesListPhase === 'list' || notesListPhase === 'empty';
}

/** React Query helper: settled when not pending or cached data exists. */
export function isQuerySettled(isPending: boolean, hasData: boolean): boolean {
  return !isPending || hasData;
}

export interface PrototypeHomePresentationReadyInput {
  /** Notes list/empty. */
  notesReady: boolean;
  /** Clerk `useUser().isLoaded` — enough for the hello first name. */
  clerkLoaded: boolean;
  fingerprintsSettled: boolean;
  tagsSettled: boolean;
  threadsSettled: boolean;
  scriptureSettled: boolean;
  /** Cross-ref / reference-word queries used by optional greeting trend clauses. */
  connectionsSettled: boolean;
  /** Highlights feed cards (spotlight / recall). */
  highlightsSettled: boolean;
  /** Daily passage pill — settle even when the day has no VOTD. */
  votdSettled: boolean;
}

/**
 * True when Home can leave ProtoHomeLoading and present the full view once —
 * greeting sentence + cards — in a single top-to-bottom enter animation.
 *
 * Uses query *settled* (fetched or cached), never “has rows”, so a slow/empty
 * auxiliary cannot strand the shell on loading dots forever.
 */
export function isPrototypeHomePresentationReady(input: PrototypeHomePresentationReadyInput): boolean {
  if (!input.notesReady || !input.clerkLoaded) return false;
  return (
    input.fingerprintsSettled &&
    input.tagsSettled &&
    input.threadsSettled &&
    input.scriptureSettled &&
    input.connectionsSettled &&
    input.highlightsSettled &&
    input.votdSettled
  );
}
