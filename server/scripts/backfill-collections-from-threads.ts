/**
 * One-time backfill: copy web thread titles into `Notes.primaryCollection` and
 * `Notes.secondaryCollections` for prototype / DB parity with native collection labels.
 *
 * Rules:
 * - Primary label = `Threads.title` for `Notes.threadId` (canonical primary thread).
 * - Skip notes where `threadId` is `thread_unorganized` or `thread_onboarding_*`.
 * - Secondaries = other `NoteThreads` memberships (non-system threads), excluding the
 *   primary thread id, ordered by `NoteThreads.createdAt` ascending.
 * - Skip notes with `collectionUserOverride` or `collectionPinned`, or existing `primaryCollection`.
 *
 * Usage (requires `SUPABASE_DATABASE_URL` or `SUPABASE_DIRECT_URL` in env — same as API):
 *   npx tsx server/scripts/backfill-collections-from-threads.ts --dry-run
 *   npx tsx server/scripts/backfill-collections-from-threads.ts
 *   npx tsx server/scripts/backfill-collections-from-threads.ts --userId=user_xxx
 *   npx tsx server/scripts/backfill-collections-from-threads.ts --batch-size=300 --limit=1000
 *
 * Staging vs production: point `.env` at the target Supabase DB before running; there is no separate flag.
 */

import 'dotenv/config';
import { db } from '../db/client';
import { Notes, Threads, NoteThreads } from '../db/schema';
import { and, asc, eq, gt, inArray, isNull, ne, sql, type SQL } from 'drizzle-orm';
import { nowISO } from '../db/dates';
import {
  normalizeSecondaryLabels,
  serializeNoteSecondaryCollections,
} from '../utils/note-secondary-collections';

function isSystemThreadId(threadId: string): boolean {
  return threadId === 'thread_unorganized' || threadId.startsWith('thread_onboarding_');
}

function parseArgs() {
  const dryRun = process.argv.includes('--dry-run');
  let userId: string | undefined;
  let batchSize = 400;
  let maxNotes: number | undefined;
  for (const a of process.argv) {
    if (a.startsWith('--userId=')) userId = a.slice('--userId='.length).trim() || undefined;
    if (a.startsWith('--batch-size=')) {
      const n = parseInt(a.slice('--batch-size='.length), 10);
      if (!Number.isNaN(n) && n > 0) batchSize = n;
    }
    if (a.startsWith('--limit=')) {
      const n = parseInt(a.slice('--limit='.length), 10);
      if (!Number.isNaN(n) && n > 0) maxNotes = n;
    }
  }
  return { dryRun, userId, batchSize, maxNotes };
}

interface NoteRow {
  id: string;
  threadId: string;
  userId: string;
}

/** Exclude per-user onboarding threads (`thread_onboarding_${userId}`). */
const NOT_ONBOARDING_THREAD = sql`NOT starts_with(${Notes.threadId}::text, 'thread_onboarding_')`;

async function fetchCandidateBatch(lastId: string | null, take: number, userId?: string): Promise<NoteRow[]> {
  const conditions: SQL[] = [
    isNull(Notes.primaryCollection),
    eq(Notes.collectionUserOverride, false),
    eq(Notes.collectionPinned, false),
    ne(Notes.threadId, 'thread_unorganized'),
    NOT_ONBOARDING_THREAD,
  ];
  if (userId) conditions.push(eq(Notes.userId, userId));
  if (lastId) conditions.push(gt(Notes.id, lastId));
  const base = and(...conditions);

  return db
    .select({
      id: Notes.id,
      threadId: Notes.threadId,
      userId: Notes.userId,
    })
    .from(Notes)
    .where(base)
    .orderBy(asc(Notes.id))
    .limit(take);
}

async function loadThreadTitles(threadIds: string[]): Promise<Map<string, string>> {
  if (threadIds.length === 0) return new Map();
  const rows = await db
    .select({ id: Threads.id, title: Threads.title })
    .from(Threads)
    .where(inArray(Threads.id, threadIds));
  return new Map(rows.map((r) => [r.id, r.title]));
}

type SecondaryRow = {
  noteId: string;
  threadId: string;
  title: string;
};

