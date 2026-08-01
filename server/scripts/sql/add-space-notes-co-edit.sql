-- Per-space co-editing — additive schema + backfill from note-level flag.
--
-- Source of truth moves to SpaceNotes.coEditEnabled. Notes.coEditEnabled stays
-- as an OR-mirror (any live shared association with co-edit on).
-- Safe to re-run.

ALTER TABLE "SpaceNotes"
  ADD COLUMN IF NOT EXISTS "coEditEnabled" boolean NOT NULL DEFAULT false;

ALTER TABLE "SpaceNotes"
  ADD COLUMN IF NOT EXISTS "coEditEnabledAt" timestamp;

-- Notes that were opted in at the note level: open co-edit on every live shared
-- association they still have, so existing behavior is preserved.
UPDATE "SpaceNotes" sn
SET
  "coEditEnabled" = true,
  "coEditEnabledAt" = COALESCE(n."coEditEnabledAt", sn."coEditEnabledAt", NOW())
FROM "Notes" n, "Spaces" s
WHERE sn."noteId" = n.id
  AND s.id = sn."spaceId"
  AND n."coEditEnabled" = true
  AND sn."removedAt" IS NULL
  AND s."deletedAt" IS NULL
  AND s.type = 'shared'
  AND sn."coEditEnabled" = false;

-- Recompute the note-level mirror from live associations (clears orphans if any).
UPDATE "Notes" n
SET
  "coEditEnabled" = EXISTS (
    SELECT 1
    FROM "SpaceNotes" sn
    INNER JOIN "Spaces" s ON s.id = sn."spaceId"
    WHERE sn."noteId" = n.id
      AND sn."removedAt" IS NULL
      AND sn."coEditEnabled" = true
      AND s."deletedAt" IS NULL
      AND s.type = 'shared'
  ),
  "coEditEnabledAt" = CASE
    WHEN EXISTS (
      SELECT 1
      FROM "SpaceNotes" sn
      INNER JOIN "Spaces" s ON s.id = sn."spaceId"
      WHERE sn."noteId" = n.id
        AND sn."removedAt" IS NULL
        AND sn."coEditEnabled" = true
        AND s."deletedAt" IS NULL
        AND s.type = 'shared'
    ) THEN COALESCE(
      (
        SELECT MIN(sn."coEditEnabledAt")
        FROM "SpaceNotes" sn
        INNER JOIN "Spaces" s ON s.id = sn."spaceId"
        WHERE sn."noteId" = n.id
          AND sn."removedAt" IS NULL
          AND sn."coEditEnabled" = true
          AND s."deletedAt" IS NULL
          AND s.type = 'shared'
      ),
      n."coEditEnabledAt",
      NOW()
    )
    ELSE NULL
  END;
