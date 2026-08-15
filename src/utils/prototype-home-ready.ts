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
  /** Cross-ref gaps — feeds the `crossrefGap` recall card. */
  crossRefGapsSettled: boolean;
  /** Connect suggestions — feeds the `connectNotes` recall card. */
  connectSuggestionsSettled: boolean;
  /** Recall event history — supplies the snooze set, which *removes* cards. */
  recallHistorySettled: boolean;
  /** "This Sunday" — self-gates on its own query and sits above the daily passage. */
  churchSermonsSettled: boolean;
  /** Church feed — self-gates on its own query. */
  churchFeedSettled: boolean;
  /** Reading bookmark — *replaces* the continue-book card, so its arrival reorders the deck. */
  readingPositionSettled: boolean;
}

/**
 * True when Home can leave ProtoHomeLoading and present the full view once —
 * greeting sentence + cards — in a single top-to-bottom enter animation.
 *
 * Uses query *settled* (fetched or cached), never “has rows”, so a slow/empty
 * auxiliary cannot strand the shell on loading dots forever.
 *
 * Every query that can add, remove or reorder something on Home belongs here. Five were
 * missing and each one landing after first paint moved the view under the reader: the three
 * recall-deck queries (cross-ref gaps and connect suggestions *add* cards; recall history
 * supplies the snooze set, which *removes* them), plus the two church sections that return
 * `null` until their own query resolves — and "This Sunday" sits above the daily passage, so
 * its arrival pushes everything below it down.
 *
 * When adding a flag, add it to {@link PrototypeHomePresentationReadyInput} as well. This
 * function has already been bitten once by exactly that: the call site passed five flags the
 * parameter type didn't declare and all five were silently dropped, so Home painted early
 * anyway. `npm run typecheck:ratchet` now catches it.
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
    input.votdSettled &&
    input.crossRefGapsSettled &&
    input.connectSuggestionsSettled &&
    input.recallHistorySettled &&
    input.churchSermonsSettled &&
    input.churchFeedSettled &&
    input.readingPositionSettled
  );
}
