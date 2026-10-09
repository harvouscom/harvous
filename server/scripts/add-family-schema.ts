/**
 * Additive schema stage for Family Accounts. Dry-run by default; `--apply`
 * executes.
 *
 * Same shape and same reason as add-church-join-links-schema.ts:
 * `drizzle-kit push` diffs the whole schema and, on a dev database carrying
 * another branch's tables, offers to drop them. This only ever adds.
 *
 * Apply it to production **before** the routes that read these tables ship —
 * /api/family and the Family Space guards in spaces.ts 500 without them. Nothing
 * else reads them, which is why they are tables and not Spaces/UserMetadata
 * columns (see the docblock in schema.ts).
 *
 * Every statement is idempotent (IF NOT EXISTS), and the set runs in one
 * transaction.
 *
 *   npm run family:schema           # print the DDL, touch nothing
 *   npm run family:schema:apply     # run it
 */
import 'dotenv/config';
import postgres from 'postgres';
import { pathToFileURL } from 'node:url';
import { requireDbTarget } from '../utils/require-db-target';

export const ADDITIVE_FAMILY_DDL = [
  `CREATE TABLE IF NOT EXISTS "Families" (
    "id" text PRIMARY KEY,
    "ownerUserId" text NOT NULL,
    "spaceId" text NOT NULL,
    "createdAt" timestamptz NOT NULL,
    "updatedAt" timestamptz
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Families_spaceId_unique" ON "Families" ("spaceId")`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "Families_ownerUserId_unique" ON "Families" ("ownerUserId")`,
  `CREATE TABLE IF NOT EXISTS "FamilyMembers" (
    "id" text PRIMARY KEY,
    "familyId" text NOT NULL,
    "userId" text NOT NULL,
    "role" text NOT NULL,
    "invitedBy" text,
    "inviteId" text,
    "joinedAt" timestamptz NOT NULL,
    "roleChangedAt" timestamptz,
    "roleChangedBy" text,
    "createdAt" timestamptz NOT NULL,
    "updatedAt" timestamptz
  )`,
  // One family per person in v1.
  `CREATE UNIQUE INDEX IF NOT EXISTS "FamilyMembers_userId_unique" ON "FamilyMembers" ("userId")`,
  `CREATE INDEX IF NOT EXISTS "FamilyMembers_familyIdIndex" ON "FamilyMembers" ("familyId")`,
  `CREATE TABLE IF NOT EXISTS "FamilyInvites" (
    "id" text PRIMARY KEY,
    "familyId" text NOT NULL,
    "token" text NOT NULL,
    "role" text NOT NULL,
    "label" text,
    "createdBy" text NOT NULL,
    "expiresAt" timestamptz NOT NULL,
    "redeemedBy" text,
    "redeemedAt" timestamptz,
    "revokedAt" timestamptz,
    "createdAt" timestamptz NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "FamilyInvites_token_unique" ON "FamilyInvites" ("token")`,
  `CREATE INDEX IF NOT EXISTS "FamilyInvites_familyIdIndex" ON "FamilyInvites" ("familyId")`,
  // Oct 9 2026, second stage: support can pause a family; children ask to become adults.
  `ALTER TABLE "Families" ADD COLUMN IF NOT EXISTS "frozenAt" timestamptz`,
  `ALTER TABLE "Families" ADD COLUMN IF NOT EXISTS "frozenReason" text`,
  `CREATE TABLE IF NOT EXISTS "FamilyRoleRequests" (
    "id" text PRIMARY KEY,
    "familyId" text NOT NULL,
    "userId" text NOT NULL,
    "toRole" text NOT NULL,
    "status" text NOT NULL,
    "escalatedAt" timestamptz,
    "supportTicketId" text,
    "decidedBy" text,
    "decidedVia" text,
    "decidedAt" timestamptz,
    "createdAt" timestamptz NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "FamilyRoleRequests_pending_unique" ON "FamilyRoleRequests" ("userId") WHERE "status" = 'pending'`,
  `CREATE INDEX IF NOT EXISTS "FamilyRoleRequests_familyIdIndex" ON "FamilyRoleRequests" ("familyId")`,
  `CREATE TABLE IF NOT EXISTS "FamilyEvents" (
    "id" text PRIMARY KEY,
    "familyId" text NOT NULL,
    "actorUserId" text,
    "actorKind" text NOT NULL,
    "kind" text NOT NULL,
    "targetUserId" text,
    "detail" text,
    "reason" text,
    "createdAt" timestamptz NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS "FamilyEvents_familyId_createdAtIndex" ON "FamilyEvents" ("familyId", "createdAt")`,
  `ALTER TABLE "FamilyRoleRequests" ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE "FamilyEvents" ENABLE ROW LEVEL SECURITY`,
  // Matches scripts/run-enable-rls.ts, so a fresh apply leaves no window where
  // a table exists unprotected.
  `ALTER TABLE "Families" ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE "FamilyMembers" ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE "FamilyInvites" ENABLE ROW LEVEL SECURITY`,
] as const;

export async function runAddFamilySchema(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
): Promise<void> {
  const apply = argv.includes('--apply');

  if (!apply) {
    console.log('[family:schema] DRY RUN; no database connection opened');
    for (const statement of ADDITIVE_FAMILY_DDL) console.log(`${statement};`);
    console.log('[family:schema] review, then re-run with --apply');
    return;
  }
  requireDbTarget({ scriptName: 'family:schema', writes: true, argv, env });

  const databaseUrl = env.SUPABASE_DIRECT_URL?.trim();
  if (!databaseUrl) {
    throw new Error('SUPABASE_DIRECT_URL must be set (e.g. in .env) to apply');
  }

  const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });
  try {
    await sql.begin(async (tx) => {
      for (const statement of ADDITIVE_FAMILY_DDL) await tx.unsafe(statement);
    });
    console.log(`[family:schema] applied ${ADDITIVE_FAMILY_DDL.length} idempotent statements`);
  } finally {
    await sql.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runAddFamilySchema(process.argv.slice(2), process.env).catch((error) => {
    console.error('[family:schema] failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
