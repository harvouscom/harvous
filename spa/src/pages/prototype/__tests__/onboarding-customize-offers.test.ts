import { describe, it, expect } from 'vitest';
import {
  dismissOnboarding,
  dismissStep,
  emptyOnboardingState,
  markStep,
  restoreOnboarding,
  ONBOARDING_STEP_IDS,
  type OnboardingState,
} from '@/utils/onboarding-state';
import { onboardingOwnsOffer, remindersRowApplies, stepAppliesTo } from '../onboarding-visible-steps';

const T1 = '2026-09-06T10:00:00.000Z';

describe('remindersRowApplies', () => {
  it('offers the row only where there is something to ask for', () => {
    expect(remindersRowApplies('default')).toBe(true);
    // The gap this row closes: an iPhone in a Safari tab is never offered reminders by the
    // standing card, which renders on 'default' alone.
    expect(remindersRowApplies('needs-home-screen')).toBe(true);
  });

  it('stays away when the answer is already in', () => {
    expect(remindersRowApplies('granted')).toBe(false);
    expect(remindersRowApplies('denied')).toBe(false);
    expect(remindersRowApplies('unsupported')).toBe(false);
  });

  it('hides while support is still unresolved, rather than flashing', () => {
    expect(remindersRowApplies(null)).toBe(false);
  });
});

describe('stepAppliesTo', () => {
  it('keeps the customization rows away from guests', () => {
    // Each of the three needs an account: a subscription, a synced preference, an import.
    for (const id of ['reminders', 'appearance', 'import'] as const) {
      expect(stepAppliesTo(id, true)).toBe(false);
      expect(stepAppliesTo(id, false)).toBe(true);
    }
  });
});

describe('onboardingOwnsOffer', () => {
  const live = (): OnboardingState => emptyOnboardingState();
  const finishedTour = (): OnboardingState => {
    let state = emptyOnboardingState();
    for (const id of ONBOARDING_STEP_IDS) state = markStep(state, id, T1);
    return state;
  };

  it('claims the offer while the checklist is up and the row unanswered', () => {
    expect(onboardingOwnsOffer(live(), 'reminders', false)).toBe(true);
    expect(onboardingOwnsOffer(live(), 'import', false)).toBe(true);
  });

  it('hands it back once the tour retires', () => {
    // The standing card and Activity's import row take over here — nobody loses the offer.
    expect(onboardingOwnsOffer(finishedTour(), 'reminders', false)).toBe(false);
    expect(onboardingOwnsOffer(finishedTour(), 'import', false)).toBe(false);
  });

  it('hands it back when the checklist is dismissed', () => {
    expect(onboardingOwnsOffer(dismissOnboarding(live()), 'import', false)).toBe(false);
  });

  it('takes the offer again after Support restores the checklist', () => {
    const back = restoreOnboarding(dismissOnboarding(live()));
    expect(onboardingOwnsOffer(back, 'import', false)).toBe(true);
  });

  it('hands it back for a row the reader has already settled', () => {
    expect(onboardingOwnsOffer(dismissStep(live(), 'import'), 'import', false)).toBe(false);
    expect(onboardingOwnsOffer(markStep(live(), 'reminders', T1), 'reminders', false)).toBe(false);
  });

  it('never claims anything for a guest, whose dock shows no such row', () => {
    // A guest's dock is always visible but lists none of these, so without the guest term
    // every guest would look like a reader whose checklist owned an offer it was not showing.
    expect(onboardingOwnsOffer(live(), 'reminders', true)).toBe(false);
  });

  it('claims nothing before the account has answered', () => {
    expect(onboardingOwnsOffer(null, 'reminders', false)).toBe(false);
  });
});
