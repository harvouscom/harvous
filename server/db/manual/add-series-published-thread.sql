-- Series → study plan: the published Thread a series produced, and the rows
--
-- WHY THIS FILE EXISTS (and when you do NOT need one)
--
-- `npm run db:push` reconciles the whole schema against the live database. On a
-- branch whose `schema.ts` lags that database — one cut from a `main` that
-- predates in-flight work — it therefore offers to DROP the columns it has no
-- schema for. This file was written under exactly that condition, in parallel
-- with several feature branches sharing one dev DB.
--
-- That condition is temporary. Once the branches merged and `main` carried
-- every column, `db:push` ran clean again. **Check whether your branch is just
-- behind before reaching for this pattern** — usually the answer is to merge,
-- not to hand-write SQL.
--
-- When you do need it (additive only, never a drop):
--   npx tsx scripts/run-sql-file.ts <this file>
--   npx tsx scripts/run-enable-rls.ts   # only if you added a table
-- and add the same columns to `schema.ts` in the same commit, so the next push
-- sees them as already applied.

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
