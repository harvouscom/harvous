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
