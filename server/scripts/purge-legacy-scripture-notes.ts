/**
 * Batch purge legacy noteType: scripture child notes (pills + docks model).
 *
 * Usage (requires SUPABASE_DATABASE_URL or SUPABASE_DIRECT_URL in env):
 *   npx tsx server/scripts/purge-legacy-scripture-notes.ts --dry-run
 *   npx tsx server/scripts/purge-legacy-scripture-notes.ts
 *   npx tsx server/scripts/purge-legacy-scripture-notes.ts --userId=user_xxx
 */
import 'dotenv/config';
import {
  countLegacyScriptureNotesForUser,
  findUsersWithLegacyScriptureNotes,
  migrateParentNotesFromLegacyScriptureChildren,
  purgeLegacyScriptureNotesForUser,
} from '../utils/purge-legacy-scripture-notes';

function parseArgs() {
  const dryRun = process.argv.includes('--dry-run');
  const migrateOnly = process.argv.includes('--migrate-only');
  let userId: string | undefined;
  for (const a of process.argv) {
    if (a.startsWith('--userId=')) userId = a.slice('--userId='.length).trim() || undefined;
  }
  return { dryRun, migrateOnly, userId };
}

async function main() {
  const { dryRun, migrateOnly, userId } = parseArgs();
  console.log(
    dryRun
      ? '[dry-run] No writes.'
      : migrateOnly
        ? '[live] Migrating parent pills/metadata only (no deletes).'
        : '[live] Migrating parent notes then deleting legacy scripture notes.',
  );

  const userIds = userId ? [userId] : await findUsersWithLegacyScriptureNotes();
  console.log(`Users with legacy scripture notes: ${userIds.length}`);

  let totalScriptureNotes = 0;
  let totalDeleted = 0;
  let totalParentsUpdated = 0;
  let totalMetadataCopied = 0;

  for (const uid of userIds) {
    const scriptureCount = await countLegacyScriptureNotesForUser(uid);
    if (scriptureCount === 0) continue;
    totalScriptureNotes += scriptureCount;

    if (dryRun) {
      console.log(
        JSON.stringify({
          userIdPrefix: uid.slice(0, 12),
          legacyScriptureNotes: scriptureCount,
          wouldMigrateAndDelete: !migrateOnly,
        }),
      );
      continue;
    }

    if (migrateOnly) {
      const migrated = await migrateParentNotesFromLegacyScriptureChildren(uid);
      if (migrated.parentNotesUpdated > 0 || migrated.metadataRowsCopied > 0) {
        console.log(
          JSON.stringify({
            userIdPrefix: uid.slice(0, 12),
            parentNotesUpdated: migrated.parentNotesUpdated,
            metadataRowsCopied: migrated.metadataRowsCopied,
          }),
        );
      }
      totalParentsUpdated += migrated.parentNotesUpdated;
      totalMetadataCopied += migrated.metadataRowsCopied;
      continue;
    }

    const result = await purgeLegacyScriptureNotesForUser(uid);
    if (
      result.scriptureNotesDeleted > 0 ||
      result.parentNotesUpdated > 0 ||
      result.metadataRowsCopied > 0
    ) {
      console.log(
        JSON.stringify({
          userIdPrefix: uid.slice(0, 12),
          scriptureNotesDeleted: result.scriptureNotesDeleted,
          parentNotesUpdated: result.parentNotesUpdated,
          metadataRowsCopied: result.metadataRowsCopied,
        }),
      );
    }
    totalDeleted += result.scriptureNotesDeleted;
    totalParentsUpdated += result.parentNotesUpdated;
    totalMetadataCopied += result.metadataRowsCopied;
  }

  if (dryRun) {
    console.log(
      `[dry-run] Would purge ${totalScriptureNotes} legacy scripture notes across ${userIds.length} users.`,
    );
  } else if (migrateOnly) {
    console.log(
      `[live] Migrated ${totalParentsUpdated} parent notes (${totalMetadataCopied} metadata rows copied).`,
    );
  } else {
    console.log(
      `[live] Deleted ${totalDeleted} legacy scripture notes; updated ${totalParentsUpdated} parent notes (${totalMetadataCopied} metadata rows copied).`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
