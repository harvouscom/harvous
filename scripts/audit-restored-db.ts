/**
 * Audit a DB (current .env or restored): list all users with notes + email,
 * and derekj@hey.com mapping. Run against restored DB to find "other" user IDs
 * that might be your account (e.g. high note count but email not set).
 *
 * Usage (restored DB):
 *   ASTRO_DB_REMOTE_URL="libsql://harvous-db-restored-heyderekj.aws-us-east-1.turso.io" \
 *   ASTRO_DB_APP_TOKEN="your-restored-token" \
 *   npx tsx scripts/audit-restored-db.ts
 *
 * Or with .env pointing at restored DB.
 */
import 'dotenv/config';
import { db, Notes, UserMetadata, ClerkUserMapping, Threads } from '../server/db';
import { count, eq, sql } from 'drizzle-orm';

const TARGET_EMAIL = 'derekj@hey.com';

async function main() {
  console.log('=== All users with notes (sorted by note count desc) ===\n');

  const notesByUser = await db
    .select({ userId: Notes.userId, count: count() })
    .from(Notes)
    .groupBy(Notes.userId)
    .all();

  const sorted = [...notesByUser].sort((a, b) => (b.count as number) - (a.count as number));

  for (const row of sorted) {
    const meta = await db.select({ email: UserMetadata.email }).from(UserMetadata).where(eq(UserMetadata.userId, row.userId)).get();
    const threadCount = await db.select({ count: sql<number>`count(*)` }).from(Threads).where(eq(Threads.userId, row.userId)).get();
    const emailStr = meta?.email ? `  email: ${meta.email}` : '  (no email in UserMetadata)';
    console.log(` ${row.userId}`);
    console.log(`   → notes: ${row.count}, threads: ${threadCount?.count ?? 0} ${emailStr}\n`);
  }

  console.log('=== Rows for', TARGET_EMAIL, '===\n');

  const meta = await db
    .select({ userId: UserMetadata.userId })
    .from(UserMetadata)
    .where(sql`lower(${UserMetadata.email}) = ${TARGET_EMAIL}`)
    .all();

  const mapping = await db
    .select()
    .from(ClerkUserMapping)
    .where(sql`lower(${ClerkUserMapping.email}) = ${TARGET_EMAIL}`)
    .all();

  console.log('UserMetadata userIds with this email:', meta.length ? meta.map((r) => r.userId) : '(none)');
  console.log('ClerkUserMapping rows:', mapping.length);
  mapping.forEach((r) => console.log('  dev:', r.devUserId, ' live:', r.liveUserId, ' migrated:', r.migratedToLiveAt ? 'yes' : 'no'));

  if (meta.length || mapping.length) {
    const userIds = [...new Set([...meta.map((r) => r.userId), ...mapping.map((r) => r.devUserId), ...mapping.map((r) => r.liveUserId).filter(Boolean)])];
    console.log('\nNote counts for those userIds:');
    for (const uid of userIds) {
      const noteCount = await db.select({ count: sql<number>`count(*)` }).from(Notes).where(eq(Notes.userId, uid)).get();
      console.log(' ', uid, '→', noteCount?.count ?? 0, 'notes');
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
