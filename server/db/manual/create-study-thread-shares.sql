-- Creates StudyThreadShares: public links for personal Threads (study-thread clusters).
-- Additive and safe to re-run (IF NOT EXISTS). Until it is applied, the app treats every
-- personal Thread as unshared and the Share button reports that links are not set up yet.

CREATE TABLE IF NOT EXISTS "StudyThreadShares" (
  "id" text PRIMARY KEY NOT NULL,
  "userId" text NOT NULL,
  "anchorNoteId" text NOT NULL,
  "shareToken" text NOT NULL,
  "createdAt" timestamp with time zone NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "StudyThreadShares_shareTokenIndex" ON "StudyThreadShares" ("shareToken");
CREATE INDEX IF NOT EXISTS "StudyThreadShares_userIdIndex" ON "StudyThreadShares" ("userId");
CREATE INDEX IF NOT EXISTS "StudyThreadShares_anchorNoteIdIndex" ON "StudyThreadShares" ("anchorNoteId");
