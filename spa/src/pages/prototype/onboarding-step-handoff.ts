/**
 * Carrying a checklist row's intent from wherever it was pressed to the surface that can act.
 *
 * The checklist is reachable from the toolbar on every screen now, but its rows lead to places
 * only Home knows how to reach. Rather than teach the toolbar those destinations — a second
 * copy of `handleOnboardingStep` that would drift the first time a step changed — the press is
 * recorded, Home is opened, and Home performs it on arrival.
 */
import { PROTO_ONBOARDING_PENDING_STEP_KEY } from '../../layouts/proto-session-keys';
import { isOnboardingStepId, type OnboardingStepId } from '@/utils/onboarding-state';

export function requestOnboardingStep(id: OnboardingStepId): void {
  try {
    sessionStorage.setItem(PROTO_ONBOARDING_PENDING_STEP_KEY, id);
  } catch {
    /* private mode — the navigation still happens, it just lands on Home plainly */
  }
}

/** Read and clear. Consumed once: a step replayed on every visit to Home would be a trap. */
export function takeOnboardingStep(): OnboardingStepId | null {
  try {
    const raw = sessionStorage.getItem(PROTO_ONBOARDING_PENDING_STEP_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(PROTO_ONBOARDING_PENDING_STEP_KEY);
    return isOnboardingStepId(raw) ? raw : null;
  } catch {
    return null;
  }
}
