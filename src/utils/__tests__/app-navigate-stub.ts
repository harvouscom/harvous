/**
 * Test stub for the `app-navigate` alias. The real shim (spa/src/shims/app-navigate.ts) imports the
 * SPA TanStack router, which can't load under vitest/jsdom. Shared components only reference
 * `navigate` lazily, so a no-op is sufficient for unit tests that import them.
 */
export function navigate(): Promise<void> {
  return Promise.resolve();
}
