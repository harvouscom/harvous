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
  `ALTER TABLE "FamilyChildren" ADD COLUMN IF NOT EXISTS "notebookPreferences" jsonb`,
  `ALTER TABLE "FamilyChildren" ADD COLUMN IF NOT EXISTS "bibleTranslations" text[] NOT NULL DEFAULT ARRAY['BSB']::text[]`,
  `CREATE TABLE IF NOT EXISTS "FamilyChildBibleReadings" (
    "id" text PRIMARY KEY, "childId" text NOT NULL REFERENCES "FamilyChildren" ("id") ON DELETE CASCADE,
    "book" text NOT NULL, "chapter" integer NOT NULL, "translation" text NOT NULL, "sharedAt" timestamptz NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "FamilyChildBibleReadings_passage"
    ON "FamilyChildBibleReadings" ("childId", "book", "chapter", "translation")`,
  `CREATE TABLE IF NOT EXISTS "FamilyChildBibleThoughts" (
    "id" text PRIMARY KEY, "readingId" text NOT NULL REFERENCES "FamilyChildBibleReadings" ("id") ON DELETE CASCADE,
    "verse" integer NOT NULL, "role" text NOT NULL, "text" text NOT NULL, "createdAt" timestamptz NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS "FamilyChildBibleThoughts_readingIndex" ON "FamilyChildBibleThoughts" ("readingId")`,
  `CREATE TABLE IF NOT EXISTS "ChildNoteResources" (
    "noteId" text NOT NULL REFERENCES "Notes" ("id") ON DELETE CASCADE,
    "spaceId" text NOT NULL REFERENCES "Spaces" ("id") ON DELETE CASCADE,
    "resourceNoteId" text NOT NULL REFERENCES "Notes" ("id") ON DELETE CASCADE,
    PRIMARY KEY ("noteId", "spaceId", "resourceNoteId")
  )`,
  `CREATE TABLE IF NOT EXISTS "FamilyChildVerseStickers" (
    "childId" text NOT NULL REFERENCES "FamilyChildren" ("id") ON DELETE CASCADE,
    "book" text NOT NULL, "chapter" integer NOT NULL, "verse" integer NOT NULL,
    "sticker" text NOT NULL, "createdAt" timestamptz NOT NULL,
    PRIMARY KEY ("childId", "book", "chapter", "verse")
  )`,
  `CREATE TABLE IF NOT EXISTS "FamilyChildVerseHighlights" (
    "childId" text NOT NULL REFERENCES "FamilyChildren" ("id") ON DELETE CASCADE,
    "book" text NOT NULL, "chapter" integer NOT NULL, "verse" integer NOT NULL,
    "color" text NOT NULL, "createdAt" timestamptz NOT NULL,
    PRIMARY KEY ("childId", "book", "chapter", "verse")
  )`,
  `CREATE TABLE IF NOT EXISTS "FamilyChildConsents" (
    "id" text PRIMARY KEY, "childId" text NOT NULL REFERENCES "FamilyChildren" ("id") ON DELETE CASCADE,
    "parentUserId" text NOT NULL, "noticeVersion" text NOT NULL, "consentedAt" timestamptz NOT NULL, "kind" text NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS "FamilyChildConsents_childIndex" ON "FamilyChildConsents" ("childId")`,
  // Notebooks created before the history existed start it with their current agreement. Re-running
  // adds nothing: a notebook that already has any history row is skipped.
  `INSERT INTO "FamilyChildConsents" ("id", "childId", "parentUserId", "noticeVersion", "consentedAt", "kind")
    SELECT 'backfill_' || c."id", c."id", c."parentUserId", c."noticeVersion", c."consentedAt", 'created'
    FROM "FamilyChildren" c
    WHERE NOT EXISTS (SELECT 1 FROM "FamilyChildConsents" h WHERE h."childId" = c."id")`,
  `CREATE TABLE IF NOT EXISTS "FamilyChildTransfers" (
    "id" text PRIMARY KEY, "childId" text NOT NULL, "parentUserId" text NOT NULL, "tokenHash" text NOT NULL,
    "familyInviteId" text, "status" text NOT NULL, "createdAt" timestamptz NOT NULL, "expiresAt" timestamptz NOT NULL,
    "completedAt" timestamptz, "newUserId" text, "summary" jsonb
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "FamilyChildTransfers_token" ON "FamilyChildTransfers" ("tokenHash")`,
  `CREATE INDEX IF NOT EXISTS "FamilyChildTransfers_childIndex" ON "FamilyChildTransfers" ("childId")`,
  ...['ChildNoteResources', 'FamilyVerifications', 'FamilyChildren', 'FamilyChildSessions', 'FamilySpaceApprovals',
    'FamilyChildBibleReadings', 'FamilyChildBibleThoughts', 'FamilyChildVerseStickers', 'FamilyChildVerseHighlights', 'FamilyChildConsents', 'FamilyChildTransfers']
    .map((name) => `ALTER TABLE "${name}" ENABLE ROW LEVEL SECURITY`)
];

export async function runFamilySchema(argv: string[], env = process.env) {
  if (!argv.includes('--apply')) {
    console.log('[child-accounts:schema] Dry run; no database connection.');
    for (const statement of FAMILY_DDL) console.log(`${statement};`);
    return;
  }
  requireDbTarget({ scriptName: 'child-accounts:schema', writes: true, argv,
    env: { ...env, SUPABASE_DATABASE_URL: env.SUPABASE_DIRECT_URL } });
  if (!env.SUPABASE_DIRECT_URL) throw new Error('SUPABASE_DIRECT_URL is required.');
  const client = postgres(env.SUPABASE_DIRECT_URL, { max: 1 });
  try { await client.begin(async (tx) => { for (const statement of FAMILY_DDL) await tx.unsafe(statement); }); }
  finally { await client.end(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runFamilySchema(process.argv.slice(2)).catch((error: { code?: string; message?: string }) => {
    // The reason, never the connection string: a URL in a message is cut before it is printed.
    const reason = String(error?.message ?? '').replace(/postgres(ql)?:\/\/\S+/gi, '[database url]');
    console.error(`Family schema change failed${error?.code ? ` (${error.code})` : ''}: ${reason}`);
    process.exitCode = 1;
  });
}
