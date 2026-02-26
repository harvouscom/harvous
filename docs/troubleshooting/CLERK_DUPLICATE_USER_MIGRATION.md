# Clerk duplicate user: missing notes/threads

## Problem

A user logs in and only sees a few recent items; their older notes and threads are missing. In Turso you see **two different Clerk user IDs** for what should be one person. The "old" ID has most of the data; the "new" ID is what Clerk returns when they sign in now.

## Cause

The same person ended up with two Clerk identities. Common causes:

- **Sign-up again** – User signed up a second time (e.g. different email or "Create account" instead of "Sign in") instead of using the original account.
- **Clerk app/instance change** – Production was pointed at a different Clerk application or key, so the same email got a new user ID.
- **Account merge / migration** – Clerk or your app created a new user and never merged the old one.

Our app stores everything by Clerk `userId`. If Clerk starts returning a different ID for that person, the app only shows data for the new ID; the old data stays under the old ID.

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

## If this is affecting many users

- Run `scripts/check-user-ids-in-db.ts` to see all user IDs and row counts.
- For each user who reports missing data, you need the mapping: **old Clerk ID** (the one with the data) → **new Clerk ID** (the one they use to sign in). You can get the new ID from Clerk Dashboard (match by email) or by having them call `/api/debug/me` while logged in.
- Run `migrate-clerk-user.ts` once per mapping, or extend the script to accept a list of (old, new) pairs.

## Prevention

- Use a single Clerk application and key set for production so the same person always gets the same user ID.
- In Clerk Dashboard, consider merging duplicate users (if both exist) so only one identity remains.
- Encourage "Sign in" instead of creating a second account when the user already has one (e.g. copy and sign-in flow).

## Related

- `scripts/check-user-ids-in-db.ts` – list Notes/Threads counts per userId.
- `scripts/migrate-clerk-user.ts` – reassign all rows from one Clerk userId to another.
- `server/routes/debug.ts` – `GET /api/debug/me` returns current auth userId and DB counts (for verifying which ID is in use and that migration worked).
