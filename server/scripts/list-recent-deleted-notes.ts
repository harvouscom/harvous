/**
 * List recent note deletions from SyncDeletedEntities (sync tombstones).
 * Use to investigate notes that vanished cross-device.
 *
 * Usage (requires SUPABASE_DATABASE_URL or SUPABASE_DIRECT_URL in env):
 *   npx tsx server/scripts/list-recent-deleted-notes.ts
 *   npx tsx server/scripts/list-recent-deleted-notes.ts --userId=user_xxx
 *   npx tsx server/scripts/list-recent-deleted-notes.ts --hours=48 --entityType=note
 */

import 'dotenv/config';
import { db } from '../db/client';
import { SyncDeletedEntities } from '../db/schema';
import { and, desc, eq, gt } from 'drizzle-orm';
import { requireDbTarget } from '../utils/require-db-target';

function parseArgs() {
  let userId: string | undefined;
  let hours = 24;
  let entityType = 'note';
  for (const a of process.argv) {
    if (a.startsWith('--userId=')) userId = a.slice('--userId='.length).trim() || undefined;
    if (a.startsWith('--hours=')) hours = Math.max(1, parseInt(a.slice('--hours='.length), 10) || 24);
    if (a.startsWith('--entityType=')) entityType = a.slice('--entityType='.length).trim() || 'note';
  }
  return { userId, hours, entityType };
}

async function main() {
  requireDbTarget({ scriptName: 'list-recent-deleted-notes', writes: false });
  const { userId, hours, entityType } = parseArgs();
  const since = new Date(Date.now() - hours * 60 * 60 * 1000);

  const conditions = [eq(SyncDeletedEntities.entityType, entityType), gt(SyncDeletedEntities.deletedAt, since)];
  if (userId) conditions.push(eq(SyncDeletedEntities.userId, userId));

  const rows = await db
    .select()
    .from(SyncDeletedEntities)
    .where(and(...conditions))
    .orderBy(desc(SyncDeletedEntities.deletedAt))
    .limit(200);

  console.log(
    `Recent ${entityType} tombstones since ${since.toISOString()}${userId ? ` for ${userId}` : ''}: ${rows.length} row(s)\n`,
  );

  if (rows.length === 0) {
    console.log('No tombstones in window. Try --hours=168 or omit --userId.');
    return;
  }

  for (const row of rows) {
    console.log(`${row.deletedAt}\t${row.userId}\t${row.entityId}\t${row.id}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
