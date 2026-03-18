/**
 * List users who have at least one note and their ClerkUserMapping row.
 * Flags rows where devUserId = liveUserId (likely wrong; dev should be the ID that has the data).
 * Read-only; use fix-clerk-mapping-row.ts for any flagged rows.
 *
 * Usage (from repo root, with .env or env vars set):
 *   npx tsx scripts/audit-clerk-mapping-for-users-with-notes.ts
 *
 * Requires: TURSO_DATABASE_URL, TURSO_AUTH_TOKEN (or ASTRO_DB_*).
 */
import 'dotenv/config';
import { db, Notes, UserMetadata, ClerkUserMapping } from '../server/db';
import { first } from '../server/db/helpers';
import { count, eq, or } from 'drizzle-orm';

async function main() {
  const notesByUser = await db
    .select({ userId: Notes.userId, noteCount: count() })
    .from(Notes)
    .groupBy(Notes.userId)
    ;

  if (notesByUser.length === 0) {
    console.log('No users with notes found.');
    return;
  }

  const rows: Array<{
    userId: string;
    noteCount: number;
    email: string | null;
    firstName: string | null;
    lastName: string | null;
    highestSimpleNoteId: number | null;
    mappingDevUserId: string | null;
    mappingLiveUserId: string | null;
    migratedToLiveAt: string | null;
    flag: string;
  }> = [];

  for (const { userId, noteCount } of notesByUser) {
    const meta = first(await db.select().from(UserMetadata).where(eq(UserMetadata.userId, userId)).limit(1));
    const mapping = first(await db
      .select()
      .from(ClerkUserMapping)
      .where(or(eq(ClerkUserMapping.devUserId, userId), eq(ClerkUserMapping.liveUserId, userId)))
      .limit(1));

    const dev = mapping?.devUserId ?? null;
    const live = mapping?.liveUserId ?? null;
    const flag =
      dev != null && live != null && dev === live ? 'CHECK: dev=live' : mapping ? 'OK' : 'no mapping';

    rows.push({
      userId,
      noteCount,
      email: meta?.email ?? null,
      firstName: meta?.firstName ?? null,
      lastName: meta?.lastName ?? null,
      highestSimpleNoteId: meta?.highestSimpleNoteId ?? null,
      mappingDevUserId: dev,
      mappingLiveUserId: live,
      migratedToLiveAt: mapping?.migratedToLiveAt ?? null,
      flag,
    });
  }

  console.log('Users with notes and their ClerkUserMapping (dev=live means fix recommended):\n');
  console.table(
    rows.map((r) => ({
      userId: r.userId.slice(0, 20) + '…',
      noteCount: r.noteCount,
      email: r.email ?? '—',
      devUserId: r.mappingDevUserId != null ? r.mappingDevUserId.slice(0, 20) + '…' : '—',
      liveUserId: r.mappingLiveUserId != null ? r.mappingLiveUserId.slice(0, 20) + '…' : '—',
      flag: r.flag,
    }))
  );
  const checkCount = rows.filter((r) => r.flag === 'CHECK: dev=live').length;
  if (checkCount > 0) {
    console.log(`\n${checkCount} row(s) flagged. Fix with: CORRECT_DEV_USER_ID=<id-with-notes> CORRECT_LIVE_USER_ID=<current-clerk-id> npx tsx scripts/fix-clerk-mapping-row.ts`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
