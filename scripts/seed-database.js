/**
 * No seed needed for a clean new user with only the onboarding thread.
 *
 * To get "just the onboarding notes" (no sample data):
 * - Sign up with a new account — the app creates only the onboarding thread automatically.
 * - Or, while logged in (dev): POST to /api/test/reset-to-new-user, then refresh the page.
 *
 * Do not run this script to seed the DB; it only prints this message.
 */
console.log(`
No seed needed for a clean new user with only onboarding.

To get just the onboarding notes (no sample data):
  • Sign up with a new account — the app creates only the onboarding thread.
  • Or (dev): POST to /api/test/reset-to-new-user, then refresh the page.
`);
