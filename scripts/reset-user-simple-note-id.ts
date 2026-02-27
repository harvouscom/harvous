/**
 * Reset or reconcile a user's highestSimpleNoteId (for billing/next-note-ID).
 * Use when a user's counter is out of sync after merges or bad data.
 *
 * Usage (from repo root, with production DB credentials in .env):
 *   USER_ID=user_35FUJeLEI2L0gRjCJqIIbNWraRK npx tsx scripts/reset-user-simple-note-id.ts
 *
 * Modes:
 *   Default (reconcile): Set highestSimpleNoteId = MAX(Notes.simpleNoteId) for that user (or 0 if no notes).
 *   RESET_TO_ZERO=true:  Set highestSimpleNoteId = 0. Use only when the user has no notes.
 *
 * Requires: TURSO_DATABASE_URL, TURSO_AUTH_TOKEN (or ASTRO_DB_*).
 */
import 'dotenv/config';
import { db, UserMetadata, Notes } from '../server/db';
import { eq, sql } from 'drizzle-orm';
import { nowISO } from '../server/db/dates';

async function main() {
  const userId = process.env.USER_ID?.trim();
  const resetToZero = process.env.RESET_TO_ZERO === 'true';

  if (!userId) {
    console.error('Set USER_ID (Clerk userId from Turso, e.g. user_35FUJeLEI2L0gRjCJqIIbNWraRK).');
    process.exit(1);
  }

  const meta = await db.select().from(UserMetadata).where(eq(UserMetadata.userId, userId)).get();
  if (!meta) {
    console.error('No UserMetadata row found for USER_ID. User may not exist in the DB.');
    process.exit(1);
  }

  const before = meta.highestSimpleNoteId ?? 0;
  const noteCount = await db.select({ count: sql<number>`count(*)` }).from(Notes).where(eq(Notes.userId, userId)).get();
  const count = noteCount?.count ?? 0;

  let newValue: number;
  if (resetToZero) {
    newValue = 0;
    console.log('Mode: RESET_TO_ZERO — setting highestSimpleNoteId to 0');
  } else {
    const maxRow = await db
      .select({ maxId: sql<number>`max(${Notes.simpleNoteId})` })
      .from(Notes)
      .where(eq(Notes.userId, userId))
      .get();
    newValue = maxRow?.maxId != null ? maxRow.maxId : 0;
    console.log('Mode: reconcile — setting highestSimpleNoteId to MAX(Notes.simpleNoteId) for this user');
  }

  console.log('USER_ID:', userId);
  console.log('Note count (Notes table):', count);
  console.log('Before highestSimpleNoteId:', before);
  console.log('After highestSimpleNoteId:', newValue);

  await db
    .update(UserMetadata)
    .set({ highestSimpleNoteId: newValue, updatedAt: nowISO() })
    .where(eq(UserMetadata.userId, userId));

  console.log('Done.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
