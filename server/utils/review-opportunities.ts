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

import { db, UserNodeStates, ReviewItems, NoteTags, StudyThreadEntries, sql, eq, and, gt, desc, inArray, isNull,
  NoteFingerprints,
} from '../db';
import { isNoteFingerprintsTableMissing } from './pg-undefined-relation';
import {
  REVIEW_ENGINE_DAILY_CAP,
  REVIEW_ENGINE_WINDOW_HOURS,
  type ReviewAskableKind,
} from '@/utils/review-item-kinds';
import {
  ENGINE_NODE_KINDS,
  ENGINE_PER_KIND_CAP,
  engineDailyRoom,
  engineHasEnoughReady,
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
 * Top up the reader's queue from their own study, and return whatever it added.
 *
 * **Waits before it offers anything.** A node has to be a few days old, carry two distinct
 * deliberate acts, and — for a note — hold enough study to clear `NOTE_MEANING_WEIGHT_FLOOR`;
 * and the account itself has to have `ENGINE_COLD_START_MIN_READY` such nodes before the engine
 * runs at all. Before this the only gate was a 24-hour quiet rule, so anything opened once and
 * abandoned was eligible — and because learning need is measured from `lastSeenAt`, the longer
 * it was ignored the higher it climbed. Against a real account the gate takes 86 candidates down
 * to 14.
 *
 * A new account therefore sees no engine reviews for at least a few days. That is the intent:
 * three cards on someone's first afternoon are a demo of a feature, not a memory aid. Items the
 * reader adds by hand, and items a challenge creates, are untouched — those are them asking.
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

    const [nodes, existing, fingerprints, highlightedChapterKeys] = await Promise.all([
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

    // Tags the reader applied by hand, one count per note. `NoteTags` carries no userId; the
    // note ids come from this reader's own nodes, so the lookup is scoped by construction.
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

    /*
     * Ask for more than there is room for. Some picks are dropped below — a note whose material
     * has gone, a kind with no question — and without the slack a skip would silently cost the
     * reader one of their three.
     */
    /*
     * Nothing at all until the account has enough worked-on study to be worth resurfacing.
     *
     * Three cards on someone's first afternoon are a demo of a feature, not a memory aid. A new
     * account therefore sees no engine reviews for at least `ENGINE_MIN_NODE_AGE_DAYS` and until
     * `ENGINE_COLD_START_MIN_READY` nodes have been worked on. Adding an item by hand, and the
     * items a challenge creates, are unaffected — those are the reader asking.
     */
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

      /*
       * A note with nothing to ask about is not a review item.
       *
       * Checked here rather than inside `selectReviewBatch`, which is pure and has no note
       * bodies — and should not grow a database dependency to answer one question about one
       * kind. The batch is over-fetched above so a skip costs no slot.
       */
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
          // Only a connection ever had a second note, and the engine no longer makes those.
          secondaryNoteId: null,
          scriptureReference: reference,
          // The translation it was read in, off the node's own meta — so a chapter question is
          // asked in the words the reader met it in.
          translation: reference ? parseTranslation(pick.meta ?? null) : null,
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
