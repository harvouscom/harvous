/**
 * Which nodes in the reader's Study Bible layer are worth a review question.
 *
 * The engine's whole judgement, pure and testable. It reads counts and dates off
 * `UserNodeStates` rows and answers with at most a few — never more than
 * `REVIEW_ENGINE_DAILY_CAP` in a rolling day, and never more than two of any one kind, so what
 * arrives is a mixed handful rather than three variations of the same question.
 *
 * The rule underneath it: **learning need × the reader's own intent, decayed by recency.**
 *
 * - *Learning need* reuses `forgettingAwarePriority`, the same forgetting curve Home's passive
 *   resurfacing runs on. Something is worth asking about when it matters and has faded, not
 *   merely when it is old.
 * - *Intent* is what the reader did beyond looking: returned to it, linked it, wrote more about
 *   it, named what it was. This is what makes the engine compound with study — the more
 *   deliberately someone works on something, the more likely it comes back.
 * - *Recency* is a small forward term, so a verse highlighted last week can outrank a note from
 *   two years ago that scores the same on everything else.
 *
 * Nothing here is a model or a black box. Every number is in this file and every input is
 * something the reader did.
 */

import {
  DEFAULT_BASE_STABILITY_DAYS,
  forgettingAwarePriority,
} from '@/utils/prototype-home-trends';
import {
  reviewSourceKeyForNode,
  type NodeKind,
  type NodeSignal,
} from '@/utils/study-bible-nodes';
import { REVIEW_ENGINE_DAILY_CAP } from '@/utils/review-item-kinds';

/** The shape the engine needs from a UserNodeStates row. */
export interface ReviewCandidateNode {
  nodeKind: NodeKind;
  nodeKey: string;
  label: string | null;
  noteId: string | null;
  secondaryNoteId: string | null;
  exposureCount: number;
  revisitCount: number;
  explicitConnectionCount: number;
  expansionCount: number;
  synthesisCount: number;
  reviewCount: number;
  firstStudiedAt: Date;
  lastSeenAt: Date;
  nextReviewAt: Date | null;
  lastSignal: NodeSignal | string;
  lastSourceLabel: string | null;
  lastSourceAt: Date;
  status: string;
  meta?: string | null;
}

/**
 * The four kinds Review has a question for.
 *
 * Themes, people, places and chapters are tracked and read by Home, but the app has no honest
 * question to ask about them yet. "What do you remember about adoption?" is a quiz about
 * doctrine, not a return to the reader's own study, and this feature does not do that.
 */
export const ENGINE_NODE_KINDS: readonly NodeKind[] = ['verse', 'note', 'connection', 'thread'];

/** At most two of one kind in a batch of three, so an offer is never three of the same shape. */
export const ENGINE_PER_KIND_CAP = 2;

/**
 * Nothing seen in the last day is asked about.
 *
 * Reading the answer off the screen is not recall, and the reader knows it. This is the same
 * reasoning `firstDueAt` uses for items someone adds by hand.
 */
export const ENGINE_MIN_QUIET_HOURS = 24;

/** Weights, exported so the tests pin them rather than restating them. */
export const ENGINE_WEIGHTS = {
  learningNeed: 1,
  intent: 0.6,
  recency: 0.25,
  /** Days over which the recency term decays to about a third. */
  recencyHalfLifeDays: 30,
} as const;

/** Baseline meaning for a node nobody has done anything with beyond seeing it. */
const BASE_MEANING = 0.3;

const DAY_MS = 24 * 60 * 60 * 1000;

const daysBetween = (from: Date, to: Date) => Math.max(0, (to.getTime() - from.getTime()) / DAY_MS);

/**
 * What the reader has done about this beyond looking at it, 0..1.
 *
 * Weighted by how much each act costs them: returning is cheap, linking and writing are
 * deliberate, naming a Thread is the most deliberate thing the app can observe. Saturates at
 * eight weighted points, so a heavily worked node cannot crowd out everything else forever.
 */
