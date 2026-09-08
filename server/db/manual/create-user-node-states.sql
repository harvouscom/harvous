-- Creates UserNodeStates when Drizzle push has not been run against this database.
-- Prefer: `npm run db:push` with SUPABASE_DIRECT_URL set (keeps all tables in sync).
-- Safe to run in Supabase SQL Editor (uses IF NOT EXISTS).
--
-- The reader's own study Bible layer: one row per node they have met, holding
-- how they have met it. The counters are separate columns rather than one blob
-- because each is written by a different surface and they must not overwrite
-- each other.
--
-- Not canonical for what a node *is* — that stays in the curated knowledge
-- layer. This records only a person's relationship to it.
--
-- RLS: `npm run db:rls` enables it on every public table, so run that after this.

CREATE TABLE IF NOT EXISTS "UserNodeStates" (
  "id" text PRIMARY KEY NOT NULL,
  "userId" text NOT NULL,
  "nodeKind" text NOT NULL,
  "nodeKey" text NOT NULL,
  "label" text,
  "noteId" text,
  "secondaryNoteId" text,
  "exposureCount" integer NOT NULL DEFAULT 0,
  "revisitCount" integer NOT NULL DEFAULT 0,
  "explicitConnectionCount" integer NOT NULL DEFAULT 0,
  "expansionCount" integer NOT NULL DEFAULT 0,
  "synthesisCount" integer NOT NULL DEFAULT 0,
  "reviewCount" integer NOT NULL DEFAULT 0,
  "firstStudiedAt" timestamp with time zone NOT NULL,
  "lastSeenAt" timestamp with time zone NOT NULL,
  "lastReviewedAt" timestamp with time zone,
  "nextReviewAt" timestamp with time zone,
  "recallState" text NOT NULL DEFAULT 'new',
  "lastSignal" text NOT NULL,
  "lastSourceLabel" text,
  "lastSourceAt" timestamp with time zone NOT NULL,
  "status" text NOT NULL DEFAULT 'active',
  "meta" text,
  "createdAt" timestamp with time zone NOT NULL,
  "updatedAt" timestamp with time zone NOT NULL
);

-- The upsert target. Every writer goes through touchNodes, which conflicts on this.
CREATE UNIQUE INDEX IF NOT EXISTS "UserNodeStates_userId_nodeKeyIndex" ON "UserNodeStates" ("userId", "nodeKey");
-- The engine's read (kinds it reviews, most recent first) and Home's (themes, people).
CREATE INDEX IF NOT EXISTS "UserNodeStates_userId_nodeKind_lastSeenAtIndex" ON "UserNodeStates" ("userId", "nodeKind", "lastSeenAt");
-- The cascade filters, for the same reason ReviewItems carries both.
CREATE INDEX IF NOT EXISTS "UserNodeStates_noteIdIndex" ON "UserNodeStates" ("noteId");
CREATE INDEX IF NOT EXISTS "UserNodeStates_secondaryNoteIdIndex" ON "UserNodeStates" ("secondaryNoteId");
