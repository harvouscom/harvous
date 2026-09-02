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

import { db, UserNodeStates, ReviewItems, eq, and, gt, desc, inArray } from '../db';
import {
  REVIEW_ENGINE_DAILY_CAP,
  REVIEW_ENGINE_WINDOW_HOURS,
} from '@/utils/review-item-kinds';
import {
  ENGINE_NODE_KINDS,
  engineDailyRoom,
  selectReviewBatch,
  type ReviewCandidateNode,
} from '@/utils/review-opportunity-scoring';
import {
  verseKeyPartsFromNodeKey,
  verseReferenceLabel,
  type NodeKind,
} from '@/utils/study-bible-nodes';
import { createReviewItem, type ReviewItemRow } from './review-service';
import { isUserNodeStatesTableMissing, isReviewItemsTableMissing } from './pg-undefined-relation';

/** How many nodes to consider. Well past what three picks needs, cheap on the index. */
const CANDIDATE_LIMIT = 400;

/** Node kind → the shape of question Review asks about it. */
const REVIEW_KIND_FOR_NODE: Record<string, 'verse' | 'note' | 'connection' | 'thread'> = {
  verse: 'verse',
  note: 'note',
  connection: 'connection',
  thread: 'thread',
};

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
 * Top up the reader's queue from their own study, and return whatever it added.
 *
 * Never throws: it runs at the top of a read the reader is waiting on, and an empty section is
 * a better outcome than a failed one.
 */
export async function refillReviewQueue(
  userId: string,
  now: Date = new Date(),
): Promise<ReviewItemRow[]> {
  try {
    const windowStart = new Date(now.getTime() - REVIEW_ENGINE_WINDOW_HOURS * 60 * 60 * 1000);

    const recent = await db
      .select({ id: ReviewItems.id })
      .from(ReviewItems)
      .where(
        and(
          eq(ReviewItems.userId, userId),
          eq(ReviewItems.origin, 'engine'),
          gt(ReviewItems.createdAt, windowStart),
        ),
      )
      .limit(REVIEW_ENGINE_DAILY_CAP + 1);

    const room = engineDailyRoom(recent.length);
    if (room <= 0) return [];

    const [nodes, existing] = await Promise.all([
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
      // Any status: a paused or archived item means the reader has already had this question
      // and put it down, and re-adding it would be the app arguing with them.
      db
        .select({ sourceKey: ReviewItems.sourceKey })
        .from(ReviewItems)
        .where(eq(ReviewItems.userId, userId)),
    ]);

    const candidates: ReviewCandidateNode[] = nodes.map((row) => ({
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

    const picks = selectReviewBatch(candidates, {
      now,
      existingSourceKeys: new Set(existing.map((row) => row.sourceKey)),
      limit: room,
    });

    const created: ReviewItemRow[] = [];
    for (const pick of picks) {
      const kind = REVIEW_KIND_FOR_NODE[pick.nodeKind];
      if (!kind) continue;

      const verseParts = kind === 'verse' ? verseKeyPartsFromNodeKey(pick.nodeKey) : null;
      if (kind === 'verse' && !verseParts) continue;

      const result = await createReviewItem(
        userId,
        {
          kind,
          noteId: pick.noteId,
          secondaryNoteId: kind === 'connection' ? pick.secondaryNoteId : null,
          scriptureReference: verseParts ? verseReferenceLabel(verseParts) : null,
          translation: verseParts ? parseTranslation(pick.meta ?? null) : null,
          origin: 'engine',
          // Copied, not read live, so a row's stated reason never changes mid-sitting.
          sourceLabel: pick.lastSourceLabel,
          sourceAt: pick.lastSourceAt,
        },
        now,
      );
      if ('item' in result && result.created) created.push(result.item);
    }

    return created;
  } catch (error) {
    if (isUserNodeStatesTableMissing(error) || isReviewItemsTableMissing(error)) return [];
    console.error('[review-opportunities] refill failed:', error);
    return [];
  }
}
