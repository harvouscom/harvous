-- Creates SearchEvents when Drizzle push has not been run against this database.
-- Prefer: `npm run db:push` with SUPABASE_DIRECT_URL set (keeps all tables in sync).
-- Safe to run in Supabase SQL Editor (uses IF NOT EXISTS).
--
-- Append-only log of searches: the third member of the family that already holds ReadingEvents
-- and NoteVisitEvents, and the only one that records something the reader wanted and did not
-- find. Every other signal in the resurfacing layer is derived from something they made or
-- read; a query that never led anywhere is a stated intent with no artifact behind it.
--
-- Two actions ('query', 'resultOpen') and no UPDATE, so "asked repeatedly, opened nothing" is a
-- grouped read rather than a counter something has to keep correct.
--
-- The query text is the sensitive column here. It is normalized on write, aged out on read,
-- and deleted for real by both clear-data and delete-account — SearchEvents carries no noteId,
-- so the note delete cascade cannot reach it and the explicit deletes are the only thing that
-- can. It is never sent to analytics.
--
-- RLS: `npm run db:rls` enables it on every public table, so run that after this.

CREATE TABLE IF NOT EXISTS "SearchEvents" (
  "id" text PRIMARY KEY NOT NULL,
  "userId" text NOT NULL,
  "query" text NOT NULL,
  "action" text NOT NULL,
  "resultCount" integer NOT NULL,
  "surface" text NOT NULL,
  "createdAt" timestamp with time zone NOT NULL
);

CREATE INDEX IF NOT EXISTS "SearchEvents_userId_createdAtIndex" ON "SearchEvents" ("userId", "createdAt");
-- Grouping repeats of one term for a reader is the whole read pattern; without this it is a
-- scan of everything they have ever typed.
CREATE INDEX IF NOT EXISTS "SearchEvents_userId_queryIndex" ON "SearchEvents" ("userId", "query");
