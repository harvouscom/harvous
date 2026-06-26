/**
 * Backfill: compute a passage memory fingerprint for existing notes that don't have one yet.
 *
 * Fingerprints are normally written on save (process-scripture-references). This script seeds them
 * for notes that predate the feature. Idempotent and resumable — it recomputes per note and upserts.
 *
 * Usage (requires `SUPABASE_DATABASE_URL` or `SUPABASE_DIRECT_URL` in env — same as the API):
 *   npx tsx server/scripts/backfill-note-fingerprints.ts --dry-run
 *   npx tsx server/scripts/backfill-note-fingerprints.ts
 *   npx tsx server/scripts/backfill-note-fingerprints.ts --userId=user_xxx
 *   npx tsx server/scripts/backfill-note-fingerprints.ts --all          # recompute every note, not just missing
 *   npx tsx server/scripts/backfill-note-fingerprints.ts --limit=1000
 *
 * Prereq: `npm run db:push` (or apply server/db/manual/create-note-fingerprints.sql) so the table exists.
 */

import 'dotenv/config';
import { db, Notes, eq, and, ne } from '../db';
import { computeAndStoreNoteFingerprint, findNotesMissingFingerprint } from '../utils/note-fingerprint';

function parseArgs() {
  const dryRun = process.argv.includes('--dry-run');
  const all = process.argv.includes('--all');
  let userId: string | undefined;
  let limit: number | undefined;
  for (const a of process.argv) {
    if (a.startsWith('--userId=')) userId = a.slice('--userId='.length).trim() || undefined;
    if (a.startsWith('--limit=')) {
      const n = parseInt(a.slice('--limit='.length), 10);
      if (!Number.isNaN(n) && n > 0) limit = n;
    }
  }
  return { dryRun, all, userId, limit };
}

/** Distinct userIds with non-scripture notes (or just the requested user). */
async function targetUserIds(userId: string | undefined): Promise<string[]> {
  if (userId) return [userId];
  const rows = await db
    .selectDistinct({ userId: Notes.userId })
    .from(Notes)
    .where(ne(Notes.noteType, 'scripture'));
  return rows.map((r) => r.userId).filter(Boolean);
}

async function noteIdsForUser(userId: string, all: boolean): Promise<string[]> {
  if (!all) return findNotesMissingFingerprint(userId);
  const rows = await db
    .select({ id: Notes.id })
    .from(Notes)
    .where(and(eq(Notes.userId, userId), ne(Notes.noteType, 'scripture')));
  return rows.map((r) => r.id);
}

async function main() {
  const { dryRun, all, userId, limit } = parseArgs();
  const users = await targetUserIds(userId);
  console.log(`[backfill-fingerprints] ${users.length} user(s); mode=${all ? 'all' : 'missing-only'}${dryRun ? ' (dry-run)' : ''}`);

  let processed = 0;
  let failed = 0;
  for (const uid of users) {
    let ids = await noteIdsForUser(uid, all);
    if (limit != null) ids = ids.slice(0, Math.max(0, limit - processed));
    if (ids.length === 0) continue;
    console.log(`[backfill-fingerprints] user ${uid}: ${ids.length} note(s)`);

    for (const id of ids) {
      if (dryRun) {
        processed++;
        continue;
      }
      const result = await computeAndStoreNoteFingerprint(id, uid);
      if (result) processed++;
      else failed++;
      if (limit != null && processed >= limit) break;
    }
    if (limit != null && processed >= limit) break;
  }

  console.log(`[backfill-fingerprints] done. processed=${processed} failed=${failed}${dryRun ? ' (dry-run, nothing written)' : ''}`);
  process.exit(0);
}

main().catch((err) => {
  console.error('[backfill-fingerprints] fatal:', err);
  process.exit(1);
});
