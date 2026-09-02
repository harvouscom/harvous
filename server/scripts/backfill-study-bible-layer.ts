/**
 * Backfill: build a reader's Study Bible layer from the activity they already have.
 *
 * Every path that matters now writes to UserNodeStates as it happens (see
 * server/utils/study-bible-layer.ts), but a reader with two years of notes, highlights and
 * reading history would start from an empty layer and get nothing worth reviewing until they
 * did it all again. This replays what is already recorded.
 *
 * **Not idempotent without `--reset`.** The counters accumulate, which is the whole point of
 * the table; running this twice over the same events counts them twice. `--reset` deletes the
 * user's rows first, which makes a re-run safe and is the flag to reach for.
 *
 *   npx tsx server/scripts/backfill-study-bible-layer.ts --userId=user_x --dry-run --production
 *   npx tsx server/scripts/backfill-study-bible-layer.ts --userId=user_x --reset --production
 *   npm run study-bible:backfill -- --limit=25 --production
 *
 * Prereq: `npm run review:schema:apply` so the table exists.
 */

import 'dotenv/config';
import {
  db,
  Notes,
  NoteVersions,
  NoteVisitEvents,
  ReadingEvents,
  RecallEvents,
  NoteConnections,
  NoteScriptureReferences,
  ScriptureMetadata,
  StudyThreadEntries,
  ReviewItems,
  UserNodeStates,
  eq,
  and,
  or,
  ne,
  gt,
  inArray,
  isNotNull,
  desc,
} from '../db';
import { requireDbTarget } from '../utils/require-db-target';
import {
  chapterTouch,
  connectionTouches,
  noteTouch,
  scriptureTouches,
  touchNodes,
  type NodeTouch,
} from '../utils/study-bible-layer';
import { nodeKey } from '@/utils/study-bible-nodes';
import type { RecallState } from '@/utils/review-item-kinds';
import {
  citedInNoteSource,
  highlightSource,
  noteHighlightSource,
  readChapterSource,
  LINKED_NOTES_SOURCE,
  NOTE_OPENED_SOURCE,
  NOTE_WRITTEN_SOURCE,
  REVIEWED_SOURCE,
  THREAD_NAMED_SOURCE,
} from '@/utils/study-bible-source-copy';
import { countableUserNotesWhere } from '../utils/purge-onboarding-content';
import { readingDwellCountsAsRead, type ReadingDwellBucket } from '@/utils/reading-event-kinds';
import { noteVisitIsSubstantive, type NoteVisitDwellBucket } from '@/utils/note-visit-kinds';
import {
  clusterMemberSetsFromEdges,
  pickRepNoteIdFromGraph,
} from '@/utils/study-thread-cluster-count';

const TOUCH_BATCH = 500;
/** How far back to replay. Older than this and the recency term has decayed to nothing anyway. */
const LOOKBACK_DAYS = 365 * 2;

type Args = {
  dryRun: boolean;
  reset: boolean;
  userId?: string;
  limit?: number;
};

function parseArgs(argv: readonly string[]): Args {
  const args: Args = {
    dryRun: argv.includes('--dry-run'),
    reset: argv.includes('--reset'),
  };
  for (const a of argv) {
    if (a.startsWith('--userId=')) args.userId = a.slice('--userId='.length).trim() || undefined;
    if (a.startsWith('--limit=')) {
      const n = Number.parseInt(a.slice('--limit='.length), 10);
      if (Number.isFinite(n) && n > 0) args.limit = n;
    }
  }
  return args;
}

async function targetUserIds(userId: string | undefined): Promise<string[]> {
  if (userId) return [userId];
  const rows = await db
    .selectDistinct({ userId: Notes.userId })
    .from(Notes)
    .where(ne(Notes.noteType, 'scripture'));
  return rows.map((r) => r.userId).filter(Boolean);
}

/** Collects touches per source so the run can report where a reader's layer came from. */
class TouchCollector {
  private readonly bySource = new Map<string, NodeTouch[]>();

  add(source: string, touches: readonly NodeTouch[]): void {
    if (!touches.length) return;
    const list = this.bySource.get(source) ?? [];
    list.push(...touches);
    this.bySource.set(source, list);
  }

