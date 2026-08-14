/**
 * Inspect (and optionally clear) StudyThreadEntries rows with a NULL parentNoteId.
 *
 * `schema.ts` declares `parentNoteId: text('parentNoteId').notNull()`, and the
 * hand-written DDL in `server/db/manual/create-study-thread-entries.sql` always
 * did too — but some rows in the database predate that and hold NULL. Postgres
 * therefore rejects the ALTER on every `npm run db:push`:
 *
 *   PostgresError: column "parentNoteId" of relation "StudyThreadEntries"
 *   contains null values (code 23502, routine ATRewriteTable)
 *
 * Until those rows are reconciled, that ALTER fails on every push and takes the
 * rest of the run with it.
 *
 * A NULL-parent entry is unreachable by design: every read filters
 * `parentNoteId = <id>` (server/routes/study-threads.ts), which no NULL ever
 * matches, and `delete-note-cascade.ts` clears entries with
 * `inArray(parentNoteId, ...)`, which never matches them either — so they also
 * survive the deletion of the note they belonged to. They are still handed to
 * clients, though: sync bootstrap selects by userId alone (server/routes/sync.ts),
 * so deleting one needs a `studyThread` tombstone or it lingers in local caches.
 *
 * Usage (from repo root, with Supabase credentials in .env):
 *   npx tsx scripts/reconcile-null-parent-study-threads.ts            # report only
 *   npx tsx scripts/reconcile-null-parent-study-threads.ts --delete   # back up, then delete
 *   npx tsx scripts/reconcile-null-parent-study-threads.ts --delete --force
 *
 * --delete refuses rows that still carry authored text unless --force is given;
 * losing someone's writing is a decision a human should make deliberately. Every
 * deleted row is written to scripts/backups/ first.
 */
import 'dotenv/config';
import postgres from 'postgres';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Fields that hold something a person typed or captured. */
const AUTHORED_FIELDS = [
  'focusTitle',
  'notesBody',
  'miniNoteBody',
  'sourceSnippet',
  'anchorTextSnapshot',
  'anchorQuote',
  'scriptureReference',
  'scripturePassageExcerpt',
  'linkedNoteTitle',
] as const;

type Row = Record<string, unknown>;

function authoredContent(row: Row): string[] {
  return AUTHORED_FIELDS.filter((field) => {
    const value = row[field];
    return typeof value === 'string' && value.trim() !== '';
  });
}

function describe(row: Row): void {
  console.log(`\n  id: ${row.id}`);
  console.log(`    userId:     ${row.userId}`);
  console.log(`    createdAt:  ${String(row.createdAt)}`);
  console.log(`    updatedAt:  ${String(row.updatedAt ?? '(never)')}`);
  console.log(`    entryKind:  ${row.entryKindRaw}`);
  console.log(`    spaceId:    ${row.spaceId ?? '(none)'}`);
  console.log(`    linkedNote: ${row.linkedNoteId ?? '(none)'}`);
  console.log(`    isArchived: ${row.isArchived}`);

  const authored = authoredContent(row);
  if (authored.length === 0) {
    console.log('    content:    (empty — nothing authored on this entry)');
    return;
  }
  console.log('    content:');
  for (const field of authored) {
    const value = String(row[field]);
    const preview = value.length > 300 ? `${value.slice(0, 300)}…` : value;
    console.log(`      ${field}: ${JSON.stringify(preview)}`);
  }
}

async function main() {
  const url = process.env.SUPABASE_DIRECT_URL ?? process.env.SUPABASE_DATABASE_URL;
  if (!url) {
    console.error('Missing SUPABASE_DIRECT_URL or SUPABASE_DATABASE_URL');
    process.exit(1);
  }

  const shouldDelete = process.argv.includes('--delete');
  const force = process.argv.includes('--force');

  // max: 1 — the Supabase pooler caps session-mode clients at 15, and dev
  // servers are usually holding some of those already.
  const sql = postgres(url, { max: 1, connect_timeout: 30 });

  try {
    const rows: Row[] = await sql`
      SELECT * FROM "StudyThreadEntries" WHERE "parentNoteId" IS NULL ORDER BY "createdAt"
    `;

    if (rows.length === 0) {
      console.log('No StudyThreadEntries rows have a NULL parentNoteId — nothing to reconcile.');
      console.log('`npm run db:push` should be able to apply the NOT NULL constraint.');
      return;
    }

    console.log(`Found ${rows.length} StudyThreadEntries row(s) with a NULL parentNoteId.`);

    for (const row of rows) {
      describe(row);

      const [owner] = await sql`SELECT id FROM "Users" WHERE id = ${String(row.userId)} LIMIT 1`;
      console.log(`    owner still exists: ${owner ? 'yes' : 'NO — account is gone'}`);

      if (row.linkedNoteId) {
        const [note] = await sql`
          SELECT id, "userId" FROM "Notes" WHERE id = ${String(row.linkedNoteId)} LIMIT 1
        `;
        console.log(
          `    linked note exists: ${note ? `yes (owner ${note.userId})` : 'NO — dangling reference'}`,
        );
      }
    }

    const withContent = rows.filter((row) => authoredContent(row).length > 0);

    console.log(
      `\n${withContent.length} of ${rows.length} row(s) still carry authored text; ${
        rows.length - withContent.length
      } are empty.`,
    );

    if (!shouldDelete) {
      console.log('\nReport only. Re-run with --delete to back these up and remove them.');
      console.log(
        'If any row above holds writing worth keeping, give it a parent instead:\n' +
          '  UPDATE "StudyThreadEntries" SET "parentNoteId" = \'<noteId>\' WHERE id = \'<entryId>\';',
      );
      return;
    }

    if (withContent.length > 0 && !force) {
      console.error(
        `\nRefusing to delete: ${withContent.length} row(s) still carry authored text.` +
          '\nRe-parent them, or re-run with --delete --force if the text really is disposable.',
      );
      process.exitCode = 1;
      return;
    }

    const backupDir = join(repoRoot, 'scripts', 'backups');
    mkdirSync(backupDir, { recursive: true });
    const backupPath = join(
      backupDir,
      `null-parent-study-threads-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
    );
    writeFileSync(backupPath, JSON.stringify(rows, null, 2), 'utf8');
    console.log(`\nBacked up ${rows.length} row(s) to ${backupPath}`);

    const ids = rows.map((row) => String(row.id));

    // Tombstone first: if the delete fails, a spurious tombstone is harmless
    // (clients drop a row that is still there and get it back on next bootstrap),
    // whereas deleting without one leaves the row stranded in local caches.
    const now = new Date().toISOString();
    for (const row of rows) {
      const tombstoneId = `sync_delete_studyThread_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      await sql`
        INSERT INTO "SyncDeletedEntities" ("id", "userId", "entityType", "entityId", "deletedAt")
        VALUES (${tombstoneId}, ${String(row.userId)}, 'studyThread', ${String(row.id)}, ${now})
      `;
    }
    console.log(`Wrote ${rows.length} studyThread tombstone(s) so clients drop their local copies.`);

    const deleted = await sql`DELETE FROM "StudyThreadEntries" WHERE id = ANY(${ids}) RETURNING id`;
    console.log(`Deleted ${deleted.length} row(s).`);
    console.log('\nNow run `npm run db:push` — the NOT NULL alter should apply.');
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
