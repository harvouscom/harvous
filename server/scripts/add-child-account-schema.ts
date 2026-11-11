/** Additive only; no connection is opened without --apply. */
import 'dotenv/config';
import postgres from 'postgres';
import { pathToFileURL } from 'node:url';
import { requireDbTarget } from '../utils/require-db-target';

export const FAMILY_DDL = [
  `CREATE TABLE IF NOT EXISTS "FamilyVerifications" (
    "id" text PRIMARY KEY, "parentUserId" text NOT NULL, "parentEmailHash" text NOT NULL,
    "status" text NOT NULL DEFAULT 'pending', "transactionId" text, "environment" text NOT NULL,
    "location" text NOT NULL, "createdAt" timestamptz NOT NULL, "expiresAt" timestamptz NOT NULL,
    "verifiedAt" timestamptz
  )`,
  `CREATE INDEX IF NOT EXISTS "FamilyVerifications_parentIndex" ON "FamilyVerifications" ("parentUserId")`,
  `CREATE TABLE IF NOT EXISTS "FamilyChildren" (
    "id" text PRIMARY KEY, "parentUserId" text NOT NULL, "displayName" text NOT NULL,
    "ageBand" text NOT NULL, "homeSpaceId" text NOT NULL,
    "verificationId" text NOT NULL REFERENCES "FamilyVerifications" ("id"),
    "noticeVersion" text NOT NULL, "consentedAt" timestamptz NOT NULL,
    "status" text NOT NULL DEFAULT 'active', "revokedAt" timestamptz,
    "createdAt" timestamptz NOT NULL, "lastActiveAt" timestamptz NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS "FamilyChildren_parentIndex" ON "FamilyChildren" ("parentUserId")`,
  `CREATE TABLE IF NOT EXISTS "FamilyChildSessions" (
    "tokenHash" text PRIMARY KEY, "childId" text NOT NULL REFERENCES "FamilyChildren" ("id") ON DELETE CASCADE,
    "kind" text NOT NULL, "createdAt" timestamptz NOT NULL, "expiresAt" timestamptz NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS "FamilyChildSessions_childIndex" ON "FamilyChildSessions" ("childId")`,
  `CREATE TABLE IF NOT EXISTS "FamilySpaceApprovals" (
    "childId" text NOT NULL REFERENCES "FamilyChildren" ("id") ON DELETE CASCADE,
    "spaceId" text NOT NULL REFERENCES "Spaces" ("id") ON DELETE CASCADE,
    "approvedAt" timestamptz NOT NULL, PRIMARY KEY ("childId", "spaceId")
  )`,
  ...['FamilyVerifications', 'FamilyChildren', 'FamilyChildSessions', 'FamilySpaceApprovals']
    .map((name) => `ALTER TABLE "${name}" ENABLE ROW LEVEL SECURITY`)
];

export async function runFamilySchema(argv: string[], env = process.env) {
  if (!argv.includes('--apply')) {
    console.log('[family:schema] Dry run; no database connection.');
    for (const statement of FAMILY_DDL) console.log(`${statement};`);
    return;
  }
  requireDbTarget({ scriptName: 'child-accounts:schema', writes: true, argv, env });
  if (!env.SUPABASE_DIRECT_URL) throw new Error('SUPABASE_DIRECT_URL is required.');
  const client = postgres(env.SUPABASE_DIRECT_URL, { max: 1 });
  try { await client.begin(async (tx) => { for (const statement of FAMILY_DDL) await tx.unsafe(statement); }); }
  finally { await client.end(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runFamilySchema(process.argv.slice(2)).catch(() => { console.error('Family schema change failed.'); process.exitCode = 1; });
}
