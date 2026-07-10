/**
 * Read-only preflight after additive DDL and before data repair. Expected legacy
 * work is reported as migration counts; only unsafe anomalies fail the process.
 */
import 'dotenv/config';
import postgres from 'postgres';
import { pathToFileURL } from 'node:url';
import {
  loadSharedSpacesMigrationIdentity,
  logSharedSpacesMigrationIdentity,
} from './shared-spaces-migration-target';

type PreflightCheck = {
  name: string;
  classification: 'migration' | 'unsafe';
  query: string;
};

export const CANONICAL_SPACE_NOTE_PREFLIGHT_CHECKS: readonly PreflightCheck[] = [
  {
    name: 'notes needing version 1',
    classification: 'migration',
    query: `SELECT count(*)::int AS count
      FROM "Notes" n LEFT JOIN "NoteVersions" nv ON nv."noteId" = n.id AND nv.version = 1
      WHERE nv.id IS NULL`,
  },
  {
    name: 'notes needing current version binding',
    classification: 'migration',
    query: `SELECT count(*)::int AS count FROM "Notes" WHERE "currentVersionId" IS NULL`,
  },
  {
    name: 'notes privately located in shared spaces',
    classification: 'migration',
    query: `SELECT count(*)::int AS count
      FROM "Notes" n JOIN "Spaces" s ON s.id = n."spaceId" WHERE s.type = 'shared'`,
  },
  {
    name: 'legacy durable anchors needing migration',
    classification: 'migration',
    query: `SELECT count(*)::int AS count FROM "StudyThreadEntries"
      WHERE "noteVersionId" IS NULL OR "anchorStatus" = 'unresolved'`,
  },
  {
    name: 'spaces needing singular pin repair',
    classification: 'migration',
    query: `SELECT count(*)::int AS count FROM (
      SELECT "spaceId" FROM "Threads"
      WHERE "spaceId" IS NOT NULL AND "isPinned" = true
      GROUP BY "spaceId" HAVING count(*) > 1
    ) duplicate_pins`,
  },
  {
    name: 'duplicate note version numbers',
    classification: 'unsafe',
    query: `SELECT count(*)::int AS count FROM (
      SELECT 1 FROM "NoteVersions" GROUP BY "noteId", version HAVING count(*) > 1
    ) duplicates`,
  },
  {
    name: 'duplicate space note pairs',
    classification: 'unsafe',
    query: `SELECT count(*)::int AS count FROM (
      SELECT 1 FROM "SpaceNotes" GROUP BY "spaceId", "noteId" HAVING count(*) > 1
    ) duplicates`,
  },
  {
    name: 'duplicate space memberships',
    classification: 'unsafe',
    query: `SELECT count(*)::int AS count FROM (
      SELECT 1 FROM "SpaceMemberships" GROUP BY "spaceId", "userId" HAVING count(*) > 1
    ) duplicates`,
  },
  {
    name: 'duplicate invite tokens',
    classification: 'unsafe',
    query: `SELECT count(*)::int AS count FROM (
      SELECT 1 FROM "SpaceInvites" GROUP BY token HAVING count(*) > 1
    ) duplicates`,
  },
  {
    name: 'encrypted active associations',
    classification: 'unsafe',
    query: `SELECT count(*)::int AS count
      FROM "SpaceNotes" sn JOIN "Notes" n ON n.id = sn."noteId"
      WHERE sn."removedAt" IS NULL AND n."contentEncrypted" = true`,
  },
  {
    name: 'invalid association references or lifecycle',
    classification: 'unsafe',
    query: `SELECT count(*)::int AS count
      FROM "SpaceNotes" sn
      LEFT JOIN "Notes" n ON n.id = sn."noteId"
      LEFT JOIN "Spaces" s ON s.id = sn."spaceId"
      WHERE n.id IS NULL OR s.id IS NULL OR s.type NOT IN ('shared', 'public')
        OR sn."addedBy" <> n."userId"
        OR (sn."removedAt" IS NULL AND sn."removedBy" IS NOT NULL)
        OR (sn."removedAt" IS NOT NULL AND sn."removedBy" IS NULL)
        OR sn."removedAt" < sn."addedAt"`,
  },
  {
    name: 'invalid non-null current version pointers',
    classification: 'unsafe',
    query: `SELECT count(*)::int AS count
      FROM "Notes" n LEFT JOIN "NoteVersions" nv ON nv.id = n."currentVersionId"
      WHERE n."currentVersionId" IS NOT NULL
        AND (nv.id IS NULL OR nv."noteId" <> n.id OR nv."authorId" <> n."userId")`,
  },
  {
    name: 'invalid space recovery lifecycle',
    classification: 'unsafe',
    query: `SELECT count(*)::int AS count FROM "Spaces"
      WHERE (type = 'personal' AND ("deletedAt" IS NOT NULL OR "recoveryUntil" IS NOT NULL))
        OR ("deletedAt" IS NULL AND "recoveryUntil" IS NOT NULL)
        OR ("deletedAt" IS NOT NULL AND "recoveryUntil" IS NULL)
        OR ("deletedAt" IS NOT NULL AND "recoveryUntil" <> "deletedAt" + interval '30 days')`,
  },
] as const;

export function summarizePreflight(
  results: Array<{ check: PreflightCheck; count: number }>,
) {
  return {
    migrationCount: results
      .filter((result) => result.check.classification === 'migration')
      .reduce((sum, result) => sum + result.count, 0),
    unsafeCount: results
      .filter((result) => result.check.classification === 'unsafe')
      .reduce((sum, result) => sum + result.count, 0),
  };
}

async function main() {
  const identity = loadSharedSpacesMigrationIdentity(process.env);
  logSharedSpacesMigrationIdentity(identity);
  const sql = postgres(identity.databaseUrl, { max: 1 });
  try {
    const results: Array<{ check: PreflightCheck; count: number }> = [];
    for (const check of CANONICAL_SPACE_NOTE_PREFLIGHT_CHECKS) {
      const rows = await sql.unsafe<{ count: number | string }[]>(check.query);
      const count = Number(rows[0]?.count ?? 0);
      results.push({ check, count });
      const status =
        check.classification === 'migration'
          ? 'MIGRATE'
          : count === 0
            ? 'PASS'
            : 'UNSAFE';
      console.log(`${status} ${check.name}: ${count}`);
    }
    const summary = summarizePreflight(results);
    console.log(
      `[shared-spaces:preflight] migration=${summary.migrationCount} unsafe=${summary.unsafeCount}`,
    );
    if (summary.unsafeCount > 0) process.exitCode = 1;
  } finally {
    await sql.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error('[shared-spaces:preflight] failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
