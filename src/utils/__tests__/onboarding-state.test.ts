import { describe, it, expect } from 'vitest';
import {
  ONBOARDING_STEP_IDS,
  ONBOARDING_VERSION,
  deriveInitialLatches,
  dismissOnboarding,
  dismissStep,
  emptyOnboardingState,
  markStep,
  markSteps,
  mergeOnboardingStates,
  onboardingProgress,
  parseOnboardingState,
  serializeOnboardingState,
  shouldAutoCompleteOnboarding,
  shouldShowOnboarding,
  type OnboardingSignals,
} from '../onboarding-state';

const T1 = '2026-08-01T10:00:00.000Z';
const T2 = '2026-08-05T10:00:00.000Z';
const T3 = '2026-08-09T10:00:00.000Z';

function signals(over: Partial<OnboardingSignals> = {}): OnboardingSignals {
  return {
    hasReadPosition: false,
    hasNote: false,
    hasScripturePill: false,
    hasHighlight: false,
    ...over,
  };
}

describe('parseOnboardingState', () => {
  it('returns null for absent or unreadable values', () => {
    expect(parseOnboardingState(null)).toBeNull();
    expect(parseOnboardingState('')).toBeNull();
    expect(parseOnboardingState('not json at all')).toBeNull();
    expect(parseOnboardingState('[1,2,3]')).toBeNull();
    expect(parseOnboardingState('"a string"')).toBeNull();
    expect(parseOnboardingState('42')).toBeNull();
  });

  it('fills missing steps rather than trusting a partial object', () => {
    const state = parseOnboardingState('{"version":1,"steps":{"note":{"done":true,"at":"x"}}}');
    expect(state).not.toBeNull();
    expect(state!.steps.note.done).toBe(true);
    for (const id of ONBOARDING_STEP_IDS) {
      expect(state!.steps[id]).toBeDefined();
    }
    expect(state!.steps.read.done).toBe(false);
  });

  it('drops unknown step keys', () => {
    const state = parseOnboardingState('{"steps":{"nonsense":{"done":true},"read":{"done":true}}}');
    expect(Object.keys(state!.steps).sort()).toEqual([...ONBOARDING_STEP_IDS].sort());
    expect(state!.steps.read.done).toBe(true);
  });

  it('coerces junk field types to safe defaults', () => {
    const state = parseOnboardingState(
      '{"version":"nope","dismissedVersion":-4,"completedAt":17,"steps":{"note":{"done":"yes"}}}',
    );
    expect(state!.version).toBe(1);
    expect(state!.dismissedVersion).toBe(0);
    expect(state!.completedAt).toBeNull();
    // A truthy non-boolean must not count as done — only `true` does.
    expect(state!.steps.note.done).toBe(false);
  });

  it('round-trips through serialize', () => {
    const state = markStep(emptyOnboardingState(), 'pill', T1);
    expect(parseOnboardingState(serializeOnboardingState(state))).toEqual(state);
  });
});

describe('mergeOnboardingStates', () => {
  it('never un-completes a step', () => {
    const done = markStep(emptyOnboardingState(), 'note', T1);
    const fresh = emptyOnboardingState();
    expect(mergeOnboardingStates(done, fresh).steps.note.done).toBe(true);
    expect(mergeOnboardingStates(fresh, done).steps.note.done).toBe(true);
  });

  it('never un-dismisses, at either the step or the cluster level', () => {
    const put = dismissOnboarding(dismissStep(emptyOnboardingState(), 'recall'));
    const fresh = emptyOnboardingState();
    const merged = mergeOnboardingStates(fresh, put);
    expect(merged.steps.recall.dismissed).toBe(true);
    expect(merged.dismissedVersion).toBe(ONBOARDING_VERSION);
  });

  it('keeps the earliest completion stamp, not the latest', () => {
    const early = markStep(emptyOnboardingState(), 'read', T1);
    const late = markStep(emptyOnboardingState(), 'read', T3);
    expect(mergeOnboardingStates(late, early).steps.read.at).toBe(T1);
    expect(mergeOnboardingStates(early, late).steps.read.at).toBe(T1);
  });

  it('is commutative and idempotent for a two-device race', () => {
    // Phone did two steps offline; laptop did two others and dismissed one.
    const phone = markSteps(emptyOnboardingState(), ['read', 'note'], T1);
    const laptop = dismissStep(markSteps(emptyOnboardingState(), ['pill', 'thread'], T2), 'recall');

    const ab = mergeOnboardingStates(phone, laptop);
    const ba = mergeOnboardingStates(laptop, phone);
    expect(ab).toEqual(ba);
    expect(mergeOnboardingStates(ab, ab)).toEqual(ab);

    expect(ab.steps.read.done).toBe(true);
    expect(ab.steps.note.done).toBe(true);
    expect(ab.steps.pill.done).toBe(true);
    expect(ab.steps.thread.done).toBe(true);
    expect(ab.steps.recall.dismissed).toBe(true);
  });

  it('takes the higher version on both counters', () => {
    const older = { ...emptyOnboardingState(), version: 1, dismissedVersion: 1 };
    const newer = { ...emptyOnboardingState(), version: 3, dismissedVersion: 0 };
    const merged = mergeOnboardingStates(older, newer);
    expect(merged.version).toBe(3);
    expect(merged.dismissedVersion).toBe(1);
  });

  it('survives a stale device pushing over newer progress', () => {
    // The bug this whole module exists to prevent: laptop syncs Wednesday's progress, then
    // a phone that has been offline since Tuesday flushes its copy.
    const account = markSteps(emptyOnboardingState(), ['read', 'note', 'pill'], T3);
    const stalePhone = markStep(emptyOnboardingState(), 'read', T1);
    const afterFlush = mergeOnboardingStates(account, stalePhone);
    expect(afterFlush.steps.note.done).toBe(true);
    expect(afterFlush.steps.pill.done).toBe(true);
  });
});