  get sources(): [string, NodeTouch[]][] {
    return [...this.bySource.entries()];
  }

  get all(): NodeTouch[] {
    return this.sources.flatMap(([, touches]) => touches);
  }
}

async function collectForUser(userId: string, since: Date): Promise<TouchCollector> {
  const collector = new TouchCollector();

  // ── Notes: written, and every later checkpoint as an expansion ──────────────
  const notes = await db
    .select({ id: Notes.id, title: Notes.title, createdAt: Notes.createdAt })
    .from(Notes)
    .where(and(eq(Notes.userId, userId), ne(Notes.noteType, 'scripture'), countableUserNotesWhere()));
  const titleById = new Map(notes.map((n) => [n.id, n.title]));

  collector.add(
    'notes',
    notes.map((note) =>
      noteTouch({
        noteId: note.id,
        title: note.title,
        signal: 'exposure',
        at: note.createdAt ?? since,
        sourceLabel: NOTE_WRITTEN_SOURCE,
      }),
    ),
  );

  const noteIds = notes.map((n) => n.id);
  if (noteIds.length) {
    for (let i = 0; i < noteIds.length; i += 200) {
      const chunk = noteIds.slice(i, i + 200);
      const versions = await db
        .select({ noteId: NoteVersions.noteId, createdAt: NoteVersions.createdAt })
        .from(NoteVersions)
        .where(
          and(
            inArray(NoteVersions.noteId, chunk),
            eq(NoteVersions.authorId, userId),
            eq(NoteVersions.source, 'save'),
            gt(NoteVersions.version, 1),
          ),
        );
      collector.add(
        'note saves',
        versions.map((v) =>
          noteTouch({
            noteId: v.noteId,
            title: titleById.get(v.noteId) ?? null,
            signal: 'expansion',
            at: v.createdAt,
            sourceLabel: null,
          }),
        ),
      );
    }
  }

  // ── Note visits (owner only; the events table records viewers too) ──────────
  const visits = await db
    .select({ noteId: NoteVisitEvents.noteId, dwellBucket: NoteVisitEvents.dwellBucket, createdAt: NoteVisitEvents.createdAt })
    .from(NoteVisitEvents)
    .innerJoin(Notes, eq(Notes.id, NoteVisitEvents.noteId))
    .where(and(eq(NoteVisitEvents.userId, userId), eq(Notes.userId, userId), gt(NoteVisitEvents.createdAt, since)));
  collector.add(
    'note visits',
    visits.map((visit) => {
      const substantive = noteVisitIsSubstantive(visit.dwellBucket as NoteVisitDwellBucket);
      return noteTouch({
        noteId: visit.noteId,
        title: titleById.get(visit.noteId) ?? null,
        signal: substantive ? 'revisit' : 'exposure',
        at: visit.createdAt,
        sourceLabel: substantive ? NOTE_OPENED_SOURCE : null,
      });
    }),
  );

  // ── Chapters read ──────────────────────────────────────────────────────────
  const reads = await db
    .select({
      book: ReadingEvents.book,
      chapter: ReadingEvents.chapter,
      translation: ReadingEvents.translation,
      dwellBucket: ReadingEvents.dwellBucket,
      createdAt: ReadingEvents.createdAt,
    })
    .from(ReadingEvents)
    .where(and(eq(ReadingEvents.userId, userId), gt(ReadingEvents.createdAt, since)));
  collector.add(
    'chapters read',
    reads.map((read) =>
      chapterTouch({
        chapter: { book: read.book, chapter: read.chapter },
        signal: readingDwellCountsAsRead(read.dwellBucket as ReadingDwellBucket) ? 'revisit' : 'exposure',
        at: read.createdAt,
        sourceLabel: readChapterSource(read.book, read.chapter),
        translation: read.translation,
      }),
    ),
  );

  // ── Passages cited in notes (pills) ─────────────────────────────────────────
  // The pill points at the canonical scripture child note, so this unions both joins: metadata
  // hung off a scripture note linked to the reader's note, and metadata on the note itself
  // (purge-legacy-scripture-notes copies it onto parents). Deduped by note and reference.
  const citedRows = [
    ...(await db
      .select({
        noteId: Notes.id,
        reference: ScriptureMetadata.reference,
        translation: ScriptureMetadata.translation,
        createdAt: ScriptureMetadata.createdAt,
      })
      .from(ScriptureMetadata)
      .innerJoin(
        NoteScriptureReferences,
        eq(NoteScriptureReferences.scriptureNoteId, ScriptureMetadata.noteId),
      )
      .innerJoin(Notes, eq(Notes.id, NoteScriptureReferences.noteId))
      .where(and(eq(Notes.userId, userId), ne(Notes.noteType, 'scripture')))),
    ...(await db
      .select({
        noteId: Notes.id,
        reference: ScriptureMetadata.reference,
        translation: ScriptureMetadata.translation,
        createdAt: ScriptureMetadata.createdAt,
      })
      .from(ScriptureMetadata)
      .innerJoin(Notes, eq(Notes.id, ScriptureMetadata.noteId))
      .where(and(eq(Notes.userId, userId), ne(Notes.noteType, 'scripture')))),
  ];

  const citedTouches: NodeTouch[] = [];
  const seenCitation = new Set<string>();
  for (const row of citedRows) {
    const key = `${row.noteId}|${row.reference.toLowerCase()}`;
    if (seenCitation.has(key)) continue;
    seenCitation.add(key);

    const at = row.createdAt ?? since;
    citedTouches.push(
      ...(await scriptureTouches({
        reference: row.reference,
        signal: 'exposure',
        at,
        sourceLabel: citedInNoteSource(titleById.get(row.noteId)),
        translation: row.translation,
      })),
    );
  }
  collector.add('cited passages', citedTouches);

  // ── Highlights and annotations ─────────────────────────────────────────────
  const entries = await db
    .select({
      id: StudyThreadEntries.id,
      parentNoteId: StudyThreadEntries.parentNoteId,
      entryKindRaw: StudyThreadEntries.entryKindRaw,
      linkedNoteId: StudyThreadEntries.linkedNoteId,
      scriptureReference: StudyThreadEntries.scriptureReference,
      translation: StudyThreadEntries.scripturePassageTranslation,
      notesBody: StudyThreadEntries.notesBody,
      miniNoteBody: StudyThreadEntries.miniNoteBody,
      createdAt: StudyThreadEntries.createdAt,
    })
    .from(StudyThreadEntries)
    .where(and(eq(StudyThreadEntries.userId, userId), eq(StudyThreadEntries.isArchived, false)));

  const highlightTouches: NodeTouch[] = [];
  for (const entry of entries) {
    const at = entry.createdAt ?? since;
    if (entry.scriptureReference) {
      const madeWhileReading = entry.parentNoteId == null;
      highlightTouches.push(
        ...(await scriptureTouches({
          reference: entry.scriptureReference,
          signal: madeWhileReading ? 'exposure' : 'expansion',
          at,
          sourceLabel: madeWhileReading
            ? highlightSource(entry.scriptureReference)
            : noteHighlightSource(entry.scriptureReference),
          translation: entry.translation,
        })),
      );
      // An annotated highlight is the reader writing more about the passage, not just marking it.
      const annotated = Boolean(entry.notesBody?.trim() || entry.miniNoteBody?.trim());
      if (annotated && entry.parentNoteId) {
        highlightTouches.push(
          noteTouch({
            noteId: entry.parentNoteId,
            title: titleById.get(entry.parentNoteId) ?? null,
            signal: 'expansion',
            at,
            sourceLabel: noteHighlightSource(entry.scriptureReference),
          }),
        );
      }
    }
  }
  collector.add('highlights', highlightTouches);

  // ── Links, and the Threads they form ───────────────────────────────────────
  const edges = await db
    .select({
      fromNoteId: NoteConnections.fromNoteId,
      toNoteId: NoteConnections.toNoteId,
      createdAt: NoteConnections.createdAt,
    })
    .from(NoteConnections)
    .where(eq(NoteConnections.userId, userId));

  collector.add(
    'links',
    edges.flatMap((edge) =>
      connectionTouches({
        fromNoteId: edge.fromNoteId,
        toNoteId: edge.toNoteId,
        at: edge.createdAt ?? since,
        sourceLabel: LINKED_NOTES_SOURCE,
        fromTitle: titleById.get(edge.fromNoteId) ?? null,
        toTitle: titleById.get(edge.toNoteId) ?? null,
      }),
    ),
  );

  // One connection signal per member note on the Thread's rep node, so a cluster of five
  // outranks a pair — and a synthesis on top when the reader named it themselves.
  const named = await db
    .select({ id: Notes.id, title: Notes.studyThreadTitle })
    .from(Notes)
    .where(
      and(
        eq(Notes.userId, userId),
        eq(Notes.studyThreadUserOverride, true),
        isNotNull(Notes.studyThreadTitle),
      ),
    );
  const namedById = new Map(named.map((n) => [n.id, n.title]));

  const threadTouchList: NodeTouch[] = [];
  for (const members of clusterMemberSetsFromEdges(edges)) {
    const seed = [...members][0];
    const repNoteId = pickRepNoteIdFromGraph(seed, edges);
    if (!repNoteId) continue;
    const label = namedById.get(repNoteId) ?? titleById.get(repNoteId) ?? null;
    const at = edges.find((e) => members.has(e.fromNoteId))?.createdAt ?? since;

    for (let i = 0; i < members.size; i++) {
      threadTouchList.push({
        key: nodeKey.thread(repNoteId),
        kind: 'thread',
        signal: 'connection',
        at,
        label,
        noteId: repNoteId,
        sourceLabel: LINKED_NOTES_SOURCE,
      });
    }
    if (namedById.has(repNoteId)) {
      threadTouchList.push({
        key: nodeKey.thread(repNoteId),
        kind: 'thread',
        signal: 'synthesis',
        at,
        label,
        noteId: repNoteId,
        sourceLabel: THREAD_NAMED_SOURCE,
      });
    }
  }
  collector.add('Threads', threadTouchList);

  // ── Coming back through a Home suggestion ──────────────────────────────────
  const recalls = await db
    .select({ noteId: RecallEvents.noteId, createdAt: RecallEvents.createdAt })
    .from(RecallEvents)
    .where(
      and(
        eq(RecallEvents.userId, userId),
        isNotNull(RecallEvents.noteId),
        or(eq(RecallEvents.action, 'open'), eq(RecallEvents.action, 'complete')),
        gt(RecallEvents.createdAt, since),
      ),
    );
  collector.add(
    'resurfaced',
    recalls.flatMap((recall) =>
      recall.noteId
        ? [
            noteTouch({
              noteId: recall.noteId,
              title: titleById.get(recall.noteId) ?? null,
              signal: 'revisit',
              at: recall.createdAt,
              sourceLabel: null,
            }),
          ]
        : [],
    ),
  );

  // ── Reviews already answered, and where they are scheduled ─────────────────
  // Applied last so the mirror columns reflect the item's current state rather than an
  // intermediate one; the upsert only moves them forward when a review touch carries them.
  const items = await db
    .select({
      kind: ReviewItems.kind,
      noteId: ReviewItems.noteId,
      secondaryNoteId: ReviewItems.secondaryNoteId,
      scriptureReference: ReviewItems.scriptureReference,
      translation: ReviewItems.translation,
      recallState: ReviewItems.recallState,
      reviewCount: ReviewItems.reviewCount,
      lastReviewedAt: ReviewItems.lastReviewedAt,
      dueAt: ReviewItems.dueAt,
    })
    .from(ReviewItems)
    .where(and(eq(ReviewItems.userId, userId), isNotNull(ReviewItems.lastReviewedAt)))
    .orderBy(desc(ReviewItems.lastReviewedAt));

  const reviewTouches: NodeTouch[] = [];
  for (const item of items) {
    const at = item.lastReviewedAt ?? since;
    const mirror = {
      lastReviewedAt: at,
      nextReviewAt: item.dueAt,
      recallState: item.recallState as RecallState,
    };
    // One touch per past answer, so a node reviewed six times reads as reviewed six times.
    const repeats = Math.max(1, Math.min(item.reviewCount, 20));
    // Built once and repeated: the scripture lookup hits the knowledge tables, and a verse
    // answered twenty times would otherwise run twenty identical queries.
    const scripture = item.scriptureReference
      ? await scriptureTouches({
          reference: item.scriptureReference,
          signal: 'review',
          at,
          sourceLabel: REVIEWED_SOURCE,
          translation: item.translation,
        })
      : [];

    for (let i = 0; i < repeats; i++) {
      if (scripture.length) {
        for (const touch of scripture) {
          reviewTouches.push(touch.kind === 'verse' ? { ...touch, reviewMirror: mirror } : touch);
        }
      } else if (item.kind === 'thread' && item.noteId) {
        reviewTouches.push({
          key: nodeKey.thread(item.noteId),
          kind: 'thread',
          signal: 'review',
          at,
          noteId: item.noteId,
          sourceLabel: REVIEWED_SOURCE,
          reviewMirror: mirror,
        });
      } else if (item.kind === 'connection' && item.noteId && item.secondaryNoteId) {
        const [a, b] = [item.noteId, item.secondaryNoteId].sort();
        reviewTouches.push({
          key: nodeKey.connection(item.noteId, item.secondaryNoteId),
          kind: 'connection',
          signal: 'review',
          at,
          noteId: a,
          secondaryNoteId: b,
          sourceLabel: REVIEWED_SOURCE,
          reviewMirror: mirror,
        });
      } else if (item.noteId) {
        reviewTouches.push({
          ...noteTouch({
            noteId: item.noteId,
            title: titleById.get(item.noteId) ?? null,
            signal: 'review',
            at,
            sourceLabel: REVIEWED_SOURCE,
          }),
          reviewMirror: mirror,
        });
      }
    }
  }
  collector.add('reviews', reviewTouches);

  return collector;
}

