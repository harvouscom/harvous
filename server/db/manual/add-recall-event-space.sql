-- Recall suppression remembers which room you were in
--
-- Read the header of `add-series-published-thread.sql` before using this file.
-- Additive only: one nullable column and one index. No drops, no rewrites, no backfill.
--
--   npx tsx scripts/run-sql-file.ts server/db/manual/add-recall-event-space.sql
--   (no RLS run needed — this adds a column, not a table)
--
-- The client's cooldown store has always been keyed by space; this table was
-- user-scoped only, so the local half of suppression was space-correct and the
-- cross-device half was not. Dismissing a suggestion on a laptop would have
-- hidden it in every room on a phone.
--
-- NULL means the reader's personal Home. Every existing row came from there —
-- recall has only ever run in the personal space — so existing rows are correct
-- as they stand and the read treats NULL and the personal space as one bucket.

ALTER TABLE "RecallEvents" ADD COLUMN IF NOT EXISTS "spaceId" text;

CREATE INDEX IF NOT EXISTS "RecallEvents_userId_spaceId_createdAtIndex"
  ON "RecallEvents" ("userId", "spaceId", "createdAt");
