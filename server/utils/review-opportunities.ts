/**
 * The Review engine: what the reader's Study Bible layer thinks is worth returning to.
 *
 * This replaces the cold-start seed, which only ever created `note` items and therefore asked
 * the same question three times. The layer knows about verses the reader highlighted, links
 * they drew and Threads that have grown, so the queue can be mixed and can say where each row
 * came from.
 *
 * Deliberately lazy rather than scheduled. There is no cron and no timezone: the queue refills
 * when the reader looks at it, capped at `REVIEW_ENGINE_DAILY_CAP` per rolling 24 hours. A cron
 * would need a per-user local time nobody has, and would fill the queue of someone who has not
 * opened the app in a month — which is the "27 due" failure the whole feature is designed
 * against.
 *
 * Judgement lives in `src/utils/review-opportunity-scoring.ts` and is pure. This file is the
 * query around it.
 */

import { db, UserNodeStates, ReviewItems, NoteTags, StudyThreadEntries, sql, eq, and, gt, lte, desc, inArray, isNull,
  NoteFingerprints,
} from '../db';
import { isNoteFingerprintsTableMissing } from './pg-undefined-relation';
import {
  REVIEW_ENGINE_DAILY_CAP,
  REVIEW_ENGINE_WINDOW_HOURS,
  REVIEW_ENGINE_MAX_OUTSTANDING,
  REVIEW_INBOX_MAX_ROWS,
  type ReviewAskableKind,
} from '@/utils/review-item-kinds';
import {
  ENGINE_NODE_KINDS,
  ENGINE_PER_KIND_CAP,
  engineDailyRoom,
  describeEngineColdStart,
  engineHasEnoughReady,
  type EngineColdStart,
  selectReviewBatch,
  type ReviewCandidateNode,
} from '@/utils/review-opportunity-scoring';
import {
  chapterKeyPartsFromNodeKey,
  chapterReferenceLabel,
  nodeKey as studyNodeKey,
  verseKeyPartsFromNodeKey,
  verseNodesForReference,
  verseReferenceLabel,
  type NodeKind,
} from '@/utils/study-bible-nodes';
import { createReviewItem, noteHasReviewableMaterial, type ReviewItemRow } from './review-service';
import {
  isUserNodeStatesTableMissing,
  isReviewItemsTableMissing,
  isReviewSourceColumnMissing,
} from './pg-undefined-relation';

/** How many nodes to consider. Well past what three picks needs, cheap on the index. */
const CANDIDATE_LIMIT = 400;

/** Slack over the day's room, so a note dropped at the floor does not cost a slot. */
const OVERFETCH = 3;

/**
 * Node kind → the shape of question Review asks about it.
 *
 * Three entries, not five. `connection` and `thread` had open questions with nothing to mark,
 * and are Home suggestions now — see `REVIEW_ASKABLE_KINDS`.
 */
const REVIEW_KIND_FOR_NODE: Record<string, ReviewAskableKind> = {
  verse: 'verse',
  note: 'note',
  chapter: 'chapter',
};

/**
 * Chapters the reader has marked or cited a verse in.
 *
 * A chapter node cannot see this: a highlight lands on the verses beneath it, and the chapter
 * above only ever records the reading. One query over the reader's own marks, folded into the
 * chapter keys they imply, so "read this once and stopped on a line in it" counts as the two
 * acts the readiness gate asks for.
 */
async function loadHighlightedChapterKeys(userId: string): Promise<Set<string>> {
  const keys = new Set<string>();
  try {
    const rows = await db
      .select({ reference: StudyThreadEntries.scriptureReference })
      .from(StudyThreadEntries)
      .where(and(eq(StudyThreadEntries.userId, userId), isNull(StudyThreadEntries.parentNoteId)));
    for (const row of rows) {
      if (!row.reference) continue;
      for (const chapter of verseNodesForReference(row.reference).chapters) {
        keys.add(studyNodeKey.chapter(chapter));
      }
    }
  } catch {
    // A missing table or a bad reference costs the chapter one signal, never the whole refill.
  }
  return keys;
}

