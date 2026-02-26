# Clerk duplicate user: missing notes/threads

## Problem

A user logs in and only sees a few recent items; their older notes and threads are missing. In Turso you see **two different Clerk user IDs** for what should be one person. The "old" ID has most of the data; the "new" ID is what Clerk returns when they sign in now.

## Cause

The same person ended up with two Clerk identities. Common causes:

- **Sign-up again** – User signed up a second time (e.g. different email or "Create account" instead of "Sign in") instead of using the original account.
- **Clerk app/instance change** – Production was pointed at a different Clerk application or key, so the same email got a new user ID.
- **Account merge / migration** – Clerk or your app created a new user and never merged the old one.

Our app stores everything by Clerk `userId`. If Clerk starts returning a different ID for that person, the app only shows data for the new ID; the old data stays under the old ID.

### pk_test in production (test vs live keys)

If production was mistakenly configured with **test** Clerk keys (`pk_test_...` / `sk_test_...`) instead of **live** keys (`pk_live_...` / `sk_live_...`), then:

- **Live Clerk user IDs** = original accounts; they hold the data that existed *before* the mistake (e.g. existing notes/threads).
- **Test Clerk user IDs** = identities created while prod used test keys; they may have 0 or a few items created during the mistake.

**Step 1 – Restore pre-mistake data:** Set Netlify env to **live** keys only (`VITE_CLERK_PUBLISHABLE_KEY=pk_live_...`, `CLERK_SECRET_KEY=sk_live_...`) and redeploy. After that, users sign in with their **live** ID and immediately see all pre-mistake data (no migration needed for that).

**Step 2 – Merge test-created data into live:** For each user who created data under a test ID during the mistake, run `scripts/merge-test-user-into-live.ts` (see below). It moves all content from the test user into the live user and **merges** UserMetadata / UserLifetimeXP / UserSeasonalXP so the live account keeps the correct or better values (e.g. `highestSimpleNoteId = max(live, test)`). It does **not** delete or overwrite the live user’s metadata.

#### Option: read-time mapping (no data migration)

When **all** Turso data is under **test** (Development) user IDs and you have switched production to **live** keys, you can avoid migrating 100+ user IDs by resolving live to dev at request time:

1. **Schema:** Add the `ClerkUserMapping` table (see `server/db/schema.ts`), then run `npm run db:push` so production has the table.
2. **Populate once:** Run `npx tsx scripts/populate-clerk-user-mapping.ts` against the production DB (same `ASTRO_DB_*` env). This copies `userId` and `email` from `UserMetadata` (where email is set) into `ClerkUserMapping` as `devUserId` and normalized `email`.
3. **Deploy:** The auth middleware (see `server/middleware/auth.ts`) will, for each authenticated request, look up the current (live) user ID in `ClerkUserMapping` by `liveUserId` or by email (via Clerk API). On **first** login for a mapped user, it merges all data from the dev user into the live user (same logic as `merge-test-user-into-live.ts`), sets `migratedToLiveAt` on the mapping row, and uses the **live** user ID for that and all future requests. So over time Turso ends up with pk_live (Production) user IDs as canonical; no manual per-user merge needed.

Legacy users **without** an email in `UserMetadata` are not in the mapping and will see empty data after signing in with live. You can add manual rows to `ClerkUserMapping` (devUserId, email from Clerk, and optionally liveUserId) or use a one-off script with Clerk test keys to backfill emails for those users.

## Fix: reassign data to the current Clerk user

We have a one-off script that moves **all** rows from the old Clerk user ID to the new one. After running it, the account they use now (new ID) will own all notes, threads, spaces, XP, etc.

### 1. Identify the two IDs

- **Old ID** – The one that has the missing data in Turso (e.g. from `scripts/check-user-ids-in-db.ts` or Turso UI).
- **New ID** – The one Clerk returns when they’re logged in (e.g. from production `/api/debug/me`: `userIdPrefix` plus the rest of the ID, or from Clerk Dashboard → Users).

### 2. Run the migration (once per affected user)

From the repo root, with the **same** Turso credentials production uses (e.g. in `.env`):

```bash
OLD_CLERK_USER_ID=user_35TxUL3GoQDZYHUoj90FXDtJveX \
NEW_CLERK_USER_ID=user_35FUJeLEI2L0gRjCJqIIbNWraRK \
npx tsx scripts/migrate-clerk-user.ts
```

- `OLD_CLERK_USER_ID` = the ID that currently has the data (e.g. ~80 notes).
- `NEW_CLERK_USER_ID` = the ID they’re logged in with now (the one that should own everything after the script).

Requires: `ASTRO_DB_REMOTE_URL`, `ASTRO_DB_APP_TOKEN` (same as production).

