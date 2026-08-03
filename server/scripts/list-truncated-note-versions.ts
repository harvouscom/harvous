/**
 * Find note versions whose body suddenly collapsed — the signature of a
 * list-preview body (server/utils/dashboard-data.ts NOTE_LIST_SELECT truncates
 * content to NOTE_LIST_CONTENT_MAX_CHARS) being written back over a full note.
 *
 * Reads NoteVersions only; makes no writes. Restore a good version with
 * POST /api/notes/:noteId/versions/:versionId/restore.
 *
 * Reading the output:
 *   source=save         → an HTTP write (web editor autosave or a metadata-only op)
 *   source=sync-update  → native / offline sync push
 *   isExactPrefix + len exactly at the cap → a raw list row was PUT verbatim
 *   not an exact prefix → the truncated body went through TipTap before saving
 *
 * Usage (requires SUPABASE_DATABASE_URL or SUPABASE_DIRECT_URL in env):
 *   npx tsx server/scripts/list-truncated-note-versions.ts
 *   npx tsx server/scripts/list-truncated-note-versions.ts --userId=user_xxx
 *   npx tsx server/scripts/list-truncated-note-versions.ts --days=90 --minLength=1000
 */

import 'dotenv/config';
import { db } from '../db/client';
import { NoteVersions, Notes } from '../db/schema';
import { and, asc, eq, gt, sql } from 'drizzle-orm';
import { NOTE_LIST_CONTENT_MAX_CHARS } from '../utils/dashboard-data';
import { endsWithTagBoundary } from '@/utils/note-truncated-write-guard';

function parseArgs() {
  let userId: string | undefined;
  let days = 30;
  let minLength = 1000;
  for (const a of process.argv) {
    if (a.startsWith('--userId=')) userId = a.slice('--userId='.length).trim() || undefined;
    if (a.startsWith('--days=')) days = Math.max(1, parseInt(a.slice('--days='.length), 10) || 30);
    if (a.startsWith('--minLength=')) {
      minLength = Math.max(1, parseInt(a.slice('--minLength='.length), 10) || 1000);
    }
  }
  return { userId, days, minLength };
}

async function main() {
  const { userId, days, minLength } = parseArgs();
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const conditions = [gt(NoteVersions.createdAt, since)];
  if (userId) conditions.push(eq(NoteVersions.authorId, userId));

  const rows = await db
    .select({
      id: NoteVersions.id,
      noteId: NoteVersions.noteId,
      version: NoteVersions.version,
      content: NoteVersions.content,
      contentEncrypted: NoteVersions.contentEncrypted,
      source: NoteVersions.source,
      createdAt: NoteVersions.createdAt,
    })
    .from(NoteVersions)
    .where(and(...conditions))
    .orderBy(asc(NoteVersions.noteId), asc(NoteVersions.version));

  // Walk each note's version chain and flag any step that lost >50% of the body.
  const findings: Array<{
    noteId: string;
    version: number;
    versionId: string;
    source: string;
    createdAt: Date | string;
    prevLen: number;
    len: number;
    isExactPrefix: boolean;
    atCap: boolean;
    endsWithTag: boolean;
  }> = [];

  let prev: (typeof rows)[number] | null = null;
  for (const row of rows) {
    if (prev && prev.noteId === row.noteId && !row.contentEncrypted && !prev.contentEncrypted) {
      const prevLen = prev.content.length;
      const len = row.content.length;
      // Landing exactly on the list cap is the smoking gun and must be reported
      // regardless of ratio — a 3000→2000 cut is only a 33% loss and would slip
      // past a percentage threshold entirely.
      const atCap = len === NOTE_LIST_CONTENT_MAX_CHARS && prevLen > NOTE_LIST_CONTENT_MAX_CHARS;
      if (atCap || (prevLen >= minLength && len < prevLen * 0.5)) {
        findings.push({
          noteId: row.noteId,
          version: row.version,
          versionId: row.id,
          source: row.source ?? 'save',
          createdAt: row.createdAt,
          prevLen,
          len,
          isExactPrefix: prev.content.startsWith(row.content),
          atCap,
          endsWithTag: endsWithTagBoundary(row.content),
        });
      }
    }
    prev = row;
  }

  console.log(
    `Body collapses (>50% loss, prev >= ${minLength} chars) in the last ${days} day(s)` +
      `${userId ? ` for ${userId}` : ''}: ${findings.length} finding(s)\n`,
  );

  if (findings.length === 0) {
    console.log('Nothing found. Try --days=90 or a lower --minLength.');
    return;
  }

  console.log('noteId\tversion\tsource\tprevLen\tlen\tprefix\tatCap\tendsTag\tcreatedAt\tversionId');
  for (const f of findings) {
    console.log(
      [
        f.noteId,
        f.version,
        f.source,
        f.prevLen,
        f.len,
        f.isExactPrefix ? 'YES' : 'no',
        f.atCap ? 'YES' : 'no',
        f.endsWithTag ? 'yes' : 'NO',
        f.createdAt instanceof Date ? f.createdAt.toISOString() : f.createdAt,
        f.versionId,
      ].join('\t'),
    );
  }

  console.log(
    '\nprefix=YES + atCap=YES  → a raw list-preview row was written back verbatim.' +
      '\nprefix=no               → the truncated body was re-serialized by the editor first.' +
      '\nTo recover: GET /api/notes/<noteId>/versions/<versionId of the version BEFORE the drop>' +
      '\n            then POST /api/notes/<noteId>/versions/<versionId>/restore',
  );
}

/**
 * Notes whose *current* body sits exactly on the cap. Independent of version history,
 * so it catches damage whose earlier versions have already been pruned.
 */
async function reportLiveNotesAtCap(userId: string | undefined) {
  const conditions = [
    eq(sql`length(${Notes.content})`, NOTE_LIST_CONTENT_MAX_CHARS),
    eq(Notes.contentEncrypted, false),
  ];
  if (userId) conditions.push(eq(Notes.userId, userId));

  const rows = await db
    .select({
      id: Notes.id,
      userId: Notes.userId,
      title: Notes.title,
      content: Notes.content,
      updatedAt: Notes.updatedAt,
    })
    .from(Notes)
    .where(and(...conditions))
    .limit(200);

  console.log(
    `\n\nNotes whose current body is exactly ${NOTE_LIST_CONTENT_MAX_CHARS} chars` +
      `${userId ? ` for ${userId}` : ''}: ${rows.length}`,
  );
  if (rows.length === 0) {
    console.log('None — no note is currently sitting on the truncation cap.');
    return;
  }
  console.log('noteId\tendsTag\tupdatedAt\ttitle');
  for (const r of rows) {
    console.log(
      [
        r.id,
        endsWithTagBoundary(r.content) ? 'yes' : 'NO',
        r.updatedAt instanceof Date ? r.updatedAt.toISOString() : r.updatedAt,
        (r.title ?? '').slice(0, 40),
      ].join('\t'),
    );
  }
  console.log('\nendsTag=NO is near-conclusive: only a left() cut ends mid-tag.');
}

main()
  .then(() => reportLiveNotesAtCap(parseArgs().userId))
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
