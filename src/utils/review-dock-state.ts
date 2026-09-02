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
 * Writing something counts, and so does saying "I have it in mind" — both are a retrieval that
 * happened before the answer appeared. Revealing cold is not, and offering "I recalled it"
 * there invites a lie that costs a real interval, since the schedule is downstream of it.
 */
export function canJudgeRecall(state: { attempted: boolean; attempt: string }): boolean {
  return state.attempted || state.attempt.trim().length > 0;
}
