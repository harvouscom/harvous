/**
 * React access to the getting-started checklist, plus the module-level calls that let a
 * surface anywhere in the app record that a step happened.
 *
 * The module-level functions are the point. A checklist is completed by doing things, and
 * the things are done in the reader, the editor and the create-thread sheet — none of which
 * should learn about onboarding, or take a callback threaded down from Home to record it.
 * They call `markOnboardingStepDone('thread')` and forget about it.
 */
import { useCallback, useSyncExternalStore } from 'react';
import {
  getOnboardingServerSnapshot,
  getOnboardingSnapshot,
  markOnboardingStep,
  onboardingPreviewMode,
  subscribeOnboardingState,
  updateOnboardingState,
} from '../../lib/proto-onboarding-sync';
import { PROTO_SPOTLIGHT_KEY } from '../../layouts/proto-session-keys';
import {
  dismissOnboarding as dismissAll,
  dismissStep as dismissOne,
  emptyOnboardingState,
  markStep,
  markSteps,
  onboardingProgress,
  shouldAutoCompleteOnboarding,
  shouldShowOnboarding,
  ONBOARDING_STEP_IDS,
  type OnboardingSignals,
  type OnboardingState,
  type OnboardingStepId,
} from '@/utils/onboarding-state';

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Record a step as done. Safe to call repeatedly — the first call is the one that counts.
 *
 * Re-exported from the sync module so callers have one obvious import for this, next to the
 * hook. The primitive lives down there because the editor's scripture-confirm listener needs
 * it before any component has mounted.
 */
export const markOnboardingStepDone = markOnboardingStep;

/**
 * Seed the checklist from what the account's own data already says.
 *
 * Called once by Home after its queries settle. An account that has read, written, cited
 * and highlighted gets the whole thing marked done and never sees it; a partly-started one
 * gets those steps pre-checked, which is the difference between "here's where you are" and
 * a list that asks someone to do things they did last year.
 *
 * Only ever acts on a *fresh* state. Re-running the auto-complete check later would be a
 * bug with teeth: a real new user who finishes three steps would trip the threshold and
 * have the last ones swept away mid-checklist.
 */
export function seedOnboardingFromSignals(signals: OnboardingSignals): void {
  // Preview exists to show the empty checklist; seeding it against a real account's data
  // would immediately auto-complete the thing you turned preview on to look at.
  if (onboardingPreviewMode) return;
  updateOnboardingState((state) => {
    const at = nowIso();
    const fresh = isFreshOnboardingState(state);
    /*
     * The auto-complete question is asked once and never again.
     *
     * Re-asking it later is a bug with teeth: a real new user who finishes three steps trips
     * the same threshold, and the rest of the checklist is swept away mid-use. Once anything
     * is recorded the state is no longer fresh, so this branch closes for good.
     */
    if (fresh && shouldAutoCompleteOnboarding(signals)) {
      return markSteps(state, ONBOARDING_STEP_IDS, at);
    }
    /*
     * Otherwise latch whatever the account's data currently answers "yes" to, so a verse
     * highlighted on Tuesday ticks its row over on Tuesday without the reader ever knowing
     * the checklist exists.
     *
     * 'pill' is the exception, and only after the first pass. Its signal — the space's
     * scripture index — also fills from highlights, which create notes carrying the
     * reference. Trusting it continuously would tick "Mention a verse" for someone who had
     * only ever highlighted, which is precisely the confusion that row exists to clear up.
     * On a *fresh* state it is still the best evidence available and it is how an
     * established account gets credit for years of references, so the first pass keeps it;
     * from then on the editor reports the real thing (see the confirm listener in
     * proto-onboarding-sync.ts).
     */
    const ids = fresh ? deriveIds(signals) : deriveIds(signals).filter((id) => id !== 'pill');
    return markSteps(state, ids, at);
  });
}

function deriveIds(signals: OnboardingSignals): OnboardingStepId[] {
  const ids: OnboardingStepId[] = [];
  if (signals.hasReadPosition) ids.push('read');
  if (signals.hasNote) ids.push('note');
  if (signals.hasScripturePill) ids.push('pill');
  if (signals.hasHighlight) ids.push('highlight');
  return ids;
}

/** Nothing has ever been recorded — indistinguishable from a state that was just created. */
function isFreshOnboardingState(state: OnboardingState): boolean {
  if (state.dismissedVersion > 0 || state.completedAt) return false;
  return ONBOARDING_STEP_IDS.every((id) => !state.steps[id].done && !state.steps[id].dismissed);
}

/**
 * Hand the next screen a one-shot glow to play when it mounts.
 *
 * Written just before navigating. The target reads and clears it, so a glow fires once, for
 * the trip that asked for it, and never again on a later visit to the same screen.
 */
export function requestSpotlight(target: string): void {
  try {
    sessionStorage.setItem(PROTO_SPOTLIGHT_KEY, target);
  } catch {
    /* the row still navigates; the glow is a garnish */
  }
}

export interface UseOnboardingResult {
  state: OnboardingState;
  /** The account has answered — the gate on seeding. */
  hydrated: boolean;
  /** There is something trustworthy to render from — the gate on showing anything. */
  ready: boolean;
  visible: boolean;
  progress: ReturnType<typeof onboardingProgress>;
  markDone: (id: OnboardingStepId) => void;
  dismissStep: (id: OnboardingStepId) => void;
  dismissAll: () => void;
}

export function useOnboardingState(): UseOnboardingResult {
  const snapshot = useSyncExternalStore(
    subscribeOnboardingState,
    getOnboardingSnapshot,
    getOnboardingServerSnapshot,
  );

  const markDone = useCallback((id: OnboardingStepId) => markOnboardingStepDone(id), []);
  const dismissStep = useCallback((id: OnboardingStepId) => {
    updateOnboardingState((state) => dismissOne(state, id));
  }, []);
  const dismissCluster = useCallback(() => {
    updateOnboardingState((state) => dismissAll(state));
  }, []);

  const state = snapshot.state ?? emptyOnboardingState();

  const ready = snapshot.hydrated || snapshot.fromCache;

  return {
    state,
    hydrated: snapshot.hydrated,
    ready,
    visible: ready && shouldShowOnboarding(snapshot.state),
    progress: onboardingProgress(state),
    markDone,
    dismissStep,
    dismissAll: dismissCluster,
  };
}
