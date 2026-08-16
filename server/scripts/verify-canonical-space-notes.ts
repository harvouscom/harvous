/**
 * Read-only, bounded verifier for the canonical Shared Spaces migration.
 *
 * Usage:
 *   npx tsx server/scripts/verify-canonical-space-notes.ts --batch-size=200
 */

import 'dotenv/config';
import { asc, gt, inArray, sql, type SQL } from 'drizzle-orm';
import { NoteVersions, StudyThreadEntries } from '../db/schema';
import { durableAnchorValidityReason } from '../utils/durable-note-anchor';
import {
  createSharedSpacesMigrationDatabase,
  loadSharedSpacesMigrationIdentity,
  logSharedSpacesMigrationIdentity,
} from './shared-spaces-migration-target';

let db: ReturnType<typeof createSharedSpacesMigrationDatabase>['db'];

const SAMPLE_LIMIT = 50;

type CheckResult = {
  name: string;
  count: number;
  samples: unknown[];
};

function parseBatchSize(): number {
  const raw = process.argv.find((arg) => arg.startsWith('--batch-size='))?.slice('--batch-size='.length);
  const parsed = raw ? Number.parseInt(raw, 10) : 200;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 200;
}

async function runSqlCheck(name: string, countQuery: SQL, sampleQuery: SQL): Promise<CheckResult> {
  const countRows = await db.execute<{ issueCount: number | string }>(countQuery);
  const samples = await db.execute(sampleQuery);
  return {
    name,
    count: Number(countRows[0]?.issueCount ?? 0),
    samples: Array.from(samples),
  };
}

async function durableAnchorCheck(batchSize: number): Promise<CheckResult> {
  let lastId: string | null = null;
  let issueCount = 0;
  const samples: unknown[] = [];

  while (true) {
    const rows = await db
      .select({
        id: StudyThreadEntries.id,
        parentNoteId: StudyThreadEntries.parentNoteId,
        noteVersionId: StudyThreadEntries.noteVersionId,
        resolvedVersionId: StudyThreadEntries.resolvedVersionId,
        anchorQuote: StudyThreadEntries.anchorQuote,
        anchorPrefixContext: StudyThreadEntries.anchorPrefixContext,
        anchorSuffixContext: StudyThreadEntries.anchorSuffixContext,
        anchorStatus: StudyThreadEntries.anchorStatus,
        resolvedAnchorStart: StudyThreadEntries.resolvedAnchorStart,
        resolvedAnchorEnd: StudyThreadEntries.resolvedAnchorEnd,
        anchorResolvedAt: StudyThreadEntries.anchorResolvedAt,
        anchorDetachedAt: StudyThreadEntries.anchorDetachedAt,
      })
      .from(StudyThreadEntries)
      .where(lastId ? gt(StudyThreadEntries.id, lastId) : undefined)
      .orderBy(asc(StudyThreadEntries.id))
      .limit(batchSize);
    if (rows.length === 0) break;

    const versionIds = [
      ...new Set(
        rows.flatMap((row) =>
          [row.noteVersionId, row.resolvedVersionId].filter(
            (id): id is string => Boolean(id),
          ),
        ),
      ),
    ];
    const versions =
      versionIds.length > 0
        ? await db
            .select({ id: NoteVersions.id, noteId: NoteVersions.noteId, content: NoteVersions.content })
            .from(NoteVersions)
            .where(inArray(NoteVersions.id, versionIds))
        : [];
    const versionById = new Map(versions.map((version) => [version.id, version]));
    for (const row of rows) {
      // A highlight made while reading binds to no note version, so it is not a durable anchor
      // and has nothing to verify. Without this it fails the binding check below and every
      // reader highlight is reported as an issue — the check would grow noisier the more
      // people read, which is the opposite of what a verification script is for.
      const { parentNoteId } = row;
      if (!parentNoteId) continue;
      const originalVersion = row.noteVersionId ? versionById.get(row.noteVersionId) : null;
      const resolvedVersionId = row.resolvedVersionId ?? row.noteVersionId;
      const resolvedVersion = resolvedVersionId ? versionById.get(resolvedVersionId) : null;
      const reason =
        !originalVersion || originalVersion.noteId !== parentNoteId
          ? 'invalid-original-version-binding'
          : durableAnchorValidityReason({ ...row, parentNoteId }, resolvedVersion ?? null);
      if (reason) {
        issueCount++;
        if (samples.length < SAMPLE_LIMIT) samples.push({ entryId: row.id, reason });
      }
    }
    lastId = rows.at(-1)!.id;
  }
  return { name: 'invalid durable anchors', count: issueCount, samples };
}

