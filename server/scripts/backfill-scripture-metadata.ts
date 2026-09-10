/**
 * Backfill: give every scripture pill in a note its `ScriptureMetadata` row.
 *
 * That table is the passage→note index behind the Bible reader's margin bars
 * (`/api/scripture/chapter-notes` → `usePrototypeChapterNotes`). Rows are normally written on
 * save by `processScriptureReferences`, but only pills that passed through this account's
 * pending→resolved save were ever guaranteed one: a pill that arrived already carrying a real
 * `data-note-id` — pasted, imported, synced from native, restored from a share, or simply
 * older than that code path — is treated as "already indexed" by a check derived from the
 * note's HTML rather than from the database, and skipped. The bug that dropped all but the
 * first pill of a multi-pill note on every re-save is fixed in `process-scripture-references.ts`;
 * this repairs the notes that already lost their rows, which the fix alone cannot do.
 *
 * Read-only with respect to `Notes`. It must stay that way: `Notes.updatedAt` doubles as the
 * sidebar's sort key and the offline sync watermark, so a backfill that touched it would
 * re-sort and re-sync every note it repaired.
 *
 * Encrypted notes are skipped, and counted separately in the summary. Their bodies are opaque
 * to the server, so there is no pill to read — that is a known gap, not a failure here.
 *
 * Usage (requires `SUPABASE_DATABASE_URL` or `SUPABASE_DIRECT_URL` in env — same as the API):
 *   npx tsx server/scripts/backfill-scripture-metadata.ts --dry-run
 *   npx tsx server/scripts/backfill-scripture-metadata.ts --userId=user_xxx
 *   npx tsx server/scripts/backfill-scripture-metadata.ts
 *   npx tsx server/scripts/backfill-scripture-metadata.ts --limit=500
 */

import 'dotenv/config';
import { db, Notes, ScriptureMetadata, eq, and, ne } from '../db';
import { normalizeScriptureReference, parseScriptureReference } from '@/utils/scripture-detector';
import { upsertScriptureMetadataForNote } from '../utils/process-scripture-references';
import { fetchVerseText } from '../utils/fetch-verse-text';

/** Default when a pill carries no `data-scripture-translation` of its own. */
const FALLBACK_TRANSLATION = 'NET';

function parseArgs() {
  const dryRun = process.argv.includes('--dry-run');
  let userId: string | undefined;
  let limit: number | undefined;
  for (const a of process.argv) {
    if (a.startsWith('--userId=')) userId = a.slice('--userId='.length).trim() || undefined;
    if (a.startsWith('--limit=')) {
      const n = Number.parseInt(a.slice('--limit='.length), 10);
      if (!Number.isNaN(n) && n > 0) limit = n;
    }
  }
  return { dryRun, userId, limit };
}

/**
 * Every pill in a body, as (normalized reference, translation) pairs.
 *
 * Deliberately the same span pattern and the same per-pill translation override the live path
 * reads, so what this indexes is exactly what a save would have indexed.
 */
function pillsInContent(content: string): Map<string, string> {
  const out = new Map<string, string>();
  const pattern = /<span[^>]*data-scripture-reference\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(content)) !== null) {
    const normalized = normalizeScriptureReference(match[1]?.trim() ?? '');
    // A reference the parser cannot place has no book/chapter/verse to file it under, so
    // there is no row to write — the pill is text, not an anchor.
    if (!normalized || !parseScriptureReference(normalized)) continue;
    if (out.has(normalized)) continue;
    const translationMatch = match[0].match(/data-scripture-translation\s*=\s*["']([^"']+)["']/);
    out.set(normalized, translationMatch?.[1] || FALLBACK_TRANSLATION);
  }
  return out;
}

/** Notes worth opening: this user's own, not scripture children, with at least one pill. */
async function candidateNotes(userId: string) {
  const rows = await db
    .select({
      id: Notes.id,
      content: Notes.content,
      contentEncrypted: Notes.contentEncrypted,
    })
    .from(Notes)
    .where(and(eq(Notes.userId, userId), ne(Notes.noteType, 'scripture')));
  return rows;
}

async function referencesAlreadyIndexed(noteId: string): Promise<Set<string>> {
  const rows = await db
    .select({ reference: ScriptureMetadata.reference })
    .from(ScriptureMetadata)
    .where(eq(ScriptureMetadata.noteId, noteId));
  return new Set(rows.map((r) => r.reference));
}

async function targetUserIds(userId: string | undefined): Promise<string[]> {
  if (userId) return [userId];
  const rows = await db
    .selectDistinct({ userId: Notes.userId })
    .from(Notes)
    .where(ne(Notes.noteType, 'scripture'));
  return rows.map((r) => r.userId).filter(Boolean);
}

async function main() {
  const { dryRun, userId, limit } = parseArgs();
  const users = await targetUserIds(userId);
  console.log(
    `[backfill-scripture-metadata] ${users.length} user(s)${dryRun ? ' (dry-run, nothing written)' : ''}`,
  );

  let written = 0;
  let notesTouched = 0;
  let encryptedSkipped = 0;
  let failed = 0;

  outer: for (const uid of users) {
    for (const note of await candidateNotes(uid)) {
      if (note.contentEncrypted) {
        if (note.content?.includes('data-scripture-reference')) encryptedSkipped++;
        continue;
      }
      const pills = pillsInContent(note.content ?? '');
      if (pills.size === 0) continue;

      const indexed = await referencesAlreadyIndexed(note.id);
      const missing = [...pills].filter(([reference]) => !indexed.has(reference));
      if (missing.length === 0) continue;

      notesTouched++;
      for (const [reference, translation] of missing) {
        if (dryRun) {
          console.log(`[backfill-scripture-metadata]   would index ${note.id}: ${reference} (${translation})`);
          written++;
        } else {
          try {
            /*
             * The live writer, so a repaired row is byte-for-byte the row a save would have
             * written. It is idempotent, so re-running over a repaired account updates rather
             * than duplicates.
             *
             * `originalText` falls back to the reference when the verse text cannot be
             * fetched. The margin only needs book/chapter/verse, and a row that exists with a
             * thin `originalText` marks the passage; a row that was never written marks
             * nothing, which is the failure this script is here to end.
             */
            const verseText = await fetchVerseText(reference, translation).catch(() => '');
            await upsertScriptureMetadataForNote(note.id, reference, translation, verseText || reference);
            written++;
          } catch (error) {
            failed++;
            console.error(
              `[backfill-scripture-metadata]   failed ${note.id}: ${reference}:`,
              error instanceof Error ? error.message : error,
            );
          }
        }
        if (limit != null && written >= limit) break outer;
      }
    }
  }

  console.log(
    `[backfill-scripture-metadata] done. rows=${written} notes=${notesTouched} failed=${failed} encryptedSkipped=${encryptedSkipped}${dryRun ? ' (dry-run)' : ''}`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error('[backfill-scripture-metadata] fatal:', err);
  process.exit(1);
});
