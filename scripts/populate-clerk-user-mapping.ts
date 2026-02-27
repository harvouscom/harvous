/**
 * One-time populate of ClerkUserMapping from existing UserMetadata.
 * Use when production uses pk_live but Turso data is under pk_test (Development) user IDs;
 * the mapping table is used by auth middleware to resolve live → dev at request time.
 *
 * Usage (from repo root, with production DB credentials in .env):
 *   npx tsx scripts/populate-clerk-user-mapping.ts
 *
 * Requires: TURSO_DATABASE_URL, TURSO_AUTH_TOKEN (or ASTRO_DB_*).
 */
import 'dotenv/config';
import { db, UserMetadata, ClerkUserMapping } from '../server/db';
import { and, isNotNull, sql } from 'drizzle-orm';

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function main() {
  const rows = await db
    .select({ userId: UserMetadata.userId, email: UserMetadata.email })
    .from(UserMetadata)
    .where(and(isNotNull(UserMetadata.email), sql`${UserMetadata.email} != ''`))
    .all();

  const toInsert = rows
    .map((r) => ({
      devUserId: r.userId,
      email: normalizeEmail(r.email!),
      liveUserId: null as string | null,
    }))
    .filter((r) => r.email.length > 0);

  if (toInsert.length === 0) {
    console.log('No UserMetadata rows with email found. Nothing to insert.');
    return;
  }

  await db
    .insert(ClerkUserMapping)
    .values(toInsert)
    .onConflictDoUpdate({
      target: ClerkUserMapping.devUserId,
      set: { email: sql`excluded.email` },
    });

  console.log(`ClerkUserMapping: ${toInsert.length} row(s) inserted or updated (email refreshed).`);
  console.log('Run db:push first if the table does not exist.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
