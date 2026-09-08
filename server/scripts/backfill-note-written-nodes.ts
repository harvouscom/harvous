/**
 * Backfill: give every note the reader wrote its `note:` node in the Study Bible layer.
 *
 * Notes are recorded on save now (`noteWrittenTouches`, called from process-scripture-references),
 * but nothing recorded them before that, and a note only became a node if it happened to carry a
 * scripture pill. Measured on a real account: of 31 notes substantial enough to be worth asking
 * about, exactly one existed as a node. Those notes will not get one until they are next saved,
 * which for most of them is never.
 *
 * **Idempotent and resumable, by construction rather than by care.** It writes only for notes that
 * have no node, so a second run finds nothing and cannot double-count. Use this rather than
 * `backfill-study-bible-layer --reset`, which deletes the account's rows and takes accumulated
 * counters and the review mirrors reconstructed from ReviewItems with them.
 *
 * The touch is dated at the note's `createdAt`, which is the point: `firstStudiedAt` folds with
 * LEAST, so a note written two years ago lands on the far side of the age gate rather than three
 * days in front of it.
 *
 * Usage (requires `SUPABASE_DATABASE_URL` or `SUPABASE_DIRECT_URL` in env — same as the API):
 *   npx tsx server/scripts/backfill-note-written-nodes.ts --dry-run
 *   npx tsx server/scripts/backfill-note-written-nodes.ts --userId=user_xxx --dry-run
 *   npx tsx server/scripts/backfill-note-written-nodes.ts --userId=user_xxx
 *   npx tsx server/scripts/backfill-note-written-nodes.ts --limit=500
 */

import 'dotenv/config';
import { db, Notes } from '../db';
import { findNotesMissingNoteNode, noteWrittenTouches, touchNodes } from '../utils/study-bible-layer';
import { requireDbTarget } from '../utils/require-db-target';

/** One upsert statement per chunk; `touchNodes` chunks again internally. */
const BATCH = 500;

function parseArgs() {
  const dryRun = process.argv.includes('--dry-run');
  let userId: string | undefined;
  let limit: number | undefined;
  for (const a of process.argv) {
    if (a.startsWith('--userId=')) userId = a.slice('--userId='.length).trim() || undefined;
    if (a.startsWith('--limit=')) {
      const n = parseInt(a.slice('--limit='.length), 10);
      if (!Number.isNaN(n) && n > 0) limit = n;
    }
  }
  return { dryRun, userId, limit };
}

async function targetUserIds(userId: string | undefined): Promise<string[]> {
  if (userId) return [userId];
  const rows = await db.selectDistinct({ userId: Notes.userId }).from(Notes);
  return rows.map((r) => r.userId).filter(Boolean);
}

async function main() {
  const { dryRun, userId, limit } = parseArgs();
  requireDbTarget({ scriptName: 'backfill-note-written-nodes', writes: !dryRun });

  const users = await targetUserIds(userId);
  console.log(`[backfill-note-nodes] ${users.length} user(s)${dryRun ? ' (dry-run)' : ''}`);

  const now = new Date();
  let written = 0;
  let skipped = 0;

  for (const uid of users) {
    const missing = await findNotesMissingNoteNode(uid);
    // Split before the limit so the skipped count reports what the exclusions turned away rather
    // than what the limit cut off — the two mean different things when checking a dry run.
    const touches = missing.flatMap((note) => noteWrittenTouches(note, now));
    skipped += missing.length - touches.length;
    const capped = limit != null ? touches.slice(0, Math.max(0, limit - written)) : touches;
    if (!capped.length) continue;

    console.log(
      `[backfill-note-nodes] user ${uid}: ${capped.length} note(s)` +
        (missing.length !== touches.length ? ` (${missing.length - touches.length} not theirs to claim)` : ''),
    );
    if (!dryRun) {
      for (let i = 0; i < capped.length; i += BATCH) {
        await touchNodes(uid, capped.slice(i, i + BATCH));
      }
    }
    written += capped.length;
    if (limit != null && written >= limit) break;
  }

  console.log(
    `[backfill-note-nodes] done. notes=${written} skipped=${skipped}${dryRun ? ' (dry-run, nothing written)' : ''}`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error('[backfill-note-nodes] fatal:', err);
  process.exit(1);
});
