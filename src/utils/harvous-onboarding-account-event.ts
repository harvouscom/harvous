/**
 * Cross-device onboarding sync bridge.
 *
 * Same shape and same reason as `harvous-appearance-account-event.ts`: the shared sync
 * layer (`sync-manager.ts`, in root `src/`) sees the `UserMetadata.onboardingState` column
 * arrive, but the code that owns the localStorage cache lives in the SPA
 * (`spa/src/lib/proto-onboarding-sync.ts`). The event keeps the dependency direction
 * one-way (spa → src, never the reverse).
 *
 * `detail.onboardingState` is the raw JSON string from the account, or `null` when the
 * account has never stored any — which is not an error, just a new account.
 */
export const HARVOUS_ONBOARDING_ACCOUNT_SYNC = 'harvousOnboardingAccountSync';

export interface OnboardingAccountSyncDetail {
  onboardingState: string | null;
}

export function dispatchOnboardingAccountSync(onboardingState: string | null): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<OnboardingAccountSyncDetail>(HARVOUS_ONBOARDING_ACCOUNT_SYNC, {
      detail: { onboardingState },
    }),
  );
}
