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

/**
 * React Query helper: settled when it has an answer, or when it will never have one.
 *
 * `isEnabled` is the third argument because a *disabled* query keeps `status: 'pending'` in
 * React Query v5, so the two-argument form reads "still loading" for a query that is never
 * going to load. One such flag ANDed into the presentation gate is enough to make
 * {@link isPrototypeHomePresentationReady} permanently false — which is exactly what
 * `churchSermonsSettled` did for every account without a church, so Home reached `contentReady`
 * only through its 2.5s deadline and painted with whatever had arrived by then. Waiting on a
 * query that will never run is waiting forever.
 *
 * **"Disabled" only means "never" once the thing that disabled it has settled.** A query gated
 * on another query's data is disabled *transiently* while that data is in flight, and calling it
 * settled there would let the gate fire early — the same pop-in, just for the accounts that do
 * have the feature. Compose the precondition where it is known (see `useChurchSermons.isSettled`)
 * rather than passing a bare `isEnabled` for those.
 *
 * Defaults to `true` so a call about an unconditionally-enabled query stays a two-argument call.
 */
export function isQuerySettled(isPending: boolean, hasData: boolean, isEnabled = true): boolean {
  if (hasData) return true;
  if (!isPending) return true;
  return !isEnabled;
}

export interface PrototypeHomePresentationReadyInput {
  /**
   * `useAuthReady()` — a usable session JWT, not merely a signed-in user.
   *
   * A hard precondition, and the one that makes every `isEnabled` below safe to trust. Nearly
   * every query here is `enabled: authReady && …`, so before auth settles they are all disabled
   * — and `isQuerySettled` reads a disabled query as settled, because a query that will never
   * run is not something to wait for. Without this line that reasoning inverts on itself: on the
   * first frames *everything* would look settled at once and Home would paint empty. With it,
   * `isEnabled === false` can only mean the query's own condition said no.
   */
  authReady: boolean;
  /** Notes list/empty. */
  notesReady: boolean;
  /** Clerk `useUser().isLoaded` — enough for the hello first name. */
  clerkLoaded: boolean;
  fingerprintsSettled: boolean;
  /** The reader's Study Bible layer, which the study arc prefers over the note-side count. */
  studyBibleSettled: boolean;
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
  /** The search log behind the unanswered-question card. */
  searchEventsSettled: boolean;
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
  /**
   * The paid-feature answer, which decides whether Review exists on this page at all — and, for
   * an account without it, whether the sample and the Plus row do.
   */
  entitlementSettled: boolean;
  /**
   * Review's own rows. Also *removes* recall cards: the suggestion handoff steps Home's
   * resurfacing cards aside for any passage Review has already taken up.
   */
  reviewSettled: boolean;
  /** Challenges — the Review section reads them, and so does the strengthen-a-Thread row. */
  challengesSettled: boolean;
  /** Personal reading plans — a row inside Following. */
  readingPlansSettled: boolean;
  /** The getting-started checklist's own store, whose dock inserts at the *top* of the sheet. */
  onboardingHydrated: boolean;
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
 * Five more joined later — the entitlement, Review, challenges, reading plans and the
 * onboarding store. Review's absence was deliberate at the time: it was the slowest thing on the
 * page, so gating on it would have made everyone wait for it. Then it was made to start at t=0
 * (a per-tab entitlement snapshot, see `useSubscriptionStatus`) and became one of the fastest,
 * which is precisely why it was the section a reader saw sitting alone while the rest arrived.
 * The reasoning inverted with the measurement.
 *
 * When adding a flag, add it to {@link PrototypeHomePresentationReadyInput} as well. This
 * function has already been bitten once by exactly that: the call site passed five flags the
 * parameter type didn't declare and all five were silently dropped, so Home painted early
 * anyway. `npm run typecheck:ratchet` now catches it.
 */
export function isPrototypeHomePresentationReady(input: PrototypeHomePresentationReadyInput): boolean {
  if (!input.authReady || !input.notesReady || !input.clerkLoaded) return false;
  return (
    input.fingerprintsSettled &&
    input.tagsSettled &&
    input.threadsSettled &&
    input.scriptureSettled &&
    input.connectionsSettled &&
    input.highlightsSettled &&
    input.votdSettled &&
    input.searchEventsSettled &&
    input.crossRefGapsSettled &&
    input.connectSuggestionsSettled &&
    input.recallHistorySettled &&
    input.churchSermonsSettled &&
    input.churchFeedSettled &&
    input.readingPositionSettled &&
    input.studyBibleSettled &&
    input.entitlementSettled &&
    input.reviewSettled &&
    input.challengesSettled &&
    input.readingPlansSettled &&
    input.onboardingHydrated
  );
}
