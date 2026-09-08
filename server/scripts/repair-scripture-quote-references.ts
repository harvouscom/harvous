/**
 * Repair: scripture-quote blockquotes whose `data-scripture-quote-reference` attribute holds a
 * rendered scripture pill instead of a reference string.
 *
 * The corrupted value carries its own double quotes, so an HTML parser ends the attribute at the
 * first inner quote and renders the rest of the tag as visible text — the reader sees a stray
 * line like `Genesis 1:1-2" data-scripture-quote-translation="NLT">` under the quote.
 *
 * The markup was written by a highlighter pass that matched the reference text *inside* the
 * attribute value and wrapped it in a pill. That hole was closed in `scripture-highlighter.ts`
 * (9c5388810, 2026-07-02), so this repairs residue rather than an ongoing leak. `CardFullEditable`
 * already repairs the same shape at display time, which is why the note editor looks fine; the
 * stored HTML stays corrupt, so every other reader of it — the Review reveal, share pages,
 * export — still shows the raw markup. This fixes the stored copy.
 *
 * Uses the same `repairCorruptedScriptureQuoteAttributes` helper as the display path, so the two
 * cannot drift. Idempotent: a second run finds nothing.
 *
 * Usage (requires SUPABASE_DATABASE_URL or SUPABASE_DIRECT_URL in env — same as the API):
 *   npx tsx server/scripts/repair-scripture-quote-references.ts --dry-run
 *   npx tsx server/scripts/repair-scripture-quote-references.ts --production
 *   npx tsx server/scripts/repair-scripture-quote-references.ts --noteId=note_xxx --production
 *   npx tsx server/scripts/repair-scripture-quote-references.ts --production --keep-updated-at
 */

import 'dotenv/config';
import { db } from '../db/client';
import { Notes } from '../db/schema';
import { now } from '../db/dates';
import { and, eq, sql } from 'drizzle-orm';
import { requireDbTarget } from '../utils/require-db-target';
import { repairCorruptedScriptureQuoteAttributes } from '@/utils/scripture-pill-display';

const SCRIPT_NAME = 'repair-scripture-quote-references';

/** Same predicate as the detection query, kept in SQL so the scan doesn't read every note. */
const CORRUPT_PREDICATE = sql`${Notes.content} ~ 'data-scripture-quote-reference="\\s*<'`;

function parseArgs() {
  const dryRun = process.argv.includes('--dry-run');
  const keepUpdatedAt = process.argv.includes('--keep-updated-at');
  let noteId: string | undefined;
  for (const a of process.argv) {
    if (a.startsWith('--noteId=')) noteId = a.slice('--noteId='.length).trim() || undefined;
  }
  return { dryRun, keepUpdatedAt, noteId };
}

/** The stray text a reader actually sees: what the parser renders after the attribute breaks. */
function visibleLeakSample(content: string): string | null {
  const m = content.match(/data-scripture-quote-reference="\s*<span\b[^]*?>([^<]*)<\/span>([^"]*)"([^>]*)>/);
  if (!m) return null;
  return `${m[1]}${m[2]}"${m[3]}>`.replace(/\s+/g, ' ').trim();
}

async function main() {
  const { dryRun, keepUpdatedAt, noteId } = parseArgs();
  requireDbTarget({ scriptName: SCRIPT_NAME, writes: !dryRun });

  const where = noteId ? and(eq(Notes.id, noteId), CORRUPT_PREDICATE) : CORRUPT_PREDICATE;
  const rows = await db
    .select({
      id: Notes.id,
      userId: Notes.userId,
      title: Notes.title,
      content: Notes.content,
      updatedAt: Notes.updatedAt,
    })
    .from(Notes)
    .where(where);

  const users = new Set(rows.map((r) => r.userId));
  console.log(
    `[${SCRIPT_NAME}] ${rows.length} corrupted note(s) across ${users.size} user(s)` +
      `${dryRun ? ' (dry-run — nothing will be written)' : ''}`,
  );

  let repaired = 0;
  let unchanged = 0;

  for (const row of rows) {
    const fixed = repairCorruptedScriptureQuoteAttributes(row.content);
    const leak = visibleLeakSample(row.content);

    if (fixed === row.content) {
      /*
       * Matched the scan predicate but the shared repair left it alone — a shape the helper
       * doesn't recognise. Report it rather than passing over it silently; a note this script
       * claims to have swept but didn't is worse than one it names.
       */
      unchanged += 1;
      console.warn(`  ! ${row.id} ${JSON.stringify(row.title)} — matched but not repairable, left as is`);
      continue;
    }

    repaired += 1;
    console.log(`  ${dryRun ? '·' : '✓'} ${row.id} ${JSON.stringify(row.title)} (user ${row.userId})`);
    if (leak) console.log(`      reader saw: ${leak}`);

    if (dryRun) continue;

    /*
     * `updatedAt` is both the notes list's sort key and the sync watermark, so bumping it is a
     * real trade: the repair reaches every device (and a stale cached copy can't push the
     * corrupt HTML back over it), at the cost of these notes surfacing once as recently
     * updated. Reaching devices wins by default — a repair that doesn't stick isn't one.
     * `--keep-updated-at` takes the other side.
     */
    const patch = keepUpdatedAt ? { content: fixed } : { content: fixed, updatedAt: now() };
    await db.update(Notes).set(patch).where(eq(Notes.id, row.id));
  }

  console.log(
    `[${SCRIPT_NAME}] done — ${repaired} ${dryRun ? 'repairable' : 'repaired'}` +
      `${unchanged ? `, ${unchanged} left as is` : ''}`,
  );
  process.exit(0);
}

main().catch((err) => {
  console.error(`[${SCRIPT_NAME}] failed:`, err);
  process.exit(1);
});
