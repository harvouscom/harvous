-- Series → study plan: the published Thread a series produced, and the rows
-- that let published material claim the week it accompanies.
--
-- Additive only, run outside `npm run db:push` for the same reason as
-- add-thread-sequence-columns.sql: push reconciles the whole schema and will
-- propose dropping columns that belong to branches still in flight.
--
--   npx tsx scripts/run-sql-file.ts server/db/manual/add-series-published-thread.sql

ALTER TABLE "ChurchSeries" ADD COLUMN IF NOT EXISTS "publishedThreadId" text;

CREATE TABLE IF NOT EXISTS "ChurchServicePublishedNotes" (
  "id" text PRIMARY KEY,
  "serviceId" text NOT NULL,
  "noteId" text NOT NULL,
  "publishedByUserId" text NOT NULL,
  "createdAt" timestamp NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "ChurchServicePublishedNotes_service_note_unique"
  ON "ChurchServicePublishedNotes" ("serviceId", "noteId");
CREATE INDEX IF NOT EXISTS "ChurchServicePublishedNotes_serviceIdIndex"
  ON "ChurchServicePublishedNotes" ("serviceId");
CREATE INDEX IF NOT EXISTS "ChurchServicePublishedNotes_noteIdIndex"
  ON "ChurchServicePublishedNotes" ("noteId");
