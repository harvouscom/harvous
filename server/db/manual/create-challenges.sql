-- Creates Challenges when Drizzle push has not been run against this database.
-- Prefer: `npm run db:push` with SUPABASE_DIRECT_URL set (keeps all tables in sync).
-- Safe to run in Supabase SQL Editor (uses IF NOT EXISTS).
--
-- A multi-step study prompt in progress. `steps` is the serialised plan rather
-- than a child table: the steps are fixed when the challenge is made from its
-- template, nothing queries across them, and a row per step would be four
-- writes to say what one column already says.
--
-- ReviewItems.challengeId points back here without a foreign key, matching the
-- rest of this schema.
--
-- RLS: `npm run db:rls` enables it on every public table, so run that after this.

CREATE TABLE IF NOT EXISTS "Challenges" (
  "id" text PRIMARY KEY NOT NULL,
  "userId" text NOT NULL,
  "templateKey" text NOT NULL,
  "title" text NOT NULL,
  "status" text NOT NULL DEFAULT 'active',
  "sourceKey" text NOT NULL,
  "sourceNoteId" text,
  "sourceSecondaryNoteId" text,
  "sourceEntryId" text,
  "scriptureReference" text,
  "translation" text,
  "steps" text NOT NULL,
  "currentStepIndex" integer NOT NULL DEFAULT 0,
  "startedAt" timestamp with time zone NOT NULL,
  "lastStepAt" timestamp with time zone,
  "completedAt" timestamp with time zone,
  "createdAt" timestamp with time zone NOT NULL,
  "updatedAt" timestamp with time zone
);

CREATE INDEX IF NOT EXISTS "Challenges_userId_statusIndex" ON "Challenges" ("userId", "status");
-- The cascade filters, so deleting a note can find the challenges made from it.
CREATE INDEX IF NOT EXISTS "Challenges_sourceNoteIdIndex" ON "Challenges" ("sourceNoteId");
CREATE INDEX IF NOT EXISTS "Challenges_sourceSecondaryNoteIdIndex" ON "Challenges" ("sourceSecondaryNoteId");
