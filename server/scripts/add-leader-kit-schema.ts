/**
 * Additive schema stage for the group leader kit (docs/CHURCH_V2_ROADMAP.md §E). Dry-run by
 * default; `--apply` executes.
 *
 * Four new tables, no changes to existing ones, so nothing that reads today's tables can break
 * before this runs — but code that uses the kit needs it, so apply before merge:
 *
 *   - `StudyPlanStepGuides`: a step's leader notes and discussion questions.
 *   - `GatheringAgendas`: a gathering's agenda.
 *   - `StudyPlanLibraryItems`: resources attached to a plan or a step.
 *   - `StudyPlanCopyBaselines`: what a copied plan has seen of its source.
 *
 * Every statement is idempotent (IF NOT EXISTS), and the set runs in one transaction.
 *
 *   npm run leader-kit:schema           # print the DDL, touch nothing
 *   npm run leader-kit:schema:apply     # run it
 */
import 'dotenv/config';
import postgres from 'postgres';
import { pathToFileURL } from 'node:url';
import { requireDbTarget } from '../utils/require-db-target';

export const ADDITIVE_LEADER_KIT_DDL = [
  `CREATE TABLE IF NOT EXISTS "StudyPlanStepGuides" (
    "id" text PRIMARY KEY,
    "threadId" text NOT NULL,
    "noteId" text NOT NULL,
    "leaderNotes" text,
    "questions" text NOT NULL DEFAULT '[]',
    "copiedFromGuideId" text,
    "updatedByUserId" text NOT NULL,
    "createdAt" timestamptz NOT NULL,
    "updatedAt" timestamptz
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "StudyPlanStepGuides_thread_note_unique" ON "StudyPlanStepGuides" ("threadId", "noteId")`,
  `CREATE INDEX IF NOT EXISTS "StudyPlanStepGuides_threadIdIndex" ON "StudyPlanStepGuides" ("threadId")`,
  `ALTER TABLE "StudyPlanStepGuides" ENABLE ROW LEVEL SECURITY`,
  `CREATE TABLE IF NOT EXISTS "GatheringAgendas" (
    "id" text PRIMARY KEY,
    "serviceId" text NOT NULL,
    "items" text NOT NULL DEFAULT '[]',
    "stepThreadId" text,
    "stepNoteId" text,
    "updatedByUserId" text NOT NULL,
    "createdAt" timestamptz NOT NULL,
    "updatedAt" timestamptz
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "GatheringAgendas_serviceId_unique" ON "GatheringAgendas" ("serviceId")`,
  `ALTER TABLE "GatheringAgendas" ENABLE ROW LEVEL SECURITY`,
  `CREATE TABLE IF NOT EXISTS "StudyPlanLibraryItems" (
    "id" text PRIMARY KEY,
    "threadId" text NOT NULL,
    "noteId" text,
    "libraryItemId" text NOT NULL,
    "sortOrder" integer NOT NULL DEFAULT 0,
    "attachedByUserId" text NOT NULL,
    "createdAt" timestamptz NOT NULL
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "StudyPlanLibraryItems_plan_item_unique" ON "StudyPlanLibraryItems" ("threadId", "libraryItemId") WHERE "noteId" IS NULL`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "StudyPlanLibraryItems_step_item_unique" ON "StudyPlanLibraryItems" ("threadId", "noteId", "libraryItemId") WHERE "noteId" IS NOT NULL`,
  `CREATE INDEX IF NOT EXISTS "StudyPlanLibraryItems_threadIdIndex" ON "StudyPlanLibraryItems" ("threadId")`,
  `CREATE INDEX IF NOT EXISTS "StudyPlanLibraryItems_libraryItemIdIndex" ON "StudyPlanLibraryItems" ("libraryItemId")`,
  `ALTER TABLE "StudyPlanLibraryItems" ENABLE ROW LEVEL SECURITY`,
  `CREATE TABLE IF NOT EXISTS "StudyPlanCopyBaselines" (
    "id" text PRIMARY KEY,
    "threadId" text NOT NULL,
    "sourceThreadId" text NOT NULL,
    "stepFingerprints" text NOT NULL DEFAULT '{}',
    "createdAt" timestamptz NOT NULL,
    "updatedAt" timestamptz
  )`,
  `CREATE UNIQUE INDEX IF NOT EXISTS "StudyPlanCopyBaselines_threadId_unique" ON "StudyPlanCopyBaselines" ("threadId")`,
  `CREATE INDEX IF NOT EXISTS "StudyPlanCopyBaselines_sourceThreadIdIndex" ON "StudyPlanCopyBaselines" ("sourceThreadId")`,
  `ALTER TABLE "StudyPlanCopyBaselines" ENABLE ROW LEVEL SECURITY`,
] as const;

export async function runAddLeaderKitSchema(argv: readonly string[], env: NodeJS.ProcessEnv): Promise<void> {
  const apply = argv.includes('--apply');
  if (!apply) {
    console.log('[leader-kit:schema] DRY RUN; no database connection opened');
    for (const statement of ADDITIVE_LEADER_KIT_DDL) console.log(`${statement};`);
    console.log('[leader-kit:schema] review, then re-run with --apply');
    return;
  }
  requireDbTarget({ scriptName: 'leader-kit:schema', writes: true, argv, env });

  const databaseUrl = env.SUPABASE_DIRECT_URL?.trim();
  if (!databaseUrl) throw new Error('SUPABASE_DIRECT_URL must be set (e.g. in .env) to apply');

  const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });
  try {
    await sql.begin(async (tx) => {
      for (const statement of ADDITIVE_LEADER_KIT_DDL) await tx.unsafe(statement);
    });
    console.log(`[leader-kit:schema] applied ${ADDITIVE_LEADER_KIT_DDL.length} idempotent statements`);
  } finally {
    await sql.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runAddLeaderKitSchema(process.argv.slice(2), process.env).catch((error) => {
    console.error('[leader-kit:schema] failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
