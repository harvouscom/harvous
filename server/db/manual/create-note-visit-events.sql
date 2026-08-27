-- Creates NoteVisitEvents when Drizzle push has not been run against this database.
-- Prefer: `npm run db:push` with SUPABASE_DIRECT_URL set (keeps all tables in sync).
-- Safe to run in Supabase SQL Editor (uses IF NOT EXISTS).
--
-- Append-only log of notes opened and read: the note-side twin of ReadingEvents. Feeds the
-- visit signal in Home's resurfacing ranking. Deliberately not Notes.lastVisited — the sync
-- delta pull treats that column as a change trigger, so stamping it on every note open would
-- push a sync delta per open.
--
-- RLS: `npm run db:rls` enables it on every public table, so run that after this.

CREATE TABLE IF NOT EXISTS "NoteVisitEvents" (
  "id" text PRIMARY KEY NOT NULL,
  "userId" text NOT NULL,
  "noteId" text NOT NULL,
  "dwellBucket" text NOT NULL,
  "createdAt" timestamp with time zone NOT NULL
);

CREATE INDEX IF NOT EXISTS "NoteVisitEvents_userId_createdAtIndex" ON "NoteVisitEvents" ("userId", "createdAt");
CREATE INDEX IF NOT EXISTS "NoteVisitEvents_noteIdIndex" ON "NoteVisitEvents" ("noteId");
