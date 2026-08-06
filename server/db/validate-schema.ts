/**
 * Schema Validation Script
 *
 * Connects to the Supabase Postgres database via Drizzle and validates
 * that all expected tables are accessible with the expected column names.
 *
 * Run with: npx tsx server/db/validate-schema.ts
 *
 * Requires SUPABASE_DATABASE_URL (or SUPABASE_DIRECT_URL) in .env.
 */

import { config } from 'dotenv';
import { resolve } from 'path';
import { pathToFileURL } from 'node:url';
config({ path: resolve(import.meta.dirname || __dirname, '..', '..', '.env') });

export const REQUIRED_COLUMNS: Record<string, readonly string[]> = {
  Spaces: ['deletedAt', 'recoveryUntil'],
  Notes: [
    'currentVersionId',
    'copiedFromNoteId',
    'copiedFromVersionId',
    'copiedFromAuthorId',
    'copiedFromAuthorDisplayName',
    'startedFromTemplateId',
    'startedFromTemplateName',
    'coEditEnabled',
    'coEditEnabledAt',
  ],
  NoteVersions: [
    'id',
    'noteId',
    'version',
    'title',
    'content',
    'contentEncrypted',
    'source',
    'authorId',
    'editedBy',
    'createdAt',
  ],
  SpaceNotes: [
    'id',
    'spaceId',
    'noteId',
    'addedBy',
    'addedAt',
    'updatedAt',
    'removedBy',
    'removedAt',
    'isPinned',
    'primaryCollection',
    'secondaryCollections',
    'collectionPinned',
    'collectionUserOverride',
    'order',
    'coEditEnabled',
    'coEditEnabledAt',
  ],
  StudyThreadEntries: [
    'spaceId',
    'noteVersionId',
    'resolvedVersionId',
    'anchorQuote',
    'anchorPrefixContext',
    'anchorSuffixContext',
    'anchorStatus',
    'resolvedAnchorStart',
    'resolvedAnchorEnd',
    'anchorResolvedAt',
    'anchorDetachedAt',
    'actorDisplayNameSnapshot',
  ],
  Churches: [
    'id',
    'orgId',
    'hmcChurchId',
    'name',
    'city',
    'state',
    'country',
    'timezone',
    'createdBy',
    'billingPlan',
    'billingPlanUpdatedAt',
    'billingSubscriptionId',
    'billingStatus',
    'pilotUntil',
    'isActive',
    'deletedAt',
    'recoveryUntil',
    'createdAt',
    'updatedAt',
  ],
  ChurchServices: [
    'id',
    'churchId',
    'spaceId',
    'serviceDate',
    'serviceTime',
    'title',
    'seriesId',
    'reference',
    'starterTemplateId',
    'createdBy',
    'updatedBy',
    'createdAt',
    'updatedAt',
  ],
  ChurchServiceTimes: [
    'id',
    'churchId',
    'dayOfWeek',
    'startTime',
    'label',
    'sortOrder',
    'createdAt',
    'updatedAt',
  ],
  ChurchServiceTimeAssignments: ['id', 'serviceId', 'serviceTimeId', 'serviceDate', 'createdAt'],
  ChurchSeries: ['id', 'churchId', 'spaceId', 'title', 'createdBy', 'createdAt', 'updatedAt'],
  UserMetadata: ['hmcChurchId', 'connectedChurchId', 'connectedOrgId', 'connectedChurchAt'],
  ResourceLibraries: ['id', 'ownerKind', 'ownerId', 'title', 'createdAt', 'updatedAt'],
  LibraryItems: [
    'id',
    'libraryId',
    'kind',
    'title',
    'description',
    'sourceUrl',
    'sourceDomain',
    'sourceSiteName',
    'sourceImage',
    'fileStorageKey',
    'fileName',
    'fileMime',
    'fileBytes',
    'access',
    'createdByUserId',
    'createdAt',
    'updatedAt',
    'archivedAt',
  ],
};

const REQUIRED_INDEXES: Record<string, readonly string[]> = {
  Spaces: ['Spaces_deletedAt_recoveryUntilIndex'],
  Notes: ['Notes_copiedFromNoteIdIndex', 'Notes_startedFromServiceIdIndex'],
  NoteVersions: [
    'NoteVersions_note_version_unique',
    'NoteVersions_noteId_createdAtIndex',
    'NoteVersions_authorId_createdAtIndex',
  ],
  SpaceNotes: [
    'SpaceNotes_space_note_unique',
    'SpaceNotes_spaceId_removedAt_orderIndex',
    'SpaceNotes_noteId_removedAtIndex',
  ],
  StudyThreadEntries: [
    'StudyThreadEntries_noteVersionIdIndex',
    'StudyThreadEntries_resolvedVersionIdIndex',
    'StudyThreadEntries_spaceId_parentNoteIdIndex',
    'StudyThreadEntries_anchorStatusIndex',
  ],
  Churches: ['Churches_orgId_unique', 'Churches_hmcChurchId_unique', 'Churches_createdByIndex'],
  ChurchServices: ['ChurchServices_church_dateIndex', 'ChurchServices_space_date_unique'],
  ChurchServiceTimes: [
    'ChurchServiceTimes_church_day_time_unique',
    'ChurchServiceTimes_churchIdIndex',
  ],
  /** The one-answer guarantee, moved here from ChurchServices_church_date_unique. */
  ChurchServiceTimeAssignments: ['ChurchServiceTimeAssignments_slot_date_unique'],
  /** Both halves required — one index per plan scope, neither optional. */
  ChurchSeries: ['ChurchSeries_church_title_unique', 'ChurchSeries_space_title_unique'],
  UserMetadata: ['UserMetadata_connectedChurchIdIndex', 'UserMetadata_hmcChurchIdIndex'],
  // The owner unique index is the lazy-creation race guard, not just a constraint.
  ResourceLibraries: ['ResourceLibraries_owner_unique'],
  LibraryItems: [
    'LibraryItems_libraryId_archivedAtIndex',
    'LibraryItems_libraryId_updatedAtIndex',
  ],
};

