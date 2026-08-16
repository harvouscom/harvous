-- Two completions for a study plan, and they are different facts
--
-- Read the header of `add-series-published-thread.sql` before using this file.
-- Additive only: three nullable columns, no drops, no rewrites.
--
--   npx tsx scripts/run-sql-file.ts server/db/manual/add-study-plan-completion.sql
--   (no RLS run needed — this adds columns, not tables)
--
-- `ThreadProgress.completedAt` is the *member's own* claim that they finished,
-- written only by an explicit act of that member. It is never derived from
-- `openedNoteIds`: opening a step is not reading it.
--
-- `Threads.closedAt` is the *leader's* claim that the room is done with the run.
-- Separate column on a separate table on purpose — closing a run must never mark
-- a straggler complete, and one member finishing must never close the run.

ALTER TABLE "ThreadProgress" ADD COLUMN IF NOT EXISTS "completedAt" timestamp;

ALTER TABLE "Threads" ADD COLUMN IF NOT EXISTS "closedAt" timestamp;
ALTER TABLE "Threads" ADD COLUMN IF NOT EXISTS "closedByUserId" text;
