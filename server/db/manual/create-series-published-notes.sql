-- Series-grain published material: the second half of "grain: both"
--
-- Read the header of `add-series-published-thread.sql` before using this file —
-- it explains when hand-written SQL is warranted and when the real answer is to
-- merge a branch that is simply behind. This is additive only: one new table,
-- no drops, no column changes to anything that already exists.
--
--   npx tsx scripts/run-sql-file.ts server/db/manual/create-series-published-notes.sql
--   npx tsx scripts/run-enable-rls.ts   # required — this adds a table
--
-- `ChurchServicePublishedNotes` already carries the service grain. This is the
-- same claim pointing at `ChurchSeries.id` instead, so material for an
-- eight-week run is attached once rather than eight times. It is a separate
-- table rather than a nullable `seriesId` on the existing one because that
-- table's uniqueness is `(serviceId, noteId)` and Postgres compares NULLs as
-- distinct — a nullable column would quietly retire a constraint that still
-- reads as though it holds.

CREATE TABLE IF NOT EXISTS "ChurchSeriesPublishedNotes" (
  "id" text PRIMARY KEY,
  "seriesId" text NOT NULL,
  "noteId" text NOT NULL,
  "publishedByUserId" text NOT NULL,
  "createdAt" timestamp NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "ChurchSeriesPublishedNotes_series_note_unique"
  ON "ChurchSeriesPublishedNotes" ("seriesId", "noteId");
CREATE INDEX IF NOT EXISTS "ChurchSeriesPublishedNotes_seriesIdIndex"
  ON "ChurchSeriesPublishedNotes" ("seriesId");
CREATE INDEX IF NOT EXISTS "ChurchSeriesPublishedNotes_noteIdIndex"
  ON "ChurchSeriesPublishedNotes" ("noteId");
