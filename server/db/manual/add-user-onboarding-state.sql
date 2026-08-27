-- Getting-started checklist state on UserMetadata
--
-- Read the header of `add-series-published-thread.sql` before using this file —
-- usually the answer is `npm run db:push`, not hand-written SQL.
--
--   npx tsx scripts/run-sql-file.ts server/db/manual/add-user-onboarding-state.sql
--   (no RLS run needed — this adds a column, not a table)
--
-- Nullable and additive. `null` means the account has never stored a checklist,
-- which is not the same as "has done nothing": Home seeds it once from the
-- account's own notes, highlights and reading position, so an established user
-- never meets the checklist at all.
--
-- Deliberately NOT `onboardingPackVersionApplied`, the integer sitting a few
-- columns above. That belongs to the removed seeded-content feature and is dead;
-- reusing it would give one column two unrelated meanings.

ALTER TABLE "UserMetadata" ADD COLUMN IF NOT EXISTS "onboardingState" text;
