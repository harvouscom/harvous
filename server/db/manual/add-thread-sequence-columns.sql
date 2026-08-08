-- Sequence Threads: an authored order over a Thread's notes, and the step a
-- cohort is on.
--
-- Run manually rather than via `npm run db:push`: push wants to reconcile the
-- WHOLE schema, and a branch cut from main will happily propose dropping
-- columns that belong to work still in flight on another branch. These three
-- are purely additive, so they can land on their own without that risk.
--
--   npx tsx scripts/run-sql-file.ts server/db/manual/add-thread-sequence-columns.sql

ALTER TABLE "Threads" ADD COLUMN IF NOT EXISTS "mode" text NOT NULL DEFAULT 'collection';
ALTER TABLE "Threads" ADD COLUMN IF NOT EXISTS "sequenceNoteIds" text;
ALTER TABLE "Threads" ADD COLUMN IF NOT EXISTS "sequenceCurrentNoteId" text;
