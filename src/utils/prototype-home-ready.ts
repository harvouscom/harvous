import type { PrototypeNotesListPhase } from './prototype-notes-list-phase';

/**
 * True when notes have loaded enough to leave a hard-error/loading notes phase.
 *
 * This is only the *notes* half of readiness — feed it into
 * {@link isPrototypeHomePresentationReady} rather than painting the home view off it
 * directly, or the view appears as soon as notes arrive and then jumps as each
 * enrichment query lands.
 *
 * Takes the phase directly rather than an options object on purpose. It used to accept
 * `{ notesListPhase }`, and the call site passed five more settled-flags alongside it;
 * every one was discarded. (TypeScript does flag that as an excess-property error — it
 * shipped because nothing ran `tsc`.) A bare parameter makes the mistake unexpressible.
 */
export function isPrototypeHomeContentReady(notesListPhase: PrototypeNotesListPhase): boolean {
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
