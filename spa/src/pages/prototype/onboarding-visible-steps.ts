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
  shouldShowOnboarding,
  type OnboardingCustomizeId,
  type OnboardingState,
  type OnboardingStepId,
} from '@/utils/onboarding-state';
import type { PushSupport } from '../../lib/push-reminders';
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

/**
 * Whether the checklist is currently making this offer itself.
 *
 * Reminders and import each have a standing surface of their own — the card on Home, the
 * suggestion row in Activity — and both sit on the same screen as the dock. Without this they
 * would ask the same question twice in one scroll, which reads less like helpfulness and more
 * like the app having lost track of what it already said.
 *
 * So the dock takes precedence while it is up, and the standing surfaces take the offer back
 * when it retires — which is also what keeps this change from narrowing anything: the import
 * row was deliberately aimed at every account rather than new ones, because the likeliest
 * importer is someone with years of notes elsewhere, and that reader still meets it exactly
 * where they did before.
 *
 * `isGuest` is not decoration. A guest's dock is always visible but never lists these rows,
 * so without it every guest would look like a reader whose checklist owned an offer it was
 * not showing.
 */
export function onboardingOwnsOffer(
  state: OnboardingState | null,
  id: OnboardingCustomizeId,
  isGuest: boolean,
): boolean {
  if (!state || isGuest) return false;
  if (!shouldShowOnboarding(state)) return false;
  return !state.steps[id].done && !state.steps[id].dismissed;
}

/**
 * Whether the "Turn on reminders" row belongs on screen, given what this device can do.
 *
 * The only row whose availability is a fact about the device rather than the account, so it
 * is answered here rather than by the step's stored state:
 *
 * - `default` — nothing has been asked yet. This is the row's whole reason to exist.
 * - `needs-home-screen` — an iPhone in a Safari tab. It keeps the row, and this is the gap
 *   the row closes: `PrototypeRemindersCard` renders on `default` alone, so until now an
 *   iPhone reader was never offered reminders anywhere outside Settings.
 * - `granted` — already on. Hidden without writing the step down, because this is one device
 *   and the account may well have another that is not subscribed.
 * - `denied` — the browser will not ask again, and a permanent no should not be re-put. This
 *   is the same reasoning that keeps the permission prompt off the render path entirely.
 * - `unsupported` — nothing to offer.
 *
 * `null` is "not resolved yet", which hides the row rather than flashing it at someone who
 * turns out to be subscribed already.
 */
export function remindersRowApplies(support: PushSupport | null): boolean {
  return support === 'default' || support === 'needs-home-screen';
}
