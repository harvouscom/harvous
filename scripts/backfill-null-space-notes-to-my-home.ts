/**
 * One-time backfill: scope legacy null spaceId notes to each user's "My Home" space.
 * Skips classic `noteType: scripture` notes (they stay classic-only; 2.0 shell excludes them).
 * Reuses ensurePersonalHomeSpaceDetailed (same logic as GET /api/navigation/data).
 *
 * Usage (requires SUPABASE_DATABASE_URL or SUPABASE_DIRECT_URL in env):
 *   npx tsx scripts/backfill-null-space-notes-to-my-home.ts --dry-run
 *   npx tsx scripts/backfill-null-space-notes-to-my-home.ts
 *   npx tsx scripts/backfill-null-space-notes-to-my-home.ts --userId=user_xxx
 *
 * Staging vs production: point `.env` at the target Supabase DB before running.
 */
import 'dotenv/config';
import { db, Notes } from '../server/db';
import { isNull } from 'drizzle-orm';
import { ensurePersonalHomeSpaceDetailed } from '../server/utils/ensure-personal-home-space';

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
  console.log(dryRun ? '[dry-run] No writes.' : '[live] Applying backfill.');

  let userIds: string[];
  if (userId) {
    userIds = [userId];
  } else {
    const rows = await db
      .selectDistinct({ userId: Notes.userId })
      .from(Notes)
      .where(isNull(Notes.spaceId));
    userIds = rows.map((r) => r.userId).filter(Boolean) as string[];
  }

  console.log(`Users with null spaceId notes: ${userIds.length}`);

  let totalBackfilled = 0;
  let totalCreatedHome = 0;

  for (const uid of userIds) {
    const result = await ensurePersonalHomeSpaceDetailed(uid, { dryRun });
    if (result.nullNotesBackfilled > 0 || result.createdMyHome) {
      console.log(
        JSON.stringify({
          userIdPrefix: uid.slice(0, 12),
          myHomeSpaceId: result.myHomeSpaceId,
          nullNotesBackfilled: result.nullNotesBackfilled,
          createdMyHome: result.createdMyHome,
        }),
      );
    }
    totalBackfilled += result.nullNotesBackfilled;
    if (result.createdMyHome) totalCreatedHome += 1;
  }

  console.log(
    JSON.stringify({
      dryRun,
      usersProcessed: userIds.length,
      totalNullNotesBackfilled: totalBackfilled,
      totalMyHomeSpacesCreated: totalCreatedHome,
    }),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
