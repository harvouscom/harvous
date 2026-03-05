/**
 * One-time repair: set UserMetadata.highestSimpleNoteId = max(Notes.simpleNoteId)
 * for each user where the computed max is greater than the stored value.
 *
 * Run once against production (or target) DB to fix existing drift.
 *
 * Usage (from repo root, with DB credentials in .env or .env.local):
 *   npx tsx scripts/repair-simple-note-id.ts
 *
 * Requires: TURSO_DATABASE_URL, TURSO_AUTH_TOKEN (or ASTRO_DB_REMOTE_URL, ASTRO_DB_APP_TOKEN).
 */
import 'dotenv/config';
import { db, UserMetadata, Notes } from '../server/db';
import { eq, sql } from 'drizzle-orm';
import { nowISO } from '../server/db/dates';

async function main() {
  const allMeta = await db.select({ userId: UserMetadata.userId, highestSimpleNoteId: UserMetadata.highestSimpleNoteId }).from(UserMetadata).all();
  let repaired = 0;
  for (const meta of allMeta) {
    const maxRow = await db
      .select({ maxId: sql<number | null>`max(${Notes.simpleNoteId})` })
      .from(Notes)
      .where(eq(Notes.userId, meta.userId))
      .get();
    const maxFromNotes = maxRow?.maxId != null ? maxRow.maxId : 0;
    const current = meta.highestSimpleNoteId ?? 0;
    if (maxFromNotes > current) {
      await db
        .update(UserMetadata)
        .set({ highestSimpleNoteId: maxFromNotes, updatedAt: nowISO() })
        .where(eq(UserMetadata.userId, meta.userId));
      console.log(`Repaired userId=${meta.userId}: highestSimpleNoteId ${current} -> ${maxFromNotes}`);
      repaired++;
    }
  }
  console.log(`Done. ${repaired} user(s) repaired of ${allMeta.length} total.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
