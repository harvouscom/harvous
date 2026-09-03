/** Read-only. What the readiness gate would say about every candidate node on one account. */
import 'dotenv/config';
import { db, UserNodeStates, NoteFingerprints, eq, and, inArray, desc } from '../db';
import {
  ENGINE_NODE_KINDS,
  countCommittedSignals,
  engineHasEnoughReady,
  nodeReadiness,
  type ReviewCandidateNode,
} from '../../src/utils/review-opportunity-scoring';

const uid = process.argv.find((a) => a.startsWith('--user='))?.split('=')[1]
  ?? 'user_2x04WKuLGMxuPpNpvwwA4JgRplX';
const now = new Date();

const rows = await db
  .select()
  .from(UserNodeStates)
  .where(and(eq(UserNodeStates.userId, uid), eq(UserNodeStates.status, 'active'),
    inArray(UserNodeStates.nodeKind, [...ENGINE_NODE_KINDS])))
  .orderBy(desc(UserNodeStates.lastSeenAt))
  .limit(400);

const fps = await db
  .select({ noteId: NoteFingerprints.noteId, meaningWeight: NoteFingerprints.meaningWeight })
  .from(NoteFingerprints)
  .where(eq(NoteFingerprints.userId, uid));
const weights = new Map(fps.map((r) => [r.noteId, r.meaningWeight ?? 0]));

const candidates = rows.map((r) => ({ ...r, nodeKind: r.nodeKind }) as unknown as ReviewCandidateNode);
const tally: Record<string, number> = {};
for (const c of candidates) {
  const w = c.noteId ? weights.get(c.noteId) ?? null : null;
  const verdict = nodeReadiness(c, now, w);
  tally[verdict] = (tally[verdict] ?? 0) + 1;
}
console.log(`candidates: ${candidates.length}`);
console.log('verdicts:', tally);
console.log('engine would run:', engineHasEnoughReady(candidates, now, weights));
const byKind: Record<string, Record<string, number>> = {};
for (const c of candidates) {
  const w = c.noteId ? weights.get(c.noteId) ?? null : null;
  const v = nodeReadiness(c, now, w);
  byKind[c.nodeKind] ??= {};
  byKind[c.nodeKind][v] = (byKind[c.nodeKind][v] ?? 0) + 1;
}
console.log('by kind:', JSON.stringify(byKind, null, 1));

const verses = candidates.filter((c) => c.nodeKind === 'verse');
const sig = verses.map((c) => countCommittedSignals(c));
console.log(`verse nodes: ${verses.length}, signal counts:`,
  JSON.stringify(sig.reduce((a: Record<number, number>, n) => ({ ...a, [n]: (a[n] ?? 0) + 1 }), {})));
console.log('верse sample:', verses.slice(0, 4).map((c) =>
  `${c.nodeKey.slice(0,26)} exp=${c.exposureCount} rev=${c.revisitCount} conn=${c.explicitConnectionCount} exp2=${c.expansionCount} syn=${c.synthesisCount}`));

console.log('\nready, most recent first:');
for (const c of candidates) {
  const w = c.noteId ? weights.get(c.noteId) ?? null : null;
  if (nodeReadiness(c, now, w) !== 'ready') continue;
  console.log(`  ${c.nodeKind.padEnd(10)} signals=${countCommittedSignals(c)} weight=${w ?? '—'} ${c.nodeKey.slice(0, 46)}`);
}
process.exit(0);
