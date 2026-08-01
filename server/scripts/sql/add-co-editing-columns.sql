-- Shared Spaces co-editing ("pass the pen") — additive schema.
--
-- All three columns are nullable or defaulted, so existing rows need no backfill
-- and nothing existing is touched. Safe to run on a live table; safe to re-run.
--
-- Mirrors server/db/schema.ts. After running, `npm run db:check` should be clean
-- and server/db/validate-schema.ts already expects these three names.

-- Author opt-in. Members of any shared space this note is associated with may
-- edit the body. Off by default, so no existing note changes behavior.
ALTER TABLE "Notes"
  ADD COLUMN IF NOT EXISTS "coEditEnabled" boolean NOT NULL DEFAULT false;

ALTER TABLE "Notes"
  ADD COLUMN IF NOT EXISTS "coEditEnabledAt" timestamp;

-- Who actually saved a checkpoint. Null on every pre-existing row, which is read
-- as "the author saved it" — true, since collaborators couldn't write until now.
-- "authorId" keeps its meaning as the note's permanent author; integrity checks
-- and version-history access still depend on that.
ALTER TABLE "NoteVersions"
  ADD COLUMN IF NOT EXISTS "editedBy" text;