function parseTranslation(meta: string | null): string | null {
  if (!meta) return null;
  try {
    const parsed = JSON.parse(meta) as { translation?: unknown };
    return typeof parsed.translation === 'string' ? parsed.translation : null;
  } catch {
    return null;
  }
}

/**
 * Everything the engine scores, loaded once.
 *
 * Shared by `refillReviewQueue` and {@link engineColdStartFor} because they ask the same
 * question of the same rows and must not answer it differently. Keeping two copies of the
 * candidate mapping is how the thing that decides and the thing that explains the decision
 * drift apart, which is worth more care than the duplicate query it saves.
 */
async function loadEngineCandidates(userId: string): Promise<{
  candidates: ReviewCandidateNode[];
  meaningWeightByNoteId: Map<string, number>;
  signalContext: { highlightedChapterKeys: Awaited<ReturnType<typeof loadHighlightedChapterKeys>> };
}> {
  const [nodes, fingerprints, highlightedChapterKeys] = await Promise.all([
    db
      .select()
      .from(UserNodeStates)
      .where(
        and(
          eq(UserNodeStates.userId, userId),
          eq(UserNodeStates.status, 'active'),
          inArray(UserNodeStates.nodeKind, [...ENGINE_NODE_KINDS]),
        ),
      )
      .orderBy(desc(UserNodeStates.lastSeenAt))
      .limit(CANDIDATE_LIMIT),
    /*
     * How much study each note holds, for the readiness floor.
     *
     * The app's richest "does this matter" number was computed on every save, indexed, and
     * never read by Review — the engine had its own node-local guess instead. A missing table
     * yields an empty map, which keeps notes out rather than letting them all through.
     */
    db
      .select({ noteId: NoteFingerprints.noteId, meaningWeight: NoteFingerprints.meaningWeight })
      .from(NoteFingerprints)
      .where(eq(NoteFingerprints.userId, userId))
      .catch((error: unknown) => {
        if (isNoteFingerprintsTableMissing(error)) return [];
        throw error;
      }),
    loadHighlightedChapterKeys(userId),
  ]);
  const signalContext = { highlightedChapterKeys };

  const meaningWeightByNoteId = new Map<string, number>(
    fingerprints.map((row) => [row.noteId, row.meaningWeight ?? 0]),
  );

  const noteIds = [...new Set(nodes.map((row) => row.noteId).filter((id): id is string => Boolean(id)))];
  const manualTags = noteIds.length
    ? await db
        .select({ noteId: NoteTags.noteId, count: sql<number>`count(*)::int` })
        .from(NoteTags)
        .where(and(inArray(NoteTags.noteId, noteIds), eq(NoteTags.isAutoGenerated, false)))
        .groupBy(NoteTags.noteId)
    : [];
  const manualTagsByNoteId = new Map(manualTags.map((row) => [row.noteId, Number(row.count)]));

  const candidates: ReviewCandidateNode[] = nodes.map((row) => ({
    manualTagCount: row.noteId ? manualTagsByNoteId.get(row.noteId) ?? 0 : 0,
    nodeKind: row.nodeKind as NodeKind,
    nodeKey: row.nodeKey,
    label: row.label,
    noteId: row.noteId,
    secondaryNoteId: row.secondaryNoteId,
    exposureCount: row.exposureCount,
    revisitCount: row.revisitCount,
    explicitConnectionCount: row.explicitConnectionCount,
    expansionCount: row.expansionCount,
    synthesisCount: row.synthesisCount,
    reviewCount: row.reviewCount,
    firstStudiedAt: row.firstStudiedAt,
    lastSeenAt: row.lastSeenAt,
    nextReviewAt: row.nextReviewAt,
    lastSignal: row.lastSignal,
    lastSourceLabel: row.lastSourceLabel,
    lastSourceAt: row.lastSourceAt,
    status: row.status,
    meta: row.meta,
  }));

  return { candidates, meaningWeightByNoteId, signalContext };
}

