/**
 * Batch purge legacy onboarding Welcome thread + system seed notes.
 *
 * Usage (requires SUPABASE_DATABASE_URL or SUPABASE_DIRECT_URL in env):
 *   npx tsx server/scripts/purge-onboarding-content.ts --dry-run
 *   npx tsx server/scripts/purge-onboarding-content.ts
 *   npx tsx server/scripts/purge-onboarding-content.ts --userId=user_xxx
 */
import 'dotenv/config';
import { db, Threads, Notes, eq, sql } from '../db';
import { purgeOnboardingContentForUser } from '../utils/purge-onboarding-content';
import { requireDbTarget } from '../utils/require-db-target';

function parseArgs() {
  const dryRun = process.argv.includes('--dry-run');
  let userId: string | undefined;
  for (const a of process.argv) {
    if (a.startsWith('--userId=')) userId = a.slice('--userId='.length).trim() || undefined;
  }
  return { dryRun, userId };
}

async function findUsersWithOnboardingContent(): Promise<string[]> {
  const threadRows = await db
    .selectDistinct({ userId: Threads.userId })
    .from(Threads)
    .where(sql`starts_with(${Threads.id}::text, 'thread_onboarding_')`);

  const noteRows = await db
    .selectDistinct({ userId: Notes.userId })
    .from(Notes)
    .where(sql`starts_with(${Notes.threadId}::text, 'thread_onboarding_')`);

  const ids = new Set<string>();
  for (const r of [...threadRows, ...noteRows]) {
    if (r.userId) ids.add(r.userId);
  }
  return [...ids];
}

async function main() {
  requireDbTarget({ scriptName: 'purge-onboarding-content', writes: true });
  const { dryRun, userId } = parseArgs();
  console.log(dryRun ? '[dry-run] No writes.' : '[live] Purging onboarding content.');

  const userIds = userId ? [userId] : await findUsersWithOnboardingContent();
  console.log(`Users with onboarding content: ${userIds.length}`);

  let totalNotes = 0;
  let totalThreads = 0;

  for (const uid of userIds) {
    if (dryRun) {
      const onboardingThreadId = `thread_onboarding_${uid}`;
      const thread = await db
        .select({ id: Threads.id })
        .from(Threads)
        .where(eq(Threads.id, onboardingThreadId))
        .limit(1);
      const notes = await db
        .select({ id: Notes.id })
        .from(Notes)
        .where(sql`starts_with(${Notes.threadId}::text, 'thread_onboarding_')`);
      if (thread.length > 0 || notes.length > 0) {
        console.log(
          JSON.stringify({
            userIdPrefix: uid.slice(0, 12),
            wouldDeleteNotes: notes.length,
            wouldDeleteThread: thread.length > 0,
          }),
        );
      }
      totalNotes += notes.length;
      if (thread.length > 0) totalThreads += 1;
    } else {
      const result = await purgeOnboardingContentForUser(uid);
      if (result.notesDeleted > 0 || result.threadDeleted) {
        console.log(
          JSON.stringify({
            userIdPrefix: uid.slice(0, 12),
            notesDeleted: result.notesDeleted,
            threadDeleted: result.threadDeleted,
          }),
        );
      }
      totalNotes += result.notesDeleted;
      if (result.threadDeleted) totalThreads += 1;
    }
  }

  console.log(
    dryRun
      ? `[dry-run] Would purge ${totalNotes} notes and ${totalThreads} threads across ${userIds.length} users.`
      : `[live] Purged ${totalNotes} notes and ${totalThreads} threads across ${userIds.length} users.`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
