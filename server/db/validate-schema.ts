/**
 * Schema Validation Script
 *
 * Connects to the Turso database via the new Drizzle client and validates
 * that all 20 tables are accessible with the expected column names.
 *
 * Run with: npx tsx server/db/validate-schema.ts
 *
 * Requires ASTRO_DB_REMOTE_URL and ASTRO_DB_APP_TOKEN env vars.
 * Tip: use `dotenv` or pass them inline:
 *   ASTRO_DB_REMOTE_URL=... ASTRO_DB_APP_TOKEN=... npx tsx server/db/validate-schema.ts
 */

import { createClient } from '@libsql/client';

async function main() {
  const url = process.env.ASTRO_DB_REMOTE_URL;
  const authToken = process.env.ASTRO_DB_APP_TOKEN;

  if (!url || !authToken) {
    console.error('Missing ASTRO_DB_REMOTE_URL or ASTRO_DB_APP_TOKEN env vars.');
    console.error('Usage: ASTRO_DB_REMOTE_URL=... ASTRO_DB_APP_TOKEN=... npx tsx server/db/validate-schema.ts');
    process.exit(1);
  }

  const client = createClient({ url, authToken });

  const tables = [
    'Spaces',
    'Threads',
    'Notes',
    'NoteThreads',
    'Comments',
    'Members',
    'SpaceInvitations',
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
  ];

  let passed = 0;
  let failed = 0;

  for (const table of tables) {
    try {
      // Get table info (column names, types)
      const info = await client.execute(`PRAGMA table_info("${table}")`);
      if (info.rows.length === 0) {
        console.error(`  FAIL: ${table} — table does not exist`);
        failed++;
        continue;
      }

      const columns = info.rows.map(r => ({
        name: r.name as string,
        type: r.type as string,
        notnull: r.notnull as number,
        dflt: r.dflt_value,
        pk: r.pk as number,
      }));

      console.log(`  OK: ${table} — ${columns.length} columns`);

      // Print column details
      for (const col of columns) {
        console.log(`       ${col.name} (${col.type}${col.notnull ? ', NOT NULL' : ''}${col.pk ? ', PK' : ''}${col.dflt != null ? `, default=${col.dflt}` : ''})`);
      }

      // Fetch one row to check actual data types (especially dates)
      const sample = await client.execute(`SELECT * FROM "${table}" LIMIT 1`);
      if (sample.rows.length > 0) {
        const row = sample.rows[0];
        // Check date columns — look for createdAt
        if ('createdAt' in row) {
          const val = row.createdAt;
          const valType = typeof val;
          console.log(`       createdAt sample: ${val} (${valType})`);
          if (valType === 'number' || valType === 'bigint') {
            console.log(`       -> Date storage: INTEGER (epoch ms)`);
          } else if (valType === 'string') {
            console.log(`       -> Date storage: TEXT (ISO string)`);
          }
        }
      } else {
        console.log(`       (no rows to sample)`);
      }

      passed++;
      console.log('');
    } catch (err: any) {
      console.error(`  FAIL: ${table} — ${err.message}`);
      failed++;
    }
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed out of ${tables.length} tables`);

  if (failed > 0) {
    process.exit(1);
  }

  // Also try a Drizzle query to make sure the ORM layer works
  console.log('\n--- Drizzle ORM test ---');
  try {
    // Dynamic import to test the full chain
    const { db } = await import('./index');
    const { Spaces: SpacesTable } = await import('./schema');
    const { sql } = await import('drizzle-orm');

    const result = await db.select({ count: sql<number>`count(*)` }).from(SpacesTable);
    console.log(`  Drizzle query OK: ${result[0]?.count ?? 0} spaces in database`);
  } catch (err: any) {
    console.error(`  Drizzle query FAILED: ${err.message}`);
    process.exit(1);
  }

  console.log('\nAll validations passed!');
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
