/**
 * Delete note-anchored study entries whose parent note no longer contains them. Dry-run by default.
 *
 * The companion to `repair-legacy-note-anchors`, for the rows that repair cannot help. That one
 * hands a legacy row the durable selector it never got, so a later note version can find it
 * again. This one is for rows where there is nothing left to find: the note's body holds neither
 * the entry's mark nor the words it claims to have highlighted, because the text was edited away
 * and the entry was never cleaned up after it.
 *
 * Such a row is not merely `detached`. Detached means "the quote is real but ambiguous or moved",
 * and a later edit can re-resolve it. These have outlived their text entirely, and their only
 * remaining effect is to surface in search and in highlight lists as a row that goes nowhere —
 * several of them identical, since what distinguished them was the position they no longer have.
 *
 * Orphanhood is *derived*, never assumed: a row survives if the note still contains its mark
 * (`data-study-thread-id="<id>"`) or the text of its quote. Pass `--ids=` to narrow the delete to
 * rows you have already looked at; without it, every derived orphan for the user is in scope.
 *
 * Every row is written to a JSON backup before it is deleted — a full row is a surer undo than
 * hand-built SQL, since these carry two dozen nullable columns and re-inserting one by hand is
 * how a restore goes subtly wrong.
 *
 *   npx tsx server/scripts/delete-orphaned-note-anchors.ts --user=<id>            # report
 *   npx tsx server/scripts/delete-orphaned-note-anchors.ts --user=<id> --ids=a,b  # report those
 *   npx tsx server/scripts/delete-orphaned-note-anchors.ts --user=<id> --apply --production
 */
import 'dotenv/config';
import { writeFileSync } from 'fs';
import { db, StudyThreadEntries, Notes, eq, and, isNotNull } from '../db';

const argv = process.argv.slice(2);
const arg = (name: string) => argv.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const apply = argv.includes('--apply');
const userId = arg('user');
const onlyIds = arg('ids')?.split(',').map((s) => s.trim()).filter(Boolean);

if (!userId) {
  console.error('--user=<clerk user id> is required');
  process.exit(1);
}

/* Said out loud once, before anything is read, rather than discovered per row. Deleting is the
   one thing here that a dry run cannot rehearse. */
if (apply && !argv.includes('--production')) {
  console.error('--apply also requires --production. Nothing was read or written.');
  process.exit(1);
}

const rows = await db
  .select({ entry: StudyThreadEntries, noteTitle: Notes.title, content: Notes.content })
  .from(StudyThreadEntries)
  .leftJoin(Notes, eq(Notes.id, StudyThreadEntries.parentNoteId))
  .where(
    and(eq(StudyThreadEntries.userId, userId), isNotNull(StudyThreadEntries.parentNoteId)),
  );

/** Whether the note still shows this entry — by its mark, or by the words it claims. */
function noteStillHolds(content: string, entry: typeof StudyThreadEntries.$inferSelect): boolean {
  if (content.includes(`data-study-thread-id="${entry.id}"`)) return true;
  /* Any one of the three is enough. They disagree on legacy rows — a quote recovered by the
     repair pass lands in anchorQuote while the original wording sits in sourceSnippet — and a
     row is only an orphan when the note holds none of them. */
  for (const claim of [entry.anchorQuote, entry.sourceSnippet, entry.anchorTextSnapshot]) {
    const text = claim?.trim();
    if (text && content.includes(text)) return true;
  }
  return false;
}

const orphans = rows.filter(({ entry, content }) => {
  if (onlyIds && !onlyIds.includes(entry.id)) return false;
  /* A missing note is a different fault with a different fix, so it is reported and left alone
     rather than swept up here. */
  if (content == null) {
    console.log(`skip   ${entry.id} (${entry.entryKindRaw}) — parent note is gone, not this script's call`);
    return false;
  }
  if (noteStillHolds(content, entry)) return false;
  return true;
});

for (const { entry, noteTitle } of orphans) {
  console.log(
    `orphan ${entry.id} (${entry.entryKindRaw}) in "${noteTitle ?? 'Untitled'}" — ` +
      `"${(entry.sourceSnippet ?? entry.focusTitle ?? '').trim()}"` +
      `${entry.scriptureReference ? ` · ${entry.scriptureReference}` : ''} · ${entry.anchorStatus}`,
  );
}

if (onlyIds) {
  const missing = onlyIds.filter((id) => !orphans.some(({ entry }) => entry.id === id));
  if (missing.length > 0) {
    console.log(`\n${missing.length} named row(s) are NOT orphans and were left alone: ${missing.join(', ')}`);
  }
}

if (orphans.length > 0 && apply) {
  const backup = `orphaned-note-anchors-${Date.now()}.json`;
  writeFileSync(backup, JSON.stringify(orphans.map(({ entry }) => entry), null, 2), 'utf-8');
  console.log(`\nBackup written: ${backup}`);
  for (const { entry } of orphans) {
    await db
      .delete(StudyThreadEntries)
      .where(and(eq(StudyThreadEntries.id, entry.id), eq(StudyThreadEntries.userId, userId)));
  }
}

console.log(
  `\n${rows.length} note-anchored row(s) examined, ${orphans.length} orphaned. ` +
    (apply ? 'Deleted.' : 'DRY RUN — re-run with --apply --production to delete.'),
);
process.exit(0);
