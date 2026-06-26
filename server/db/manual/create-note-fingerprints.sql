-- Creates NoteFingerprints when Drizzle push has not been run against this database.
-- Prefer: `npm run db:push` with SUPABASE_DIRECT_URL set (keeps all tables in sync).
-- Safe to run in Supabase SQL Editor (uses IF NOT EXISTS).
--
-- Memory layer Workstream A: one server-derived semantic profile per user note.
-- See docs/future/MEMORY_LAYER_ASSESSMENT.md.

CREATE TABLE IF NOT EXISTS "NoteFingerprints" (
  "noteId" text PRIMARY KEY NOT NULL,
  "userId" text NOT NULL,
  "themes" text,
  "people" text,
  "places" text,
  "passageCount" integer DEFAULT 0 NOT NULL,
  "emotionalTone" text,
  "toneScores" text,
  "meaningWeight" real DEFAULT 0 NOT NULL,
  "computedAt" timestamp with time zone NOT NULL
);

CREATE INDEX IF NOT EXISTS "NoteFingerprints_userIdIndex" ON "NoteFingerprints" ("userId");
CREATE INDEX IF NOT EXISTS "NoteFingerprints_userId_meaningWeightIndex" ON "NoteFingerprints" ("userId", "meaningWeight");