describe('markStep / completion', () => {
  it('keeps the original timestamp when re-marked', () => {
    const once = markStep(emptyOnboardingState(), 'note', T1);
    const twice = markStep(once, 'note', T3);
    expect(twice.steps.note.at).toBe(T1);
    expect(twice).toBe(once); // no-op returns the same reference
  });

  it('stamps completedAt only when every step is done', () => {
    let state = emptyOnboardingState();
    for (const id of ONBOARDING_STEP_IDS.slice(0, -1)) state = markStep(state, id, T1);
    expect(state.completedAt).toBeNull();
    state = markStep(state, ONBOARDING_STEP_IDS[ONBOARDING_STEP_IDS.length - 1], T2);
    expect(state.completedAt).toBe(T2);
  });
});

describe('deriveInitialLatches / shouldAutoCompleteOnboarding', () => {
  it('maps signals to their steps', () => {
    expect(deriveInitialLatches(signals({ hasNote: true, hasHighlight: true }))).toEqual([
      'note',
      'highlight',
    ]);
  });

  it('auto-completes an established account but not a partial one', () => {
    expect(
      shouldAutoCompleteOnboarding(
        signals({ hasReadPosition: true, hasNote: true, hasScripturePill: true }),
      ),
    ).toBe(true);
    expect(shouldAutoCompleteOnboarding(signals({ hasNote: true, hasReadPosition: true }))).toBe(
      false,
    );
    expect(shouldAutoCompleteOnboarding(signals())).toBe(false);
  });
});

describe('shouldShowOnboarding', () => {
  it('shows for an account that has never stored state', () => {
    expect(shouldShowOnboarding(null)).toBe(true);
    expect(shouldShowOnboarding(emptyOnboardingState())).toBe(true);
  });

  it('hides once the cluster is dismissed at the current version', () => {
    expect(shouldShowOnboarding(dismissOnboarding(emptyOnboardingState()))).toBe(false);
  });

  it('re-shows when the version moves past an old dismissal', () => {
    const dismissedAtV0 = { ...emptyOnboardingState(), dismissedVersion: ONBOARDING_VERSION - 1 };
    expect(shouldShowOnboarding(dismissedAtV0)).toBe(true);
  });

  it('hides when every step is settled, whether done or individually dismissed', () => {
    let state = emptyOnboardingState();
    for (const id of ONBOARDING_STEP_IDS) state = markStep(state, id, T1);
    expect(shouldShowOnboarding(state)).toBe(false);

    let picked = emptyOnboardingState();
    for (const id of ONBOARDING_STEP_IDS) picked = dismissStep(picked, id);
    expect(shouldShowOnboarding(picked)).toBe(false);
  });

  it('keeps showing while one step remains', () => {
    let state = emptyOnboardingState();
    for (const id of ONBOARDING_STEP_IDS.slice(1)) state = markStep(state, id, T1);
    expect(shouldShowOnboarding(state)).toBe(true);
  });
});

describe('onboardingProgress', () => {
  it('counts against the visible steps, so dismissing one shrinks the denominator', () => {
    const state = dismissStep(markStep(emptyOnboardingState(), 'read', T1), 'recall');
    const progress = onboardingProgress(state);
    expect(progress.done).toBe(1);
    expect(progress.total).toBe(ONBOARDING_STEP_IDS.length - 1);
    expect(progress.visible).not.toContain('recall');
  });
});
