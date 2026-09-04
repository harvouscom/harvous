-- Creates ReviewEvents when Drizzle push has not been run against this database.
-- Prefer: `npm run db:push` with SUPABASE_DIRECT_URL set (keeps all tables in sync).
-- Safe to run in Supabase SQL Editor (uses IF NOT EXISTS).
--
-- Append-only log of what happened to a review item — shown, answered, skipped.
-- Never updated, so "answered this wrong three times running" is a grouped read
-- rather than a counter on ReviewItems that something has to keep correct.
--
-- RLS: `npm run db:rls` enables it on every public table, so run that after this.

CREATE TABLE IF NOT EXISTS "ReviewEvents" (
  "id" text PRIMARY KEY NOT NULL,
  "userId" text NOT NULL,
  "reviewItemId" text NOT NULL,
  "noteId" text,
  "action" text NOT NULL,
  "attempt" text,
  "createdAt" timestamp with time zone NOT NULL
);

CREATE INDEX IF NOT EXISTS "ReviewEvents_userId_createdAtIndex" ON "ReviewEvents" ("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "ReviewEvents_reviewItemId_createdAtIndex" ON "ReviewEvents" ("reviewItemId", "createdAt");
CREATE INDEX IF NOT EXISTS "ReviewEvents_noteIdIndex" ON "ReviewEvents" ("noteId");
