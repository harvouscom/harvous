/**
 * One-time cleanup: clear spaceId on classic scripture notes scoped to "My Home".
 * Reverses an earlier backfill that moved null-spaceId notes (including scripture) into My Home.
 * After this, those notes stay classic-only; the 2.0 shell excludes noteType scripture.
 *
 * Usage (requires SUPABASE_DATABASE_URL or SUPABASE_DIRECT_URL in env):
 *   npx tsx scripts/unscope-scripture-notes-from-my-home.ts --dry-run
 *   npx tsx scripts/unscope-scripture-notes-from-my-home.ts
 *   npx tsx scripts/unscope-scripture-notes-from-my-home.ts --userId=user_xxx
 *
 * Staging vs production: point `.env` at the target Supabase DB before running.
 */
import 'dotenv/config';
import { db, Notes } from '../server/db';
import { and, eq, isNotNull } from 'drizzle-orm';
import { unscopeLegacyScriptureNotesFromMyHomeDetailed } from '../server/utils/ensure-personal-home-space';

function parseArgs() {
  const dryRun = process.argv.includes('--dry-run');
  let userId: string | undefined;
  for (const a of process.argv) {
    if (a.startsWith('--userId=')) userId = a.slice('--userId='.length).trim() || undefined;
  }
  return { dryRun, userId };
}

async function main() {
  const { dryRun, userId } = parseArgs();
  console.log(dryRun ? '[dry-run] No writes.' : '[live] Unscoping scripture notes from My Home.');

  let userIds: string[];
  if (userId) {
    userIds = [userId];
  } else {
    const rows = await db
      .selectDistinct({ userId: Notes.userId })
      .from(Notes)
      .where(and(eq(Notes.noteType, 'scripture'), isNotNull(Notes.spaceId)));
    userIds = rows.map((r) => r.userId).filter(Boolean) as string[];
  }

  console.log(`Users with scoped scripture notes: ${userIds.length}`);

  let totalUnscoped = 0;
  let usersAffected = 0;

  for (const uid of userIds) {
    const result = await unscopeLegacyScriptureNotesFromMyHomeDetailed(uid, { dryRun });
    if (result.scriptureNotesUnscoped > 0) {
      usersAffected += 1;
      console.log(
        JSON.stringify({
          userIdPrefix: uid.slice(0, 12),
          myHomeSpaceId: result.myHomeSpaceId,
          scriptureNotesUnscoped: result.scriptureNotesUnscoped,
        }),
      );
    }
    totalUnscoped += result.scriptureNotesUnscoped;
  }

  console.log(
    JSON.stringify({
      dryRun,
      usersProcessed: userIds.length,
      usersAffected,
      totalScriptureNotesUnscoped: totalUnscoped,
    }),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
