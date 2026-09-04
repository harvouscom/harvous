/**
 * Additive Review + Challenges schema stage. Dry-run by default; `--apply` executes.
 *
 * Same reasoning as the Resource Library stage next door: these three tables are new and
 * purely additive, but `drizzle-kit push` diffs the *whole* schema against the target, and on
 * a dev database carrying tables from another in-flight branch that diff offers to drop them.
 * This repo has several worktrees open at once, so that is not hypothetical. This script only
 * ever adds.
 *
 * Every statement is idempotent (IF NOT EXISTS), so re-running is a no-op, and the whole set
 * runs in one transaction.
 *
 *   npm run review:schema           # print the DDL, touch nothing
 *   npm run review:schema:apply     # run it
 */
import 'dotenv/config';
import postgres from 'postgres';
import { pathToFileURL } from 'node:url';
import { requireDbTarget } from '../utils/require-db-target';

export const ADDITIVE_REVIEW_CHALLENGES_DDL = [
  `CREATE TABLE IF NOT EXISTS "ReviewItems" (
    "id" text PRIMARY KEY,
    "userId" text NOT NULL,
    "kind" text NOT NULL,
    "sourceKey" text NOT NULL,
    "noteId" text,
    "secondaryNoteId" text,
    "studyThreadEntryId" text,
    "scriptureReference" text,
    "translation" text,
    "status" text NOT NULL DEFAULT 'active',
    "recallState" text NOT NULL DEFAULT 'new',
    "intervalDays" real NOT NULL DEFAULT 1,
    "dueAt" timestamptz NOT NULL,
    "lastReviewedAt" timestamptz,
    "lastOutcome" text,
    "successStreak" integer NOT NULL DEFAULT 0,
    "reviewCount" integer NOT NULL DEFAULT 0,
    "ladderStep" integer NOT NULL DEFAULT 0,
    "origin" text NOT NULL DEFAULT 'user',
    "challengeId" text,
    "createdAt" timestamptz NOT NULL,
    "updatedAt" timestamptz
  )`,
  // The dedupe guard, not just a constraint: `createReviewItem` races two devices adding the
  // same note through this index and the loser re-reads instead of writing a second row.
  `CREATE UNIQUE INDEX IF NOT EXISTS "ReviewItems_userId_sourceKeyIndex" ON "ReviewItems" ("userId", "sourceKey")`,
  `CREATE INDEX IF NOT EXISTS "ReviewItems_userId_status_dueAtIndex" ON "ReviewItems" ("userId", "status", "dueAt")`,
  `CREATE INDEX IF NOT EXISTS "ReviewItems_noteIdIndex" ON "ReviewItems" ("noteId")`,
  `CREATE INDEX IF NOT EXISTS "ReviewItems_secondaryNoteIdIndex" ON "ReviewItems" ("secondaryNoteId")`,
  `CREATE INDEX IF NOT EXISTS "ReviewItems_studyThreadEntryIdIndex" ON "ReviewItems" ("studyThreadEntryId")`,
  `CREATE TABLE IF NOT EXISTS "ReviewEvents" (
    "id" text PRIMARY KEY,
    "userId" text NOT NULL,
    "reviewItemId" text NOT NULL,
    "noteId" text,
    "action" text NOT NULL,
    "attempt" text,
    "previousIntervalDays" real,
    "nextIntervalDays" real,
    "createdAt" timestamptz NOT NULL
  )`,
  `CREATE INDEX IF NOT EXISTS "ReviewEvents_userId_createdAtIndex" ON "ReviewEvents" ("userId", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS "ReviewEvents_reviewItemId_createdAtIndex" ON "ReviewEvents" ("reviewItemId", "createdAt")`,
  `CREATE INDEX IF NOT EXISTS "ReviewEvents_noteIdIndex" ON "ReviewEvents" ("noteId")`,
  `CREATE TABLE IF NOT EXISTS "Challenges" (
    "id" text PRIMARY KEY,
    "userId" text NOT NULL,
    "templateKey" text NOT NULL,
    "title" text NOT NULL,
    "status" text NOT NULL DEFAULT 'active',
    "sourceKey" text NOT NULL,
    "sourceNoteId" text,
    "sourceSecondaryNoteId" text,
    "sourceEntryId" text,
    "scriptureReference" text,
    "translation" text,
    "steps" text NOT NULL,
    "currentStepIndex" integer NOT NULL DEFAULT 0,
    "startedAt" timestamptz NOT NULL,
    "lastStepAt" timestamptz,
    "completedAt" timestamptz,
    "createdAt" timestamptz NOT NULL,
    "updatedAt" timestamptz
  )`,
  `CREATE INDEX IF NOT EXISTS "Challenges_userId_statusIndex" ON "Challenges" ("userId", "status")`,
  `CREATE INDEX IF NOT EXISTS "Challenges_sourceNoteIdIndex" ON "Challenges" ("sourceNoteId")`,
  `CREATE INDEX IF NOT EXISTS "Challenges_sourceSecondaryNoteIdIndex" ON "Challenges" ("sourceSecondaryNoteId")`,
  // Added after the first apply: the engine writes a reader-facing reason onto each row.
  `ALTER TABLE "ReviewItems" ADD COLUMN IF NOT EXISTS "sourceLabel" text`,
  `ALTER TABLE "ReviewItems" ADD COLUMN IF NOT EXISTS "sourceAt" timestamptz`,
  // The reader's own Study Bible layer — one row per (user, node). See server/db/schema.ts.
  `CREATE TABLE IF NOT EXISTS "UserNodeStates" (
    "id" text PRIMARY KEY,
    "userId" text NOT NULL,
    "nodeKind" text NOT NULL,
    "nodeKey" text NOT NULL,
    "label" text,
    "noteId" text,
    "secondaryNoteId" text,
    "exposureCount" integer NOT NULL DEFAULT 0,
    "revisitCount" integer NOT NULL DEFAULT 0,
    "explicitConnectionCount" integer NOT NULL DEFAULT 0,
    "expansionCount" integer NOT NULL DEFAULT 0,
    "synthesisCount" integer NOT NULL DEFAULT 0,
    "reviewCount" integer NOT NULL DEFAULT 0,
    "firstStudiedAt" timestamptz NOT NULL,
    "lastSeenAt" timestamptz NOT NULL,
    "lastReviewedAt" timestamptz,
    "nextReviewAt" timestamptz,
    "recallState" text NOT NULL DEFAULT 'new',
    "lastSignal" text NOT NULL,
    "lastSourceLabel" text,
    "lastSourceAt" timestamptz NOT NULL,
    "status" text NOT NULL DEFAULT 'active',
    "meta" text,
    "createdAt" timestamptz NOT NULL,
    "updatedAt" timestamptz NOT NULL
  )`,
  // The upsert target every writer conflicts on.
  `CREATE UNIQUE INDEX IF NOT EXISTS "UserNodeStates_userId_nodeKeyIndex" ON "UserNodeStates" ("userId", "nodeKey")`,
  `CREATE INDEX IF NOT EXISTS "UserNodeStates_userId_nodeKind_lastSeenAtIndex" ON "UserNodeStates" ("userId", "nodeKind", "lastSeenAt")`,
  `CREATE INDEX IF NOT EXISTS "UserNodeStates_noteIdIndex" ON "UserNodeStates" ("noteId")`,
  `CREATE INDEX IF NOT EXISTS "UserNodeStates_secondaryNoteIdIndex" ON "UserNodeStates" ("secondaryNoteId")`,
  // Matches scripts/run-enable-rls.ts, so a fresh apply leaves no window where the tables
  // exist unprotected. These four hold the reader's own words about their own study.
  `ALTER TABLE "ReviewItems" ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE "ReviewEvents" ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE "Challenges" ENABLE ROW LEVEL SECURITY`,
  `ALTER TABLE "UserNodeStates" ENABLE ROW LEVEL SECURITY`,
  // Part four: a scheduler that remembers. Both defaulted, so existing rows are untouched.
  `ALTER TABLE "ReviewItems" ADD COLUMN IF NOT EXISTS "lapseCount" integer NOT NULL DEFAULT 0`,
  `ALTER TABLE "ReviewItems" ADD COLUMN IF NOT EXISTS "lastRungKey" text`,
] as const;

export async function runAddReviewChallengesSchema(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
): Promise<void> {
  const apply = argv.includes('--apply');

  if (!apply) {
    console.log('[review:schema] DRY RUN; no database connection opened');
    for (const statement of ADDITIVE_REVIEW_CHALLENGES_DDL) console.log(`${statement};`);
    console.log('[review:schema] review, then re-run with --apply');
    return;
  }
  // Only past the dry run: printing the DDL connects to nothing.
  requireDbTarget({ scriptName: 'review:schema', writes: true, argv, env });

  const databaseUrl = env.SUPABASE_DIRECT_URL?.trim();
  if (!databaseUrl) {
    throw new Error('SUPABASE_DIRECT_URL must be set (e.g. in .env) to apply');
  }

  const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });
  try {
    await sql.begin(async (tx) => {
      for (const statement of ADDITIVE_REVIEW_CHALLENGES_DDL) await tx.unsafe(statement);
    });
    console.log(
      `[review:schema] applied ${ADDITIVE_REVIEW_CHALLENGES_DDL.length} idempotent statements`,
    );
  } finally {
    await sql.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runAddReviewChallengesSchema(process.argv.slice(2), process.env).catch((error) => {
    console.error('[review:schema] failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
