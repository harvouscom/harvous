/**
 * Give a legacy note-anchored highlight the durable selector it never got. Dry-run by default.
 *
 * Why this exists rather than the Shared Spaces backfill next door: that script is a whole
 * migration — spaces, note threads, versions — and it refuses to run without its own database
 * URL precisely so nobody points it at production for a small fix. This does one thing, to rows
 * you name, and prints the SQL to put them back.
 *
 * What it repairs, and what it cannot. A row with no `anchorQuote` is marked `orphaned` forever
 * by `buildDurableAnchorReresolutionPatch` — with nothing to search for, no later version can
 * resolve it. Rows written before durable anchors have `anchorLocation`/`anchorTextSnapshot`
 * instead, and a quote can be recovered from those against the note's current text. Rows that
 * never had a selection at all (an auto-derived reference or scripture link) have nothing to
 * recover and are skipped: "orphaned" is a misnomer for them, not damage.
 *
 *   npx tsx server/scripts/repair-legacy-note-anchors.ts --user=<id>            # report
 *   npx tsx server/scripts/repair-legacy-note-anchors.ts --user=<id> --apply --production
 */
import 'dotenv/config';
import { db, StudyThreadEntries, Notes, eq, and, isNotNull, isNull } from '../db';
import { buildLegacyAnchorMigrationPatch } from '../utils/durable-note-anchor';
import { requireDbTarget } from '../utils/require-db-target';

const argv = process.argv.slice(2);
const arg = (name: string) => argv.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const apply = argv.includes('--apply');
const userId = arg('user');

if (!userId) {
  console.error('--user=<clerk user id> is required');
  process.exit(1);
}

// Checked once, before anything is read or written: an --apply against production must be said
// out loud, not discovered per row.
if (apply) {
  requireDbTarget({ scriptName: 'repair-legacy-note-anchors', writes: true, argv, env: process.env });
}

const rows = await db
  .select({
    id: StudyThreadEntries.id,
    kind: StudyThreadEntries.entryKindRaw,
    status: StudyThreadEntries.anchorStatus,
    location: StudyThreadEntries.anchorLocation,
    length: StudyThreadEntries.anchorLength,
    snapshot: StudyThreadEntries.anchorTextSnapshot,
    snippet: StudyThreadEntries.sourceSnippet,
    noteId: StudyThreadEntries.parentNoteId,
    noteTitle: Notes.title,
    content: Notes.content,
  })
  .from(StudyThreadEntries)
  .leftJoin(Notes, eq(Notes.id, StudyThreadEntries.parentNoteId))
  .where(
    and(
      eq(StudyThreadEntries.userId, userId),
      isNotNull(StudyThreadEntries.parentNoteId),
      isNull(StudyThreadEntries.anchorQuote),
    ),
  );

const now = new Date();
let repairable = 0;

for (const row of rows) {
  if (!row.content) {
    console.log(`skip   ${row.id} (${row.kind}) — note is gone`);
    continue;
  }
  const patch = buildLegacyAnchorMigrationPatch({
    baselineVersionId: 'legacy-repair',
    baselineContent: row.content,
    anchorLocation: row.location,
    anchorLength: row.length,
    anchorTextSnapshot: row.snapshot,
    sourceSnippet: row.snippet,
    now,
  } as never) as { anchorQuote: string | null; anchorStatus: string };

  if (!patch.anchorQuote) {
    console.log(`skip   ${row.id} (${row.kind}) — never had a selection to recover`);
    continue;
  }

  repairable += 1;
  console.log(
    `repair ${row.id} (${row.kind}) in "${row.noteTitle ?? 'Untitled'}" → ${patch.anchorStatus}: "${patch.anchorQuote.trim()}"`,
  );
  console.log(
    `  to undo: UPDATE "StudyThreadEntries" SET "anchorQuote" = NULL, "anchorPrefixContext" = NULL, ` +
      `"anchorSuffixContext" = NULL, "anchorStatus" = '${row.status}', "resolvedAnchorStart" = NULL, ` +
      `"resolvedAnchorEnd" = NULL, "anchorResolvedAt" = NULL WHERE id = '${row.id}';`,
  );

  if (apply) {
    await db
      .update(StudyThreadEntries)
      .set({ ...(patch as Record<string, unknown>), updatedAt: now } as never)
      .where(and(eq(StudyThreadEntries.id, row.id), eq(StudyThreadEntries.userId, userId)));
  }
}

console.log(
  `\n${rows.length} anchorless row(s), ${repairable} repairable. ` +
    (apply ? 'Applied.' : 'DRY RUN — re-run with --apply --production to write.'),
);
process.exit(0);