async function loadSecondaries(noteIds: string[]): Promise<Map<string, SecondaryRow[]>> {
  const out = new Map<string, SecondaryRow[]>();
  if (noteIds.length === 0) return out;

  const rows = await db
    .select({
      noteId: NoteThreads.noteId,
      threadId: NoteThreads.threadId,
      title: Threads.title,
      createdAt: NoteThreads.createdAt,
    })
    .from(NoteThreads)
    .innerJoin(Threads, eq(NoteThreads.threadId, Threads.id))
    .where(inArray(NoteThreads.noteId, noteIds))
    .orderBy(asc(NoteThreads.noteId), asc(NoteThreads.createdAt));

  for (const r of rows) {
    const list = out.get(r.noteId) ?? [];
    list.push({ noteId: r.noteId, threadId: r.threadId, title: r.title });
    out.set(r.noteId, list);
  }
  return out;
}

function computeSecondariesForNote(
  noteThreadId: string,
  rows: SecondaryRow[] | undefined,
  primaryLabel: string,
): string | null {
  if (!rows?.length) return serializeNoteSecondaryCollections([]);

  const titles: string[] = [];
  for (const r of rows) {
    if (r.threadId === noteThreadId) continue;
    if (isSystemThreadId(r.threadId)) continue;
    const t = (r.title || '').trim();
    if (!t) continue;
    titles.push(t);
  }
  const normalized = normalizeSecondaryLabels(titles, primaryLabel);
  return serializeNoteSecondaryCollections(normalized);
}

async function main() {
  const { dryRun, userId, batchSize, maxNotes } = parseArgs();

  console.log(
    `${dryRun ? '[DRY RUN] ' : ''}Backfill collections from threads (batchSize=${batchSize}${userId ? `, userId=${userId}` : ''}${maxNotes != null ? `, limit=${maxNotes}` : ''})`,
  );

  let lastId: string | null = null;
  let updated = 0;
  let skippedNoPrimaryTitle = 0;
  let skippedPrimaryThreadMissing = 0;
  const samples: string[] = [];
  const maxSamples = 20;
  let totalExamined = 0;

  while (true) {
    const batch = await fetchCandidateBatch(lastId, batchSize, userId);
    if (batch.length === 0) break;

    const noteIds = batch.map((n) => n.id);
    const primaryThreadIds = [...new Set(batch.map((n) => n.threadId))];
    const titleByThreadId = await loadThreadTitles(primaryThreadIds);
    const secondariesByNote = await loadSecondaries(noteIds);

    for (const note of batch) {
      if (maxNotes != null && totalExamined >= maxNotes) {
        lastId = '__stop__';
        break;
      }
      totalExamined++;

      if (isSystemThreadId(note.threadId)) {
        skippedNoPrimaryTitle++;
        continue;
      }

      const rawTitle = titleByThreadId.get(note.threadId);
      if (rawTitle == null) {
        skippedPrimaryThreadMissing++;
        continue;
      }
      const primaryLabel = rawTitle.trim();
      if (!primaryLabel.length) {
        skippedNoPrimaryTitle++;
        continue;
      }

      const secondarySerialized = computeSecondariesForNote(note.threadId, secondariesByNote.get(note.id), primaryLabel);

      if (dryRun) {
        if (samples.length < maxSamples) {
          const secParsed = secondarySerialized ? JSON.parse(secondarySerialized) : [];
          samples.push(
            `  ${note.id}  primary="${primaryLabel}"  secondaries=${JSON.stringify(secParsed)}`,
          );
        }
      } else {
        await db
          .update(Notes)
          .set({
            primaryCollection: primaryLabel,
            secondaryCollections: secondarySerialized,
            updatedAt: nowISO(),
          })
          .where(eq(Notes.id, note.id));
      }
      updated++;
    }

    if (lastId === '__stop__') break;

    lastId = batch[batch.length - 1]!.id;

    if (batch.length < batchSize) break;
    if (maxNotes != null && totalExamined >= maxNotes) break;
  }

  console.log(`\nExamined (candidates in stream): ${totalExamined}`);
  console.log(`${dryRun ? '[DRY RUN] Would update' : 'Updated'} notes: ${updated}`);
  console.log(`Skipped (empty/missing primary thread title): ${skippedNoPrimaryTitle}`);
  console.log(`Skipped (Threads row missing for Notes.threadId): ${skippedPrimaryThreadMissing}`);

  if (dryRun && samples.length > 0) {
    console.log(`\nSample mappings (up to ${maxSamples}):\n${samples.join('\n')}`);
  }

  console.log('\nDone.');
  process.exit(0);
}

main().catch((err) => {
  console.error('backfill-collections-from-threads failed:', err);
  process.exit(1);
});
