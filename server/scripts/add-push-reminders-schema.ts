/**
 * Additive web-push reminders stage. Dry-run by default; `--apply` executes.
 *
 * Why this rather than `db:push`: push diffs the *whole* schema against the
 * target, and on a database carrying tables from another in-flight branch that
 * diff offers to drop them. This script only ever adds, so it is safe against a
 * shared dev database — and it is what recreates the tables on a fresh machine.
 *
 * Every statement is idempotent (IF NOT EXISTS), so re-running is a no-op, and
 * the whole set runs in one transaction.
 *
 *   npm run push:schema         # print the DDL, touch nothing
 *   npm run push:schema:apply   # run it
 *
 * RUN THIS BEFORE DEPLOYING THE BRANCH, not after.
 *
 * The four UserMetadata columns are the reason. Drizzle's `select()` without a column list
 * expands to every column *in the schema file*, so the moment this branch's code is running
 * against a database that lacks them, unrelated endpoints fail — `/api/user/get-profile`,
 * `/api/navigation/data` and `/api/user/update-onboarding` all issue a full-row select on
 * UserMetadata and would return 500 for every signed-in user. `flyctl deploy` has no release
 * command, so nothing applies this for you.
 */
import 'dotenv/config';
import postgres from 'postgres';
import { pathToFileURL } from 'node:url';
import { requireDbTarget } from '../utils/require-db-target';

export const ADDITIVE_PUSH_REMINDERS_DDL = [
  // UserMetadata: the schedule, the zone it is read in, and the two stamps the tick needs.
  `ALTER TABLE "UserMetadata" ADD COLUMN IF NOT EXISTS "timezone" text`,
  `ALTER TABLE "UserMetadata" ADD COLUMN IF NOT EXISTS "reminderSettings" text`,
  `ALTER TABLE "UserMetadata" ADD COLUMN IF NOT EXISTS "lastActiveAt" timestamptz`,
  `ALTER TABLE "UserMetadata" ADD COLUMN IF NOT EXISTS "lastReminderSentOn" text`,
  // One row per browser/device that opted in. Endpoint is the identity.
  `CREATE TABLE IF NOT EXISTS "PushSubscriptions" (
    "id" text PRIMARY KEY,
    "userId" text NOT NULL,
    "endpoint" text NOT NULL,
    "p256dh" text NOT NULL,
    "auth" text NOT NULL,
    "userAgent" text,
    "createdAt" timestamptz NOT NULL,
    "lastSuccessAt" timestamptz,
    "failCount" integer NOT NULL DEFAULT 0
  )`,
  // The subscribe route upserts on this, so a re-subscribe from the same browser
  // (or the same device under a new signer) converges on one row.
  `CREATE UNIQUE INDEX IF NOT EXISTS "PushSubscriptions_endpoint_unique" ON "PushSubscriptions" ("endpoint")`,
  `CREATE INDEX IF NOT EXISTS "PushSubscriptions_userIdIndex" ON "PushSubscriptions" ("userId")`,
  `ALTER TABLE "PushSubscriptions" ENABLE ROW LEVEL SECURITY`,
  // What happened to each reminder — the response layer, not an activity log.
  `CREATE TABLE IF NOT EXISTS "ReminderDeliveries" (
    "id" text PRIMARY KEY,
    "userId" text NOT NULL,
    "kind" text NOT NULL,
    "variant" text NOT NULL,
    "sentAt" timestamptz NOT NULL,
    "localDate" text NOT NULL,
    "localHour" integer NOT NULL,
    "deviceCount" integer NOT NULL DEFAULT 0,
    "outcome" text,
    "outcomeAt" timestamptz,
    "outcomeSource" text
  )`,
  // The policy reads a user's last few deliveries newest-first.
  `CREATE INDEX IF NOT EXISTS "ReminderDeliveries_userId_sentAtIndex" ON "ReminderDeliveries" ("userId", "sentAt")`,
  // The tick resolves every still-open delivery older than a day.
  `CREATE INDEX IF NOT EXISTS "ReminderDeliveries_outcome_sentAtIndex" ON "ReminderDeliveries" ("outcome", "sentAt")`,
  `ALTER TABLE "ReminderDeliveries" ENABLE ROW LEVEL SECURITY`,
] as const;

export async function runAddPushRemindersSchema(
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
): Promise<void> {
  const apply = argv.includes('--apply');

  if (!apply) {
    console.log('[push:schema] DRY RUN; no database connection opened');
    for (const statement of ADDITIVE_PUSH_REMINDERS_DDL) console.log(`${statement};`);
    console.log('[push:schema] review, then re-run with --apply');
    return;
  }
  // Only past the dry run: printing the DDL connects to nothing.
  requireDbTarget({ scriptName: 'push:schema', writes: true, argv, env });

  const databaseUrl = env.SUPABASE_DIRECT_URL?.trim();
  if (!databaseUrl) {
    throw new Error('SUPABASE_DIRECT_URL must be set (e.g. in .env) to apply');
  }

  // max: 1 — the shared dev pooler caps session-mode clients, and a migration
  // has no reason to hold more than one.
  // onnotice — on a re-run every statement emits "already exists, skipping",
  // which is the expected outcome here and would otherwise bury the result.
  const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });
  try {
    await sql.begin(async (tx) => {
      for (const statement of ADDITIVE_PUSH_REMINDERS_DDL) await tx.unsafe(statement);
    });
    console.log(`[push:schema] applied ${ADDITIVE_PUSH_REMINDERS_DDL.length} idempotent statements`);
  } finally {
    await sql.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runAddPushRemindersSchema(process.argv.slice(2), process.env).catch((error) => {
    console.error('[push:schema] failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