export function validateRequiredTableColumns(
  table: string,
  actualColumns: Iterable<string>,
): { missingColumns: string[]; message: string | null } {
  const actualColumnNames = new Set(actualColumns);
  const missingColumns = (REQUIRED_COLUMNS[table] ?? []).filter((name) => !actualColumnNames.has(name));

  return {
    missingColumns,
    message:
      missingColumns.length === 0
        ? null
        : `${table} schema mismatch — missing required columns: ${missingColumns.join(', ')}. Apply the pending schema migration before deployment.`,
  };
}

async function main() {
  const { db } = await import('./index');
  const { sql } = await import('drizzle-orm');

  const tables = [
    'Spaces',
    'Threads',
    'Notes',
    'NoteVersions',
    'SpaceNotes',
    'NoteThreads',
    'StudyThreadEntries',
    'Comments',
    'Members',
    'SpaceInvitations',
    'SpaceMemberships',
    'SpaceInvites',
    'Churches',
    'ChurchServices',
    'ChurchSeries',
    'UserMetadata',
    'UserXP',
    'UserSeasonalXP',
    'UserLifetimeXP',
    'WeeklyStreaks',
    'Tags',
    'NoteTags',
    'ScriptureMetadata',
    'NoteScriptureReferences',
    'ResourceMetadata',
    'ResourceLibraries',
    'LibraryItems',
    'InboxItems',
    'InboxItemNotes',
    'UserInboxItems',
    'MonthlyAnalytics',
    'AdminMonthlyReports',
    'DiagnosticEvents',
    'DiagnosticIssueTriage',
  ];

  let passed = 0;
  let failed = 0;

  for (const table of tables) {
    try {
      const columns = await db.execute(sql`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ${table}
        ORDER BY ordinal_position
      `);

      if (columns.length === 0) {
        console.error(`  FAIL: ${table} — table does not exist`);
        failed++;
        continue;
      }

      console.log(`  OK: ${table} — ${columns.length} columns`);
      for (const col of columns) {
        const nullable = col.is_nullable === 'YES' ? '' : ', NOT NULL';
        console.log(`       ${col.column_name} (${col.data_type}${nullable})`);
      }

      let tableValid = true;
      const columnValidation = validateRequiredTableColumns(
        table,
        columns.map((column) => String(column.column_name)),
      );
      if (columnValidation.message) {
        console.error(`  FAIL: ${columnValidation.message}`);
        tableValid = false;
      }

      const expectedIndexes = REQUIRED_INDEXES[table] ?? [];
      if (expectedIndexes.length > 0) {
        const indexes = await db.execute(sql`
          SELECT indexname
          FROM pg_indexes
          WHERE schemaname = 'public' AND tablename = ${table}
        `);
        const indexNames = new Set(indexes.map((row) => String(row.indexname)));
        const missingIndexes = expectedIndexes.filter((name) => !indexNames.has(name));
        if (missingIndexes.length > 0) {
          console.error(`  FAIL: ${table} — missing required indexes: ${missingIndexes.join(', ')}`);
          tableValid = false;
        }
      }

      const sample = await db.execute(sql`SELECT * FROM ${sql.identifier(table)} LIMIT 1`);
      if (sample.length === 0) {
        console.log(`       (no rows to sample)`);
      } else {
        const row = sample[0] as any;
        if ('createdAt' in row) {
          console.log(`       createdAt sample: ${row.createdAt} (${typeof row.createdAt})`);
        }
      }

      if (tableValid) passed++;
      else failed++;
      console.log('');
    } catch (err: any) {
      console.error(`  FAIL: ${table} — ${err.message}`);
      failed++;
    }
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed out of ${tables.length} tables`);

  if (failed > 0) process.exit(1);

  console.log('\n--- Drizzle ORM test ---');
  try {
    const { Spaces: SpacesTable } = await import('./schema');
    const result = await db.select({ count: sql<number>`count(*)` }).from(SpacesTable);
    console.log(`  Drizzle query OK: ${result[0]?.count ?? 0} spaces in database`);
  } catch (err: any) {
    console.error(`  Drizzle query FAILED: ${err.message}`);
    process.exit(1);
  }

  console.log('\nAll validations passed!');
  process.exit(0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
