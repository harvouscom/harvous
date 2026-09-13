/**
 * Cleanup: delete NoteConnections rows that point at a note that no longer exists (or is not
 * owned by the row's user), and record `noteConnection` tombstones so synced clients drop them.
 *
 * The read paths already ignore these rows (server/utils/live-note-connections.ts), so this is
 * hygiene rather than a fix: it takes the dead rows out of the table and out of native's copy.
 * Every row is printed in full before anything is deleted, so a mistaken run can be restored.
 *
 *   npx tsx server/scripts/cleanup-orphan-note-connections.ts                       # dry run, all users
 *   npx tsx server/scripts/cleanup-orphan-note-connections.ts --userId=user_x       # dry run, one user
 *   npx tsx server/scripts/cleanup-orphan-note-connections.ts --userId=user_x --apply --production
 */

import 'dotenv/config';
import { requireDbTarget } from '../utils/require-db-target';
import {
  deleteOrphanNoteConnections,
  findOrphanNoteConnections,
} from '../utils/live-note-connections';

const SCRIPT_NAME = 'cleanup-orphan-note-connections';

export function parseCleanupOrphanNoteConnectionsArgs(argv: readonly string[]): {
  apply: boolean;
  userId: string | undefined;
} {
  const userArg = argv.find((arg) => arg.startsWith('--userId='));
  return {
    apply: argv.includes('--apply'),
    userId: userArg ? userArg.slice('--userId='.length).trim() || undefined : undefined,
  };
}

export async function runCleanupOrphanNoteConnections(argv: readonly string[]): Promise<void> {
  const args = parseCleanupOrphanNoteConnectionsArgs(argv);
  requireDbTarget({ scriptName: SCRIPT_NAME, writes: args.apply, argv });

  const orphans = await findOrphanNoteConnections(args.userId);
  const scope = args.userId ? ` for ${args.userId}` : ' across all users';
  console.log(`[${SCRIPT_NAME}] ${orphans.length} orphaned connection(s)${scope}`);
  for (const row of orphans) console.log(JSON.stringify(row));

  if (!args.apply) {
    if (orphans.length > 0) console.log(`[${SCRIPT_NAME}] dry run — re-run with --apply to delete.`);
    return;
  }

  const deletedIds = await deleteOrphanNoteConnections(orphans);
  console.log(`[${SCRIPT_NAME}] deleted ${deletedIds.length}: ${deletedIds.join(', ') || '(none)'}`);
}

if (process.argv[1]?.includes(SCRIPT_NAME)) {
  runCleanupOrphanNoteConnections(process.argv.slice(2))
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(`[${SCRIPT_NAME}] failed:`, error);
      process.exit(1);
    });
}
