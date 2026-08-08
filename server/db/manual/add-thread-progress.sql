-- Read-together pulse: how far one person has got through a sequence Thread.
--
-- Additive only, run outside `npm run db:push` for the same reason as the other
-- manual files here: push reconciles the whole schema and will propose dropping
-- columns that belong to branches still in flight.
--
--   npx tsx scripts/run-sql-file.ts server/db/manual/add-thread-progress.sql

CREATE TABLE IF NOT EXISTS "ThreadProgress" (
  "threadId" text NOT NULL,
  "userId" text NOT NULL,
  "openedNoteIds" text,
  "startedAt" timestamp NOT NULL,
  "updatedAt" timestamp,
  PRIMARY KEY ("threadId", "userId")
);

CREATE INDEX IF NOT EXISTS "ThreadProgress_threadIdIndex"
  ON "ThreadProgress" ("threadId");