export function intentScore(node: ReviewCandidateNode): number {
  const weighted =
    node.revisitCount +
    node.explicitConnectionCount * 2 +
    node.expansionCount * 2 +
    node.synthesisCount * 3;
  return Math.min(1, weighted / 8);
}

/** Intent, floored so an untouched node is still worth something. */
export function meaningWeightForNode(node: ReviewCandidateNode): number {
  return BASE_MEANING + (1 - BASE_MEANING) * intentScore(node);
}

/**
 * How much this node has already been reviewed, as a stability multiplier.
 *
 * Each answered review widens the window before it is worth asking again, which is the same
 * doubling `nextRecallStabilityDays` applies on the resurfacing side.
 */
function stabilityDaysForNode(node: ReviewCandidateNode): number {
  return DEFAULT_BASE_STABILITY_DAYS * (1 + Math.max(0, node.reviewCount));
}

/**
 * The score. Higher is more worth asking about. Zero means "not now", for a stated reason.
 */
export function scoreNode(node: ReviewCandidateNode, now: Date): number {
  if (node.status !== 'active') return 0;
  // Already in someone's queue on a schedule — the engine does not double-book a node.
  if (node.nextReviewAt && node.nextReviewAt.getTime() > now.getTime()) return 0;
  // Still on screen, near enough.
  if (daysBetween(node.lastSeenAt, now) * 24 < ENGINE_MIN_QUIET_HOURS) return 0;

  const learningNeed = forgettingAwarePriority(
    meaningWeightForNode(node),
    daysBetween(node.lastSeenAt, now),
    stabilityDaysForNode(node),
  );
  const recency = Math.exp(
    -daysBetween(node.lastSourceAt, now) / ENGINE_WEIGHTS.recencyHalfLifeDays,
  );

  return (
    ENGINE_WEIGHTS.learningNeed * learningNeed +
    ENGINE_WEIGHTS.intent * intentScore(node) +
    ENGINE_WEIGHTS.recency * recency
  );
}

export interface SelectReviewBatchOptions {
  now: Date;
  /** Source keys already in ReviewItems, in any status — the engine never re-adds those. */
  existingSourceKeys: ReadonlySet<string>;
  limit?: number;
  perKindCap?: number;
}

/**
 * Choose what to add, deterministically.
 *
 * Ties break by the older `lastSeenAt` and then by key, so two runs over the same data pick
 * the same rows — the engine has to be explainable, and "it depends which order Postgres
 * returned them" is not an explanation.
 */
export function selectReviewBatch(
  nodes: readonly ReviewCandidateNode[],
  options: SelectReviewBatchOptions,
): ReviewCandidateNode[] {
  const limit = options.limit ?? REVIEW_ENGINE_DAILY_CAP;
  const perKindCap = options.perKindCap ?? ENGINE_PER_KIND_CAP;
  if (limit <= 0) return [];

  const scored = nodes
    .filter((node) => ENGINE_NODE_KINDS.includes(node.nodeKind))
    .filter((node) => {
      const sourceKey = reviewSourceKeyForNode(node);
      return sourceKey != null && !options.existingSourceKeys.has(sourceKey);
    })
    .map((node) => ({ node, score: scoreNode(node, options.now) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const seen = a.node.lastSeenAt.getTime() - b.node.lastSeenAt.getTime();
      if (seen !== 0) return seen;
      return a.node.nodeKey.localeCompare(b.node.nodeKey);
    });

  const picked: ReviewCandidateNode[] = [];
  const perKind = new Map<NodeKind, number>();

  for (const { node } of scored) {
    if (picked.length >= limit) break;
    const used = perKind.get(node.nodeKind) ?? 0;
    if (used >= perKindCap) continue;
    perKind.set(node.nodeKind, used + 1);
    picked.push(node);
  }

  return picked;
}

/** How many more the engine may add right now, given what it added in the rolling window. */
export function engineDailyRoom(
  createdInWindow: number,
  cap: number = REVIEW_ENGINE_DAILY_CAP,
): number {
  return Math.max(0, cap - Math.max(0, createdInWindow));
}
