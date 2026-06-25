/**
 * Cross-device appearance sync bridge.
 *
 * The shared sync layer (`sync-manager.ts`, in root `src/`) applies the
 * `UserMetadata.appearanceSettings` column on bootstrap / changes / realtime,
 * but the code that writes localStorage and repaints the canvas lives in the
 * prototype SPA (`spa/src/lib/prototype-background.ts`). To keep that
 * dependency direction clean (spa → src, never the reverse), the sync layer
 * just emits this window event and the SPA listens for it.
 *
 * `detail.appearanceSettings` is the raw JSON string from the account, or
 * `null` when the account has never stored appearance (seed path).
 */
export const HARVOUS_APPEARANCE_ACCOUNT_SYNC = 'harvousAppearanceAccountSync';

export interface AppearanceAccountSyncDetail {
  appearanceSettings: string | null;
}

export function dispatchAppearanceAccountSync(appearanceSettings: string | null): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<AppearanceAccountSyncDetail>(HARVOUS_APPEARANCE_ACCOUNT_SYNC, {
      detail: { appearanceSettings },
    }),
  );
}