function summarize(items: readonly { kind: string }[]): string {
  const byKind = new Map<string, number>();
  for (const item of items) byKind.set(item.kind, (byKind.get(item.kind) ?? 0) + 1);
  return [...byKind.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([kind, count]) => `${kind} ${count}`)
    .join(', ');
}

export async function runBackfillStudyBibleLayer(argv: readonly string[]): Promise<void> {
  const args = parseArgs(argv);
  requireDbTarget({ scriptName: 'backfill-study-bible-layer', writes: !args.dryRun });

  const users = await targetUserIds(args.userId);
  const targets = args.limit ? users.slice(0, args.limit) : users;
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  console.log(
    `[study-bible:backfill] ${targets.length} user(s)${args.dryRun ? ' (dry run)' : ''}${args.reset ? ' (reset first)' : ''}`,
  );
  if (!args.dryRun && !args.reset) {
    console.log('[study-bible:backfill] counters accumulate — re-running without --reset double counts');
  }

  for (const userId of targets) {
    const collector = await collectForUser(userId, since);
    const touches = collector.all;

    console.log(`\n[study-bible:backfill] ${userId}: ${touches.length} touch(es)`);
    for (const [source, list] of collector.sources) {
      console.log(`  ${source}: ${list.length} (${summarize(list)})`);
    }

    if (args.dryRun) {
      const byKey = new Map<string, number>();
      for (const touch of touches) byKey.set(touch.key, (byKey.get(touch.key) ?? 0) + 1);
      const top = [...byKey.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
      console.log('  top nodes:');
      for (const [key, count] of top) console.log(`    ${count.toString().padStart(4)}  ${key}`);
      continue;
    }

    if (args.reset) {
      await db.delete(UserNodeStates).where(eq(UserNodeStates.userId, userId));
    }

    for (let i = 0; i < touches.length; i += TOUCH_BATCH) {
      await touchNodes(userId, touches.slice(i, i + TOUCH_BATCH));
    }

    const written = await db
      .select({ nodeKind: UserNodeStates.nodeKind })
      .from(UserNodeStates)
      .where(eq(UserNodeStates.userId, userId));
    console.log(
      `  written: ${written.length} node(s) (${summarize(written.map((row) => ({ kind: row.nodeKind })))})`,
    );
  }
}

if (process.argv[1]?.includes('backfill-study-bible-layer')) {
  runBackfillStudyBibleLayer(process.argv.slice(2)).catch((error) => {
    console.error('[study-bible:backfill] failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