### 3. Verify

Have the user refresh the app (or log out and back in). They should see all notes/threads. You can confirm with `/api/debug/me` (should show the higher note/thread counts for the new ID).

## If this is affecting many users (e.g. all users after clear-split + pk_test)

When **all** (or most) current users are affected—for example production was on pk_test after merging clear-split-migration and everyone signed in during that window—you can merge every affected user in one batch:

1. **Get all user IDs that have data**  
   Run `npx tsx scripts/check-user-ids-in-db.ts` against the production DB. You’ll see Notes/Threads counts per userId. Any ID with data that is from the **test** Clerk app needs a matching **live** ID.

2. **Build the test → live mapping**  
   - **Option A (recommended for 50+ users):** Generate the CSV from Clerk with one command. Get your **Test** application secret key from Clerk Dashboard → Test application → API Keys (`sk_test_...`). Then run:
     ```bash
     CLERK_SECRET_KEY_TEST=sk_test_... npx tsx scripts/generate-merge-pairs-from-clerk.ts
     ```
     (Use your existing `CLERK_SECRET_KEY` in `.env` for live; the script fetches users from both apps and matches by email, then writes `merge-pairs.csv`.)
   - **Option B (manual):** In **Clerk Dashboard**, open your **Test** application and list users (user ID + primary email). Open your **Live** application and list users (user ID + primary email). Match by **email** (same person): test user ID → live user ID. Create a CSV file (e.g. `merge-pairs.csv`) with one pair per line:
     ```csv
     test_user_id,live_user_id
     user_35FUJeLEI2L0gRjCJqIIbNWraRK,user_35TxUL3GoQDZYHUoj90FXDtJveX
     user_2abc...,user_2def...
     ```
     First line may be the header `test_user_id,live_user_id`; the script will skip it. See `scripts/merge-pairs.csv.example`.

3. **Run the batch merge**  
   With production DB credentials in `.env`:
   ```bash
   MERGE_PAIRS_CSV=merge-pairs.csv npx tsx scripts/merge-test-user-into-live.ts
   ```
   The script will merge each pair in order. After it finishes, have users sign in in production (with live keys) to verify.

**Single-user fallback:** For one-off cases, use `TEST_CLERK_USER_ID` and `LIVE_CLERK_USER_ID` as in the “Merge test user into live” section below; no CSV needed.

## Prevention

- Use a single Clerk application and key set for production so the same person always gets the same user ID.
- In Clerk Dashboard, consider merging duplicate users (if both exist) so only one identity remains.
- Encourage "Sign in" instead of creating a second account when the user already has one (e.g. copy and sign-in flow).

## Merge test user into live (pk_test mistake)

When production was on pk_test and you’ve switched back to pk_live, use this script to merge data created under a **test** user ID into the corresponding **live** user, without overwriting the live user’s UserMetadata or UserLifetimeXP:

```bash
TEST_CLERK_USER_ID=user_35FUJeL... LIVE_CLERK_USER_ID=user_35TxUL... \
npx tsx scripts/merge-test-user-into-live.ts
```

- `TEST_CLERK_USER_ID` = the test-app user ID that has the data to merge in (e.g. the “new” ID that had only a few items).
- `LIVE_CLERK_USER_ID` = the live-app user ID (canonical account; same person, from Clerk live application).

**Batch (all affected users):** Create `merge-pairs.csv` with one `test_user_id,live_user_id` per line (see "If this is affecting many users" above and `scripts/merge-pairs.csv.example`), then run:
`MERGE_PAIRS_CSV=merge-pairs.csv npx tsx scripts/merge-test-user-into-live.ts`

Requires: `ASTRO_DB_REMOTE_URL`, `ASTRO_DB_APP_TOKEN` (e.g. production credentials in `.env`).

## Related

- `scripts/populate-clerk-user-mapping.ts` – one-time populate of ClerkUserMapping from UserMetadata (for read-time live→dev resolution).
- `scripts/check-user-ids-in-db.ts` – list Notes/Threads counts per userId.
- `scripts/migrate-clerk-user.ts` – reassign all rows from one Clerk userId to another (use when the *new* ID has no important metadata).
- `scripts/merge-test-user-into-live.ts` – merge test user data into live user without overwriting live’s UserMetadata/UserLifetimeXP (single or batch via MERGE_PAIRS_CSV).
- `scripts/merge-pairs.csv.example` – example CSV for batch merge.
- `scripts/generate-merge-pairs-from-clerk.ts` – build merge-pairs.csv from Clerk Test/Live users (match by email); use for 50+ users.
- `server/routes/debug.ts` – `GET /api/debug/me` returns current auth userId and DB counts (for verifying which ID is in use and that migration worked).
