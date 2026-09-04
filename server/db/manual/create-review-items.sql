-- Creates ReviewItems when Drizzle push has not been run against this database.
-- Prefer: `npm run db:push` with SUPABASE_DIRECT_URL set (keeps all tables in sync).
-- Safe to run in Supabase SQL Editor (uses IF NOT EXISTS).
--
-- The review queue: one row per thing waiting to come back, whatever kind of
-- thing it is. `sourceKey` is what makes an item the same item across refills,
-- which is why it carries the unique index with userId rather than an id nobody
-- outside the table knows.
--
-- `challengeId` points at Challenges without a foreign key, matching the rest of
-- this schema — the cascade filters below are how deletes reach these rows.
--
-- RLS: `npm run db:rls` enables it on every public table, so run that after this.

CREATE TABLE IF NOT EXISTS "ReviewItems" (
  "id" text PRIMARY KEY NOT NULL,
  "userId" text NOT NULL,
  "kind" text NOT NULL,
  "sourceKey" text NOT NULL,
  "noteId" text,
  "secondaryNoteId" text,
  "studyThreadEntryId" text,
  "scriptureReference" text,
  "translation" text,
  "status" text NOT NULL DEFAULT 'active',
  "recallState" text NOT NULL DEFAULT 'new',
  "dueAt" timestamp with time zone NOT NULL,
  "lastReviewedAt" timestamp with time zone,
  "lastOutcome" text,
  "successStreak" integer NOT NULL DEFAULT 0,
  "reviewCount" integer NOT NULL DEFAULT 0,
  "ladderStep" integer NOT NULL DEFAULT 0,
  "origin" text NOT NULL DEFAULT 'user',
  "sourceLabel" text,
  "sourceAt" timestamp with time zone,
  "challengeId" text,
  "createdAt" timestamp with time zone NOT NULL,
  "updatedAt" timestamp with time zone
);

-- The upsert target: what makes a refill find the existing item instead of adding a second one.
CREATE UNIQUE INDEX IF NOT EXISTS "ReviewItems_userId_sourceKeyIndex" ON "ReviewItems" ("userId", "sourceKey");
-- The inbox read: due, active, oldest first.
CREATE INDEX IF NOT EXISTS "ReviewItems_userId_status_dueAtIndex" ON "ReviewItems" ("userId", "status", "dueAt");
-- The three cascade filters, so deleting a note or an entry can find its items.
CREATE INDEX IF NOT EXISTS "ReviewItems_noteIdIndex" ON "ReviewItems" ("noteId");
CREATE INDEX IF NOT EXISTS "ReviewItems_secondaryNoteIdIndex" ON "ReviewItems" ("secondaryNoteId");
CREATE INDEX IF NOT EXISTS "ReviewItems_studyThreadEntryIdIndex" ON "ReviewItems" ("studyThreadEntryId");
