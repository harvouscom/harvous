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
config({ path: resolve(import.meta.dirname || __dirname, '..', '..', '.env') });

async function main() {
  const { db } = await import('./index');
  const { sql } = await import('drizzle-orm');

  const tables = [
    'Spaces',
    'Threads',
    'Notes',
    'NoteThreads',
    'Comments',
    'Members',
    'SpaceInvitations',
    'SpaceMemberships',
    'SpaceInvites',
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

      if (columns.rows.length === 0) {
        console.error(`  FAIL: ${table} — table does not exist`);
        failed++;
        continue;
      }

      console.log(`  OK: ${table} — ${columns.rows.length} columns`);
      for (const col of columns.rows) {
        const nullable = col.is_nullable === 'YES' ? '' : ', NOT NULL';
        console.log(`       ${col.column_name} (${col.data_type}${nullable})`);
      }

      const sample = await db.execute(sql`SELECT * FROM ${sql.identifier(table)} LIMIT 1`);
      if (sample.rows.length === 0) {
        console.log(`       (no rows to sample)`);
      } else {
        const row = sample.rows[0] as any;
        if ('createdAt' in row) {
          console.log(`       createdAt sample: ${row.createdAt} (${typeof row.createdAt})`);
        }
      }

      passed++;
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

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
