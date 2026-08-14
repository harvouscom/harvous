-- Unify reader highlights with scripture-dock highlights.
--
-- StudyThreadEntries is already the highlight store, and `entryKindRaw = 'scriptureLink'`
-- already models a highlight anchored to a passage with no editor mark. Two things stopped
-- the Bible reader from writing into it:
--
--   1. `parentNoteId` was NOT NULL. A highlight made while reading has no parent note.
--   2. Scripture highlights were only ever looked up per parent note
--      (GET /api/notes/:parentNoteId/study-threads/by-scripture), so a highlight on
--      Exodus 5:1 made in note A was invisible in note B's dock for the same verse.
--
-- Together those made "highlights in the reader" and "highlights in a dock" two layers over
-- the same passage. After this migration `parentNoteId` is PROVENANCE — where a highlight was
-- made, NULL meaning "while reading" — and no longer SCOPE. Scope is the reference plus the
-- owner, which is what a study Bible means by a highlight.
--
-- Both statements are reversible: no rows are written, dropped, or rewritten.

ALTER TABLE "StudyThreadEntries" ALTER COLUMN "parentNoteId" DROP NOT NULL;

-- Chapter lookup for the reader is `scriptureReference LIKE 'Exodus 5:%'`. A plain btree
-- index cannot serve a LIKE prefix under non-C collation, so this uses text_pattern_ops,
-- which is ordered for exactly that. userId leads because every query is owner-scoped first.
CREATE INDEX IF NOT EXISTS "StudyThreadEntries_userId_scriptureReferenceIndex"
  ON "StudyThreadEntries" ("userId", "scriptureReference" text_pattern_ops)
  WHERE "scriptureReference" IS NOT NULL;
