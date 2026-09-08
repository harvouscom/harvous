/**
 * Read-only: what the review engine currently makes of one reader's study.
 *
 * Prints the readiness verdict for every node, a tally per kind, whether the cold start has
 * opened, and what the engine would pick next — creating nothing. `selectReviewBatch` and
 * `nodeReadiness` are pure, and nothing here writes, so it is safe to point at production.
 *
 * Usage:
 *   npx tsx server/scripts/preview-review-engine.ts --user=user_xxx
 *
 * `--user` is required on purpose. It used to default to a hardcoded account, which is how you
 * end up measuring one reader and drawing conclusions about another — the exact mistake that
 * sent a day's worth of "Review is empty" debugging in the wrong direction, because the dev and
 * live Clerk instances mint different ids against the same database.
 */
import 'dotenv/config';
import { db, UserNodeStates, StudyThreadEntries, ReviewItems, NoteFingerprints, eq, and, isNull, desc } from '../db';
import {
  ENGINE_NODE_KINDS,
  engineHasEnoughReady,
  nodeReadiness,
  selectReviewBatch,
  type ReviewCandidateNode,
} from '@/utils/review-opportunity-scoring';
import { nodeKey, verseNodesForReference, type NodeKind } from '@/utils/study-bible-nodes';

const uid = process.argv.find((a) => a.startsWith('--user='))?.split('=')[1];
if (!uid) {
  console.error('usage: npx tsx server/scripts/preview-review-engine.ts --user=<clerk user id>');
  process.exit(1);
}
const now = new Date();

const marks = await db
  .select({ reference: StudyThreadEntries.scriptureReference })
  .from(StudyThreadEntries)
  .where(and(eq(StudyThreadEntries.userId, uid), isNull(StudyThreadEntries.parentNoteId)));
const highlightedChapterKeys = new Set<string>();
for (const row of marks) {
  if (!row.reference) continue;
  for (const chapter of verseNodesForReference(row.reference).chapters) {
    highlightedChapterKeys.add(nodeKey.chapter(chapter));
  }
}

const rows = await db
  .select()
  .from(UserNodeStates)
  .where(and(eq(UserNodeStates.userId, uid), eq(UserNodeStates.nodeKind, 'chapter'), eq(UserNodeStates.status, 'active')))
  .orderBy(desc(UserNodeStates.lastSeenAt))
  .limit(60);

const tally: Record<string, number> = {};
for (const row of rows) {
  const node = { ...row, nodeKind: row.nodeKind as NodeKind } as ReviewCandidateNode;
  const verdict = nodeReadiness(node, now, null, { highlightedChapterKeys });
  tally[verdict] = (tally[verdict] ?? 0) + 1;
  if (verdict === 'ready' || row.revisitCount > 0) {
    console.log(
      `${verdict.padEnd(16)} ${String(row.label).padEnd(18)} reads=${row.revisitCount} glances=${row.exposureCount} marked=${highlightedChapterKeys.has(row.nodeKey) ? 'y' : 'n'} scheduled=${row.nextReviewAt ? 'y' : 'n'}`,
    );
  }
}
console.log('tally', JSON.stringify(tally), 'of', rows.length, 'chapter nodes');

/*
 * What the engine would pick next, across every kind, if the daily cap had room. Read-only:
 * `selectReviewBatch` is pure and nothing here writes.
 */
const all = await db
  .select()
  .from(UserNodeStates)
  .where(and(eq(UserNodeStates.userId, uid), eq(UserNodeStates.status, 'active')))
  .orderBy(desc(UserNodeStates.lastSeenAt))
  .limit(400);
const candidates = all
  .filter((row) => (ENGINE_NODE_KINDS as readonly string[]).includes(row.nodeKind))
  .map((row) => ({ ...row, nodeKind: row.nodeKind as NodeKind }) as ReviewCandidateNode);
const existing = await db
  .select({ sourceKey: ReviewItems.sourceKey })
  .from(ReviewItems)
  .where(eq(ReviewItems.userId, uid));
const weights = new Map<string, number>(
  (await db.select({ noteId: NoteFingerprints.noteId, meaningWeight: NoteFingerprints.meaningWeight }).from(NoteFingerprints).where(eq(NoteFingerprints.userId, uid)))
    .map((r) => [r.noteId, r.meaningWeight ?? 0]),
);
console.log('cold start passed:', engineHasEnoughReady(candidates, now, weights, { highlightedChapterKeys }));
const picks = selectReviewBatch(candidates, {
  now,
  meaningWeightByNoteId: weights,
  existingSourceKeys: new Set(existing.map((r) => r.sourceKey)),
  signalContext: { highlightedChapterKeys },
});

// Readiness across every kind, which is the number the cold start is actually counting.
const byKind: Record<string, Record<string, number>> = {};
for (const c of candidates) {
  const weight = c.noteId ? weights.get(c.noteId) ?? null : null;
  const verdict = nodeReadiness(c, now, weight, { highlightedChapterKeys });
  (byKind[c.nodeKind] ??= {})[verdict] = ((byKind[c.nodeKind] ??= {})[verdict] ?? 0) + 1;
}
for (const [kind, verdicts] of Object.entries(byKind)) {
  console.log(`${kind.padEnd(8)} ${JSON.stringify(verdicts)}`);
}

for (const pick of picks) console.log('would add:', pick.nodeKind, pick.nodeKey, '|', pick.label);
process.exit(0);