async function main() {
  const batchSize = parseBatchSize();
  const identity = loadSharedSpacesMigrationIdentity(process.env);
  logSharedSpacesMigrationIdentity(identity);
  const target = createSharedSpacesMigrationDatabase(identity);
  db = target.db;
  try {
  const checks = await Promise.all([
    runSqlCheck(
      'spaces with multiple pinned Threads',
      sql`SELECT count(*)::int AS "issueCount"
          FROM (
            SELECT "spaceId"
            FROM "Threads"
            WHERE "spaceId" IS NOT NULL AND "isPinned" = true
            GROUP BY "spaceId"
            HAVING count(*) > 1
          ) duplicates`,
      sql`SELECT "spaceId", count(*)::int AS "pinnedCount", array_agg(id ORDER BY coalesce("updatedAt", "createdAt") DESC, id DESC) AS "threadIds"
          FROM "Threads"
          WHERE "spaceId" IS NOT NULL AND "isPinned" = true
          GROUP BY "spaceId"
          HAVING count(*) > 1
          ORDER BY "spaceId"
          LIMIT ${SAMPLE_LIMIT}`,
    ),
    runSqlCheck(
      'shared notes lacking active associations',
      sql`SELECT count(*)::int AS "issueCount"
          FROM "Notes" n
          JOIN "Spaces" s ON s.id = n."spaceId"
          LEFT JOIN "SpaceNotes" sn
            ON sn."noteId" = n.id AND sn."spaceId" = s.id AND sn."removedAt" IS NULL
          WHERE s.type = 'shared' AND sn.id IS NULL`,
      sql`SELECT n.id AS "noteId", n."userId", s.id AS "spaceId"
          FROM "Notes" n
          JOIN "Spaces" s ON s.id = n."spaceId"
          LEFT JOIN "SpaceNotes" sn
            ON sn."noteId" = n.id AND sn."spaceId" = s.id AND sn."removedAt" IS NULL
          WHERE s.type = 'shared' AND sn.id IS NULL
          ORDER BY n.id LIMIT ${SAMPLE_LIMIT}`,
    ),
    runSqlCheck(
      'encrypted active associations',
      sql`SELECT count(*)::int AS "issueCount"
          FROM "SpaceNotes" sn JOIN "Notes" n ON n.id = sn."noteId"
          WHERE sn."removedAt" IS NULL AND n."contentEncrypted" = true`,
      sql`SELECT sn.id AS "associationId", sn."noteId", sn."spaceId"
          FROM "SpaceNotes" sn JOIN "Notes" n ON n.id = sn."noteId"
          WHERE sn."removedAt" IS NULL AND n."contentEncrypted" = true
          ORDER BY sn.id LIMIT ${SAMPLE_LIMIT}`,
    ),
    runSqlCheck(
      'duplicate SpaceNotes pairs',
      sql`SELECT count(*)::int AS "issueCount" FROM (
            SELECT 1 FROM "SpaceNotes" GROUP BY "spaceId", "noteId" HAVING count(*) > 1
          ) duplicates`,
      sql`SELECT "spaceId", "noteId", count(*)::int AS duplicates
          FROM "SpaceNotes" GROUP BY "spaceId", "noteId" HAVING count(*) > 1
          ORDER BY "spaceId", "noteId" LIMIT ${SAMPLE_LIMIT}`,
    ),
    runSqlCheck(
      'invalid SpaceNotes rows',
      sql`SELECT count(*)::int AS "issueCount"
          FROM "SpaceNotes" sn
          LEFT JOIN "Notes" n ON n.id = sn."noteId"
          LEFT JOIN "Spaces" s ON s.id = sn."spaceId"
          WHERE n.id IS NULL OR s.id IS NULL OR s.type NOT IN ('shared', 'public')
             OR sn."addedBy" <> n."userId"
             OR (sn."removedAt" IS NULL AND sn."removedBy" IS NOT NULL)
             OR (sn."removedAt" IS NOT NULL AND sn."removedBy" IS NULL)
             OR sn."removedAt" < sn."addedAt"`,
      sql`SELECT sn.id AS "associationId", sn."noteId", sn."spaceId"
          FROM "SpaceNotes" sn
          LEFT JOIN "Notes" n ON n.id = sn."noteId"
          LEFT JOIN "Spaces" s ON s.id = sn."spaceId"
          WHERE n.id IS NULL OR s.id IS NULL OR s.type NOT IN ('shared', 'public')
             OR sn."addedBy" <> n."userId"
             OR (sn."removedAt" IS NULL AND sn."removedBy" IS NOT NULL)
             OR (sn."removedAt" IS NOT NULL AND sn."removedBy" IS NULL)
             OR sn."removedAt" < sn."addedAt"
          ORDER BY sn.id LIMIT ${SAMPLE_LIMIT}`,
    ),
    runSqlCheck(
      'active associations without valid author membership',
      sql`SELECT count(*)::int AS "issueCount"
          FROM "SpaceNotes" sn
          JOIN "Notes" n ON n.id = sn."noteId"
          JOIN "Spaces" s ON s.id = sn."spaceId"
          LEFT JOIN "SpaceMemberships" sm ON sm."spaceId" = sn."spaceId" AND sm."userId" = n."userId"
          WHERE sn."removedAt" IS NULL
            AND s."userId" <> n."userId"
            AND (sm.id IS NULL OR sm.role NOT IN ('owner', 'leader', 'member'))`,
      sql`SELECT sn.id AS "associationId", sn."noteId", sn."spaceId", n."userId" AS "authorId"
          FROM "SpaceNotes" sn
          JOIN "Notes" n ON n.id = sn."noteId"
          JOIN "Spaces" s ON s.id = sn."spaceId"
          LEFT JOIN "SpaceMemberships" sm ON sm."spaceId" = sn."spaceId" AND sm."userId" = n."userId"
          WHERE sn."removedAt" IS NULL
            AND s."userId" <> n."userId"
            AND (sm.id IS NULL OR sm.role NOT IN ('owner', 'leader', 'member'))
          ORDER BY sn.id LIMIT ${SAMPLE_LIMIT}`,
    ),
    runSqlCheck(
      'active associations in expired or inconsistent deleted spaces',
      sql`SELECT count(*)::int AS "issueCount"
          FROM "SpaceNotes" sn JOIN "Spaces" s ON s.id = sn."spaceId"
          WHERE sn."removedAt" IS NULL
            AND s."deletedAt" IS NOT NULL
            AND (s."recoveryUntil" IS NULL OR s."recoveryUntil" <= now() OR s."isActive" = true)`,
      sql`SELECT sn.id AS "associationId", sn."noteId", sn."spaceId", s."deletedAt", s."recoveryUntil", s."isActive"
          FROM "SpaceNotes" sn JOIN "Spaces" s ON s.id = sn."spaceId"
          WHERE sn."removedAt" IS NULL
            AND s."deletedAt" IS NOT NULL
            AND (s."recoveryUntil" IS NULL OR s."recoveryUntil" <= now() OR s."isActive" = true)
          ORDER BY sn.id LIMIT ${SAMPLE_LIMIT}`,
    ),
    runSqlCheck(
      'invalid public-space authors',
      sql`SELECT count(*)::int AS "issueCount"
          FROM "SpaceNotes" sn
          JOIN "Notes" n ON n.id = sn."noteId"
          JOIN "Spaces" s ON s.id = sn."spaceId"
          LEFT JOIN "SpaceMemberships" sm ON sm."spaceId" = s.id AND sm."userId" = n."userId"
          WHERE sn."removedAt" IS NULL AND s.type = 'public' AND n."userId" <> s."userId"
            AND (sm.id IS NULL OR sm.role <> 'leader')`,
      sql`SELECT sn.id AS "associationId", sn."noteId", sn."spaceId",
                 n."userId" AS "authorId", sm.role AS "membershipRole"
          FROM "SpaceNotes" sn
          JOIN "Notes" n ON n.id = sn."noteId"
          JOIN "Spaces" s ON s.id = sn."spaceId"
          LEFT JOIN "SpaceMemberships" sm ON sm."spaceId" = s.id AND sm."userId" = n."userId"
          WHERE sn."removedAt" IS NULL AND s.type = 'public' AND n."userId" <> s."userId"
            AND (sm.id IS NULL OR sm.role <> 'leader')
          ORDER BY sn.id LIMIT ${SAMPLE_LIMIT}`,
    ),
    runSqlCheck(
      'duplicate NoteVersions numbers',
      sql`SELECT count(*)::int AS "issueCount" FROM (
            SELECT 1 FROM "NoteVersions" GROUP BY "noteId", version HAVING count(*) > 1
          ) duplicates`,
      sql`SELECT "noteId", version, count(*)::int AS duplicates
          FROM "NoteVersions" GROUP BY "noteId", version HAVING count(*) > 1
          ORDER BY "noteId", version LIMIT ${SAMPLE_LIMIT}`,
    ),
    runSqlCheck(
      'invalid NoteVersions rows',
      sql`SELECT count(*)::int AS "issueCount"
          FROM "NoteVersions" nv LEFT JOIN "Notes" n ON n.id = nv."noteId"
          WHERE n.id IS NULL OR nv.version < 1 OR nv."authorId" <> n."userId"`,
      sql`SELECT nv.id AS "versionId", nv."noteId", nv.version, nv."authorId"
          FROM "NoteVersions" nv LEFT JOIN "Notes" n ON n.id = nv."noteId"
          WHERE n.id IS NULL OR nv.version < 1 OR nv."authorId" <> n."userId"
          ORDER BY nv.id LIMIT ${SAMPLE_LIMIT}`,
    ),
    runSqlCheck(
      'notes lacking version 1',
      sql`SELECT count(*)::int AS "issueCount"
          FROM "Notes" n LEFT JOIN "NoteVersions" nv ON nv."noteId" = n.id AND nv.version = 1
          WHERE nv.id IS NULL`,
      sql`SELECT n.id AS "noteId", n."userId"
          FROM "Notes" n LEFT JOIN "NoteVersions" nv ON nv."noteId" = n.id AND nv.version = 1
          WHERE nv.id IS NULL ORDER BY n.id LIMIT ${SAMPLE_LIMIT}`,
    ),
    runSqlCheck(
      'invalid currentVersion pointers',
      sql`SELECT count(*)::int AS "issueCount"
          FROM "Notes" n LEFT JOIN "NoteVersions" nv ON nv.id = n."currentVersionId"
          WHERE n."currentVersionId" IS NULL OR nv.id IS NULL
             OR nv."noteId" <> n.id OR nv."authorId" <> n."userId"
             OR EXISTS (
               SELECT 1 FROM "NoteVersions" newer
               WHERE newer."noteId" = n.id AND newer.version > nv.version
             )`,
      sql`SELECT n.id AS "noteId", n."currentVersionId", nv."noteId" AS "versionNoteId",
                 nv.version AS "currentVersion", (
                   SELECT max(latest.version) FROM "NoteVersions" latest WHERE latest."noteId" = n.id
                 ) AS "greatestVersion"
          FROM "Notes" n LEFT JOIN "NoteVersions" nv ON nv.id = n."currentVersionId"
          WHERE n."currentVersionId" IS NULL OR nv.id IS NULL
             OR nv."noteId" <> n.id OR nv."authorId" <> n."userId"
             OR EXISTS (
               SELECT 1 FROM "NoteVersions" newer
               WHERE newer."noteId" = n.id AND newer.version > nv.version
             )
          ORDER BY n.id LIMIT ${SAMPLE_LIMIT}`,
    ),
    runSqlCheck(
      'invalid space recovery state',
      sql`SELECT count(*)::int AS "issueCount" FROM "Spaces"
          WHERE (type = 'personal' AND ("deletedAt" IS NOT NULL OR "recoveryUntil" IS NOT NULL))
             OR ("deletedAt" IS NULL AND "recoveryUntil" IS NOT NULL)
             OR ("deletedAt" IS NOT NULL AND "recoveryUntil" IS NULL)
             OR ("deletedAt" IS NOT NULL AND "recoveryUntil" <> "deletedAt" + interval '30 days')`,
      sql`SELECT id AS "spaceId", type, "deletedAt", "recoveryUntil" FROM "Spaces"
          WHERE (type = 'personal' AND ("deletedAt" IS NOT NULL OR "recoveryUntil" IS NOT NULL))
             OR ("deletedAt" IS NULL AND "recoveryUntil" IS NOT NULL)
             OR ("deletedAt" IS NOT NULL AND "recoveryUntil" IS NULL)
             OR ("deletedAt" IS NOT NULL AND "recoveryUntil" <> "deletedAt" + interval '30 days')
          ORDER BY id LIMIT ${SAMPLE_LIMIT}`,
    ),
    runSqlCheck(
      'notes still privately located in shared spaces',
      sql`SELECT count(*)::int AS "issueCount"
          FROM "Notes" n JOIN "Spaces" s ON s.id = n."spaceId" WHERE s.type = 'shared'`,
      sql`SELECT n.id AS "noteId", n."userId", s.id AS "spaceId"
          FROM "Notes" n JOIN "Spaces" s ON s.id = n."spaceId"
          WHERE s.type = 'shared' ORDER BY n.id LIMIT ${SAMPLE_LIMIT}`,
    ),
    durableAnchorCheck(batchSize),
  ]);

  console.log(`[verify-canonical-space-notes] read-only verification batchSize=${batchSize}`);
  for (const check of checks) {
    console.log(`${check.count === 0 ? 'PASS' : 'FAIL'} ${check.name}: ${check.count}`);
    for (const sample of check.samples) console.log(`  ${JSON.stringify(sample)}`);
  }
  const issueCount = checks.reduce((sum, check) => sum + check.count, 0);
  console.log(`[verify-canonical-space-notes] total issues: ${issueCount}`);
  if (issueCount > 0) process.exitCode = 1;
  } finally {
    await target.close();
  }
}

main().catch((error) => {
  console.error('[verify-canonical-space-notes] failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