export async function engineColdStartFor(
  userId: string,
  now: Date = new Date(),
): Promise<EngineColdStart | null> {
  try {
    const { candidates, meaningWeightByNoteId, signalContext } = await loadEngineCandidates(userId);
    if (engineHasEnoughReady(candidates, now, meaningWeightByNoteId, signalContext)) return null;
    return describeEngineColdStart(candidates, now, meaningWeightByNoteId, signalContext);
  } catch {
    return null;
  }
}

export async function refillReviewQueue(
  userId: string,
  now: Date = new Date(),
): Promise<ReviewItemRow[]> {
  try {
    const windowStart = new Date(now.getTime() - REVIEW_ENGINE_WINDOW_HOURS * 60 * 60 * 1000);

    const [recent, outstanding] = await Promise.all([
      db
        .select({ id: ReviewItems.id })
        .from(ReviewItems)
        .where(
          and(
            eq(ReviewItems.userId, userId),
            eq(ReviewItems.origin, 'engine'),
            gt(ReviewItems.createdAt, windowStart),
          ),
        )
        .limit(REVIEW_ENGINE_DAILY_CAP + 1),
      db
        .select({ id: ReviewItems.id })
        .from(ReviewItems)
        .where(
          and(
            eq(ReviewItems.userId, userId),
            eq(ReviewItems.origin, 'engine'),
            eq(ReviewItems.status, 'active'),
            lte(ReviewItems.dueAt, now),
          ),
        )
        .limit(REVIEW_ENGINE_MAX_OUTSTANDING),
    ]);

    const dailyRoom = engineDailyRoom(recent.length);
    const sessionShortfall = Math.max(0, REVIEW_INBOX_MAX_ROWS - outstanding.length);
    const room = Math.max(dailyRoom, sessionShortfall);
    if (room <= 0) return [];
    if (outstanding.length >= REVIEW_ENGINE_MAX_OUTSTANDING && sessionShortfall === 0) return [];

    const [engine, existing] = await Promise.all([
      loadEngineCandidates(userId),
      db
        .select({ sourceKey: ReviewItems.sourceKey })
        .from(ReviewItems)
        .where(eq(ReviewItems.userId, userId)),
    ]);
    const { candidates, meaningWeightByNoteId, signalContext } = engine;

    if (!engineHasEnoughReady(candidates, now, meaningWeightByNoteId, signalContext)) return [];

    const picks = selectReviewBatch(candidates, {
      now,
      meaningWeightByNoteId,
      signalContext,
      existingSourceKeys: new Set(existing.map((row) => row.sourceKey)),
      limit: room * OVERFETCH,
      perKindCap: ENGINE_PER_KIND_CAP * OVERFETCH,
    });

    const created: ReviewItemRow[] = [];
    for (const pick of picks) {
      if (created.length >= room) break;
      const kind = REVIEW_KIND_FOR_NODE[pick.nodeKind];
      if (!kind) continue;

      if (kind === 'note' && pick.noteId && !(await noteHasReviewableMaterial(userId, pick.noteId))) {
        continue;
      }

      const verseParts = kind === 'verse' ? verseKeyPartsFromNodeKey(pick.nodeKey) : null;
      if (kind === 'verse' && !verseParts) continue;

      const chapterParts = kind === 'chapter' ? chapterKeyPartsFromNodeKey(pick.nodeKey) : null;
      if (kind === 'chapter' && !chapterParts) continue;

      const reference = verseParts
        ? verseReferenceLabel(verseParts)
        : chapterParts
          ? chapterReferenceLabel(chapterParts)
          : null;

      const result = await createReviewItem(
        userId,
        {
          kind,
          noteId: pick.noteId,
          secondaryNoteId: null,
          scriptureReference: reference,
          translation: reference ? parseTranslation(pick.meta ?? null) : null,
          origin: 'engine',
          sourceLabel: pick.lastSourceLabel,
          sourceAt: pick.lastSourceAt,
        },
        now,
      );
      if ('item' in result && result.created) created.push(result.item);
    }

    return created;
  } catch (error) {
    if (
      isUserNodeStatesTableMissing(error) ||
      isReviewItemsTableMissing(error) ||
      isReviewSourceColumnMissing(error)
    ) {
      return [];
    }
    console.error('[review-opportunities] refill failed:', error);
    return [];
  }
}
