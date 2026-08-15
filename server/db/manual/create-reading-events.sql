-- Record what gets read, and remember where reading left off.
--
-- Until now the app knew what you had *written about* and inferred everything else from it.
-- "Continue reading" was guessed from which chapters your notes cited, which is a reasonable
-- proxy for a note-taking app and the wrong one for a Bible: most reading leaves no note, and
-- the chapter you stopped in is precisely the one you have not written about yet.
--
-- Two pieces, deliberately separate:
--
--   ReadingEvents          append-only, one row per chapter opened. Never updated, never
--                          deleted. A reading history is worth most in aggregate, long after
--                          any single row stops mattering, and that does not survive a table
--                          that overwrites itself.
--
--   lastReadPosition       the bookmark, denormalized onto UserMetadata. "Where was I" is
--                          asked on every Home render; answering it from the log would mean an
--                          ordered scan of a table that only ever grows.
--
-- Additive: no existing column changes, no rows are rewritten. Both are safe to run against a
-- live database, and safe to run twice.

CREATE TABLE IF NOT EXISTS "ReadingEvents" (
  "id" text PRIMARY KEY NOT NULL,
  "userId" text NOT NULL,
  "book" text NOT NULL,
  "chapter" integer NOT NULL,
  "translation" text,
  "createdAt" timestamp NOT NULL
);

-- "What did this person read, most recent first" — the log's only ordered read.
CREATE INDEX IF NOT EXISTS "ReadingEvents_userId_createdAtIndex"
  ON "ReadingEvents" ("userId", "createdAt");

-- "How often has this chapter been read" without scanning a whole history to find out.
CREATE INDEX IF NOT EXISTS "ReadingEvents_userId_bookChapterIndex"
  ON "ReadingEvents" ("userId", "book", "chapter");

-- JSON: { book, chapter, verse?, translation?, at }. NULL = has never read in-app, which is
-- what every existing row means and is a true statement about all of them.
ALTER TABLE "UserMetadata" ADD COLUMN IF NOT EXISTS "lastReadPosition" text;
