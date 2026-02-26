/**
 * List all userId values in Notes and Threads with row counts.
 * Use this to see if your old notes are stored under a different userId than
 * the one Clerk returns now (e.g. user_35FUJeL).
 *
 * Usage (from repo root, with .env or env vars set):
 *   npx tsx scripts/check-user-ids-in-db.ts
 *
 * Requires: ASTRO_DB_REMOTE_URL, ASTRO_DB_APP_TOKEN (same as production).
 */
import 'dotenv/config';
import { db, Notes, Threads } from '../server/db';
import { count } from 'drizzle-orm';

async function main() {
  const notesByUser = await db
    .select({ userId: Notes.userId, count: count() })
    .from(Notes)
    .groupBy(Notes.userId)
    .all();

  const threadsByUser = await db
    .select({ userId: Threads.userId, count: count() })
    .from(Threads)
    .groupBy(Threads.userId)
    .all();

  console.log('Notes per userId:');
  console.table(notesByUser);
  console.log('\nThreads per userId:');
  console.table(threadsByUser);
  console.log('\nIf your ~80 notes are under a different userId than user_35FUJeL,');
  console.log('we can migrate those rows to your current Clerk userId.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
