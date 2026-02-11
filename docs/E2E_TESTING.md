# E2E testing (Playwright)

Playwright e2e tests live in `e2e/`. Run with `npm run test:e2e` (or `npx playwright test`). The dev server is started automatically by Playwright unless already running on port 4321.

## Shared-space-join tests

The `e2e/shared-space-join.spec.ts` suite covers the shared space join flow. It depends on seeded data: a space with shareToken `testToken123` (join URL `/spaces/join/testToken123`, title "Test Space 2").

### Which DB is used

The **same** database your dev server uses must be seeded before e2e. If `ASTRO_DB_REMOTE_URL` is set in `.env`, the dev server uses the remote Turso DB; otherwise it uses the local DB. Global setup runs the seed against that DB (remote if the env var is set).

### Seeding before e2e

- **Automatic**: Global setup (`e2e/global-setup.ts`) runs `astro db execute db/seed.ts` (with `--remote` when `ASTRO_DB_REMOTE_URL` is set) before any test. If the seed fails (e.g. rows already exist), setup continues and Clerk is configured anyway.
- **Manual (remote)**: Run `npm run test:e2e:setup` to seed the remote DB and then run e2e. Or run `npx astro db execute db/seed.ts --remote` once, then `npm run test:e2e`.
- **Manual (local)**: Run `npx astro db execute db/seed.ts` (no `--remote`) before e2e if your dev server uses the local DB.

### Test 5: "Owner sees increased member count"

This test signs in as User A, goes to home, and opens the "Test Space 2" space panel to assert member count. The dashboard only shows spaces **owned** by the current user. The seed assigns `space_test_2` to `user_test_123` by default, so User A (your TEST_USER_A_EMAIL account) would not see it.

To make test 5 pass:

1. Set **TEST_USER_A_CLERK_ID** in `.env` to the Clerk user ID of the account you use as TEST_USER_A_EMAIL (from [Clerk Dashboard](https://dashboard.clerk.com) → Users → select user → copy user ID).
2. Re-run the seed so `space_test_2` is owned by that user:  
   `npx astro db execute db/seed.ts --remote` (or without `--remote` for local).
3. Run e2e: `npm run test:e2e`.

### Required env for auth tests

See `e2e/fixtures/auth.ts`: set `TEST_USER_A_EMAIL`, `TEST_USER_A_PASSWORD`, `TEST_USER_B_EMAIL`, `TEST_USER_B_PASSWORD` in `.env` (and `TEST_USER_A_CLERK_ID` for test 5 as above). Both accounts must exist in your Clerk dev environment.
