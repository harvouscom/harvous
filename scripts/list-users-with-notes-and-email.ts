/**
 * List every userId that has notes, with note count and email from UserMetadata (if any).
 * Use to find "derekj@hey.com" account when it might not be in UserMetadata yet.
 *
 * Usage: npx tsx scripts/list-users-with-notes-and-email.ts
 * Optional: MIN_NOTES=50 to only show users with at least 50 notes
 */
import 'dotenv/config';
import { db, Notes, UserMetadata } from '../server/db';
import { first } from '../server/db/helpers';
import { count, eq } from 'drizzle-orm';

async function main() {
  const minNotes = parseInt(process.env.MIN_NOTES ?? '0', 10);

  const notesByUser = await db
    .select({ userId: Notes.userId, count: count() })
    .from(Notes)
    .groupBy(Notes.userId)
    ;

  const filtered = minNotes ? notesByUser.filter((r) => r.count >= minNotes) : notesByUser;
  console.log('Users with notes', minNotes ? `(>= ${minNotes} notes)` : '', ':');
  for (const row of filtered) {
    const meta = first(await db.select({ email: UserMetadata.email }).from(UserMetadata).where(eq(UserMetadata.userId, row.userId)).limit(1));
    console.log(' ', row.userId, '→', row.count, 'notes', meta?.email ? `  email: ${meta.email}` : '');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
