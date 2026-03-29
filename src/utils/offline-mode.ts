/**
 * Offline mode is now always enabled (feature flag removed).
 * Extracted from posthog.ts so callers don't pull in the posthog-js bundle.
 */
export function isOfflineModeEnabled(): boolean {
  return true;
}
