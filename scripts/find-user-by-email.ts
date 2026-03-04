/**
 * Find userId(s) for an email in UserMetadata and ClerkUserMapping, with note/thread counts.
 *
 * Usage: EMAIL=derekj@hey.com npx tsx scripts/find-user-by-email.ts
 */
import 'dotenv/config';
import { db, UserMetadata, ClerkUserMapping, Notes, Threads } from '../server/db';
import { eq, sql } from 'drizzle-orm';

async function main() {
  const email = process.env.EMAIL?.trim().toLowerCase();
  if (!email) {
    console.error('Set EMAIL=... (e.g. EMAIL=derekj@hey.com)');
    process.exit(1);
  }

  const meta = await db
    .select({ userId: UserMetadata.userId })
    .from(UserMetadata)
    .where(sql`lower(${UserMetadata.email}) = ${email}`)
    .all();

  const mapping = await db
    .select()
    .from(ClerkUserMapping)
    .where(sql`lower(${ClerkUserMapping.email}) = ${email}`)
    .all();

  const userIds = [...new Set([...meta.map((r) => r.userId), ...mapping.map((r) => r.devUserId), ...mapping.map((r) => r.liveUserId).filter((v): v is string => Boolean(v))])];

  console.log('Email:', email);
  console.log('UserMetadata userIds:', meta.map((r) => r.userId));
  console.log('ClerkUserMapping rows:', mapping.length);
  if (mapping.length) mapping.forEach((r) => console.log('  dev:', r.devUserId, ' live:', r.liveUserId, ' migrated:', r.migratedToLiveAt ? 'yes' : 'no'));

  if (userIds.length === 0) {
    console.log('No userId found for this email.');
    return;
  }

  console.log('\nNote and thread counts per userId:');
  for (const uid of userIds) {
    const noteCount = await db.select({ count: sql<number>`count(*)` }).from(Notes).where(eq(Notes.userId, uid)).get();
    const threadCount = await db.select({ count: sql<number>`count(*)` }).from(Threads).where(eq(Threads.userId, uid)).get();
    console.log(' ', uid, '→ notes:', noteCount?.count ?? 0, ', threads:', threadCount?.count ?? 0);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
