-- Creates StudyThreadEntries when Drizzle push has not been run against this database.
-- Prefer: `npm run db:push` with SUPABASE_DIRECT_URL set (keeps all tables in sync).
-- Safe to run in Supabase SQL Editor (uses IF NOT EXISTS).

CREATE TABLE IF NOT EXISTS "StudyThreadEntries" (
  "id" text PRIMARY KEY NOT NULL,
  "userId" text NOT NULL,
  "parentNoteId" text NOT NULL,
  "spaceId" text,
  "entryKindRaw" text DEFAULT 'miniNote' NOT NULL,
  "highlightAccentRaw" text DEFAULT 'warmAmber' NOT NULL,
  "sourceSnippet" text DEFAULT '' NOT NULL,
  "focusTitle" text DEFAULT '' NOT NULL,
  "notesBody" text DEFAULT '' NOT NULL,
  "miniNoteBody" text DEFAULT '' NOT NULL,
  "linkedNoteId" text,
  "linkedNoteTitle" text,
  "anchorLocation" integer,
  "anchorLength" integer,
  "anchorTextSnapshot" text,
  "scriptureReference" text,
  "scripturePassageTranslation" text,
  "scripturePassageExcerpt" text,
  "isArchived" boolean DEFAULT false NOT NULL,
  "highlightListEditedAt" timestamp with time zone,
  "createdAt" timestamp with time zone NOT NULL,
  "updatedAt" timestamp with time zone
);

CREATE INDEX IF NOT EXISTS "StudyThreadEntries_parentNoteIdIndex" ON "StudyThreadEntries" ("parentNoteId");
CREATE INDEX IF NOT EXISTS "StudyThreadEntries_userIdIndex" ON "StudyThreadEntries" ("userId");
