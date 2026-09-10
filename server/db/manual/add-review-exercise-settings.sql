-- Review exercise preferences: one column on UserMetadata.
--
-- Read the header of `add-push-reminders.sql` before using this file — usually the answer is
-- `npm run db:push`, not hand-written SQL. Kept here so the change is greppable next to its
-- siblings.
--
-- Apply this BEFORE deploying the branch. Drizzle's full-row `select()` expands to every column
-- in the schema file, so until this column exists, /api/user/get-profile, /api/navigation/data
-- and /api/user/update-onboarding return 500 for every signed-in user — endpoints that have
-- nothing to do with Review.

ALTER TABLE "UserMetadata" ADD COLUMN IF NOT EXISTS "reviewExerciseSettings" text;
