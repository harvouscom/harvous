/**
 * Which checklist steps this reader can actually finish, and how far along they are.
 *
 * Pulled out of the dock the moment a second surface showed the same count. The toolbar chip
 * said "2 of 6" while the list under it showed four rows, because the chip read the raw
 * progress and the dock computed its own — the first drift, arriving immediately, exactly as
 * two copies of a rule always do.
 */
import {
  ONBOARDING_STEP_IDS,
  onboardingProgress,
  type OnboardingState,
  type OnboardingStepId,
} from '@/utils/onboarding-state';
import { guestHighlights } from '../../lib/guest-store';

/**
 * Reading, highlighting, and writing a note on a verse from the reader's annotate dock all work
 * without an account. Pills, threads and recall need one. Listing a step nobody can tick would
 * make the checklist lie about itself — and a count that can never reach its total is a worse
 * invitation than an honest short list ending in the thing that unlocks the rest.
 */
export const GUEST_STEP_IDS: ReadonlySet<OnboardingStepId> = new Set<OnboardingStepId>([
  'read',
  'highlight',
  'note',
]);

/**
 * A guest's steps, read back off what they have rather than only off what we caught them doing.
 *
 * The account version does this too (`DERIVED_STEP_IDS`), for the same reason: an event latch
 * only knows about the times it was listening. A guest who highlighted a verse through a path
 * that does not latch would be looking at their own highlight above a row telling them to go
 * and make one.
 *
 * 'read' has nothing to derive from, which is why it stays event-only: a chapter that has been
 * opened leaves no trace on this device unless something records that it was.
 */
export function guestStepDerived(id: OnboardingStepId): boolean {
  const highlights = guestHighlights();
  if (id === 'highlight') return highlights.length > 0;
  if (id === 'note') return highlights.some((h) => h.miniNoteBody?.trim());
  return false;
}

/** True when this step should be listed at all for this reader. */
export function stepAppliesTo(id: OnboardingStepId, isGuest: boolean): boolean {
  return !isGuest || GUEST_STEP_IDS.has(id);
}

/** True when the reader has already done it, by latch or by what is on the device. */
export function stepIsDone(state: OnboardingState, id: OnboardingStepId, isGuest: boolean): boolean {
  return state.steps[id].done || (isGuest && guestStepDerived(id));
}

/**
 * The count every surface shows. A guest's total includes the account row, which is a step in
 * the sequence even though it is not an `OnboardingStepId`.
 */
export function shownOnboardingProgress(
  state: OnboardingState,
  isGuest: boolean,
): { done: number; total: number } {
  if (!isGuest) return onboardingProgress(state);
  const done = ONBOARDING_STEP_IDS.filter(
    (id) => GUEST_STEP_IDS.has(id) && stepIsDone(state, id, true),
  ).length;
  return { done, total: GUEST_STEP_IDS.size + 1 };
}
