/**
 * Which review item the dock should be asking about.
 *
 * Pure, because the interesting case is a timing one and timing bugs are miserable to chase
 * through a component. The dock is fed by two lists that disagree: the session, which holds
 * only what is due right now, and the full item list, which holds everything including items
 * scheduled for later. A row on the Review page can ask about either.
 *
 * The order below is the whole rule. Prefer the item that was actually asked for, wherever it
 * lives; fall back to the head of the due queue; answer null rather than guessing.
 */

export interface ReviewDockItemLike {
  id: string;
}

export function resolveReviewDockItem<T extends ReviewDockItemLike>(
  requestedId: string | null | undefined,
  sessionItems: readonly T[],
  fallbackItems: readonly T[] = [],
): T | null {
  if (requestedId) {
    const requested =
      sessionItems.find((i) => i.id === requestedId) ??
      fallbackItems.find((i) => i.id === requestedId);
    if (requested) return requested;
    /*
     * Asked for something that is in neither list.
     *
     * Almost always because it was just answered: the outcome mutation drops it from the
     * session optimistically, and this runs on the very next render. Falling through to the
     * head of the queue is what makes the dock advance on its own rather than going blank and
     * waiting to be told what to do next.
     */
  }
  return sessionItems[0] ?? null;
}

/**
 * Whether the reader may judge their own recall, or only acknowledge that they looked.
 *
 * Writing something is the attempt, and it is the only signal. There was briefly an "I have it
 * in mind" button beside the reveal for people who retrieved the note without typing, and it
 * was wrong twice: it asked someone to declare a mental state *before* checking it, and the
 * strategy doc's own rule is that "whether they attempt recall before revealing a note" is to
 * be inferred from behaviour rather than surveyed.
 *
 * The consequence is deliberate and worth stating: reveal without writing and you get the
 * shorter interval. That is the doc's model — revealing immediately means "needs support" —
 * and it quietly rewards the thing Harvous is for, which is writing something down.
 */
export function canJudgeRecall(state: { attempt: string }): boolean {
  return state.attempt.trim().length > 0;
}

/**
 * Whether the dock should let go of the question it pinned.
 *
 * `heldItem` exists so an answered question stays under its own result — the mutation drops the
 * item from the session optimistically, so without the pin the card swaps to the next question
 * for a beat and then swaps back. It was cleared in exactly one place, the "Next one" button,
 * and every other way out of a result left it set: leaving from the result card and tapping a
 * different row rendered the *old* exercise while the dock's pointer named the new one, and
 * answering it again re-recorded an outcome for an item that had already been rescheduled.
 *
 * The four clauses, in order, because the order is the rule:
 *
 * - Nothing pinned, nothing to release.
 * - **Never while the answer is in flight.** This is the whole reason the pin exists; releasing
 *   here is the flash it was written to prevent.
 * - A closed dock keeps nothing. Reopening starts from the queue.
 * - **A different item was asked for by name.** Unambiguous: a row was tapped, and it was not
 *   this one.
 * - Otherwise release only once the card is showing neither a result nor a verdict. A verdict
 *   with no result is the non-final miss — same question, still up, holding against the refetch
 *   the attempt kicked off — and that hold is deliberate.
 */
export function shouldReleaseHeldItem(state: {
  heldId: string | null;
  /** The dock's own pointer: what was last asked for by name. */
  requestedId: string | null | undefined;
  hasResult: boolean;
  /** A marked answer on screen, including the non-final miss. */
  hasVerdict: boolean;
  pending: boolean;
  dockOpen: boolean;
}): boolean {
  if (!state.heldId) return false;
  if (state.pending) return false;
  if (!state.dockOpen) return true;
  if (state.requestedId && state.requestedId !== state.heldId) return true;
  return !state.hasResult && !state.hasVerdict;
}

/** Four hours, or a new day, whichever comes first — see {@link sittingIsStale}. */
export const SITTING_STALE_MS = 4 * 60 * 60 * 1000;

/**
 * Whether a sitting fetched at `fetchedAt` is too old to be handed to someone reopening the dock.
 *
 * A sitting is `staleTime: Infinity` on purpose: refetching mid-answer would reshuffle the queue
 * under the reader. That is right for the minutes a sitting lasts and wrong for the hours a tab
 * stays open — leave Harvous open overnight and the morning's dock serves yesterday's questions,
 * scheduled against yesterday's clock.
 *
 * A calendar-day change counts as well as the elapsed hours, because "a new day" is what a reader
 * means by a new sitting, and an evening sitting reopened after midnight is four hours away from
 * being one. Checked only as the dock opens, never while it is being used.
 */
export function sittingIsStale(fetchedAt: number | null | undefined, now: number = Date.now()): boolean {
  if (!fetchedAt) return false;
  if (now - fetchedAt >= SITTING_STALE_MS) return true;
  return new Date(fetchedAt).toDateString() !== new Date(now).toDateString();
}
