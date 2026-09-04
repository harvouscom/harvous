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
  /** Tags the reader applied by hand (never the auto-generated ones). Notes only. */
  manualTagCount?: number;
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
 * The three kinds Review has an answerable question for.
 *
 * Themes, people and places are tracked and read by Home, but the app has no honest question to
 * ask about them: "what do you remember about adoption?" is a quiz about doctrine, not a return
 * to the reader's own study, and this feature does not do that.
 *
 * **Chapters used to be on that list and are not any more, and the distinction is worth
 * keeping straight.** The argument above was about *themes* — asking what a chapter is about
 * would be the same quiz. What the chapter rungs actually ask is which verse is in it, how to
 * finish one, what order they come in: the text's own questions, about a chapter this reader
 * sat with. A chapter someone read twice is not doctrine and it is not passive.
 *
 * `connection` and `thread` left for a different reason — their questions were open, with no
 * answer to mark — and are Home suggestions now. See `REVIEW_ASKABLE_KINDS`.
 */
export const ENGINE_NODE_KINDS: readonly NodeKind[] = ['verse', 'note', 'chapter'];

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
 * How long a node must have existed before Review will ask about it.
 *
 * A node created this morning is not a memory yet. The engine had no age gate at all: something
 * touched once, twenty-five hours ago, and never returned to was fully eligible — and because
 * the learning-need term measures time since `lastSeenAt`, an abandoned node kept *climbing*
 * the queue the longer it was ignored.
 */
export const ENGINE_MIN_NODE_AGE_DAYS = 3;

/**
 * The same gate for a chapter, and shorter, because reading is a different act from writing.
 *
 * Three days suits a note or a verse, where the node is created by an act the reader will
 * remember making. A chapter node is created by turning to a chapter, and the question worth
 * asking about it — what is in it, how a verse goes — is worth asking while the reading is
 * still recent enough to be theirs. One day also matches `firstDueAtFor`, which never lets a
 * chapter be asked the same day it was read.
 */
export const ENGINE_MIN_CHAPTER_AGE_DAYS = 1;

/**
 * How many distinct deliberate acts a node needs before it is worth asking about.
 *
 * Two, from different acts — not two of the same. Seeing a thing repeatedly is not the same as
 * doing something with it, which is why exposure can contribute at most one point however high
 * it climbs.
 */
export const ENGINE_MIN_COMMITTED_SIGNALS = 2;

/**
 * How much study an account needs before the engine offers anything at all.
 *
 * The cold start the strategy doc asks for: "do not fake personalization when a user has little
 * study activity". Three review cards on someone's first afternoon are not a memory aid, they
 * are a demo of a feature.
 */
export const ENGINE_COLD_START_MIN_READY = 5;

/**
 * The `meaningWeight` a note must clear.
 *
 * From `computeMeaningWeight`: a 200-character body is 0.10, one cited passage 0.05, one
 * highlight 0.067, and each of pinned / deliberately filed / linked is 0.125. So 0.2 is roughly
 * "a real paragraph plus one deliberate act", and it excludes the two things that made the
 * queue feel arbitrary — a note holding a single scripture pill, and a two-line jotting.
 *
 * Notes only. A verse has no fingerprint and needs none: citing it *is* the deliberate act.
 */
export const NOTE_MEANING_WEIGHT_FLOOR = 0.2;

/** Why a node is not ready, so a diagnostic can say which gate turned it away. */
export type NodeReadiness = 'ready' | 'too-new' | 'too-few-signals' | 'too-thin';

/**
 * What the engine knows about a node beyond the node itself.
 *
 * One field today: whether the reader has marked or cited a verse inside a chapter, which the
 * chapter node cannot see — highlights land on the verses beneath it. Passed in rather than
 * read here, because this module is pure.
 */
export interface CommittedSignalContext {
  /** Chapter node keys the reader has marked or cited a verse in. */
  highlightedChapterKeys?: ReadonlySet<string>;
}

/**
 * Distinct deliberate acts recorded against a node.
 *
 * `reviewCount` is deliberately absent: a node that has been reviewed already has an item, and
 * counting it would let the engine argue for something it has already offered.
 *
 * **Exposure means different things to each kind**, which the counter's name hides.
 *
 * A note is exposed by being opened, which happens by accident; every other counter is where its
 * deliberate acts land. A verse node is only ever touched by *citing it in your own writing or
 * marking it while reading* — both writers record `exposure` (`process-scripture-references.ts`,
 * `study-threads.ts`) — so for a passage each exposure is already a deliberate act.
 *
 * A chapter is the opposite of both: **its `exposure` is a glance and counts for nothing at
 * all.** `recordReadingEvent` writes `revisit` for a read or a study dwell and `exposure` for a
 * glance, so the split is already made at the point of recording, and the engine simply refuses
 * the passive half. Two real reads make a chapter askable; fifty glances never do. A verse
 * marked or cited inside it is one more act — the reader stopping on a line — and is the reason
 * a chapter read once with something marked in it counts as well.
 *
 * Counting a verse's exposures like a note's was checked against a real account and would have
 * retired scripture review entirely: of 51 verse nodes, 39 had no other signal at all and none
 * had two.
 */
export function countCommittedSignals(
  node: ReviewCandidateNode,
  context: CommittedSignalContext = {},
): number {
  if (node.nodeKind === 'chapter') {
    // A read or a study dwell, at most twice; a glance is `exposure` and is worth nothing.
    let signals = Math.min(2, Math.max(0, node.revisitCount));
    if (context.highlightedChapterKeys?.has(node.nodeKey)) signals += 1;
    return signals;
  }
  return countCommittedSignalsForNote(node);
}

function countCommittedSignalsForNote(node: ReviewCandidateNode): number {
  let signals = 0;
  if (node.revisitCount > 0) signals += 1;
  if (node.explicitConnectionCount > 0) signals += 1;
  if (node.expansionCount > 0) signals += 1;
  if (node.synthesisCount > 0) signals += 1;

  if (node.nodeKind === 'verse') {
    // Two separate occasions of citing or marking this passage, which is two deliberate acts.
    signals += Math.min(2, Math.max(0, node.exposureCount));
  } else if (node.exposureCount >= 2) {
    // Opening a note twice is a signal; opening it thirty times is still one.
    signals += 1;
  }
  // Filing a note under a tag by hand is a deliberate act about *this* note. One signal however
  // many tags: the decision was to file it, not how many drawers.
  if (node.nodeKind === 'note' && (node.manualTagCount ?? 0) > 0) signals += 1;
  return signals;
}

/**
 * Is this node worth asking about yet?
 *
 * Separate from `scoreNode`, which answers "how much" — this answers "at all". The two gates in
 * `scoreNode` are about timing (asked already, seen just now); these are about whether the
 * reader has done enough with the thing for a question to be about their study rather than
 * about a page they once opened.
 */
export function nodeReadiness(
  node: ReviewCandidateNode,
  now: Date,
  meaningWeight: number | null,
  context: CommittedSignalContext = {},
): NodeReadiness {
  const minAge =
    node.nodeKind === 'chapter' ? ENGINE_MIN_CHAPTER_AGE_DAYS : ENGINE_MIN_NODE_AGE_DAYS;
  if (daysBetween(node.firstStudiedAt, now) < minAge) return 'too-new';
  if (countCommittedSignals(node, context) < ENGINE_MIN_COMMITTED_SIGNALS) return 'too-few-signals';
  if (node.nodeKind === 'note' && (meaningWeight ?? 0) < NOTE_MEANING_WEIGHT_FLOOR) {
    return 'too-thin';
  }
  return 'ready';
}

export function nodeIsReady(
  node: ReviewCandidateNode,
  now: Date,
  meaningWeight: number | null,
  context: CommittedSignalContext = {},
): boolean {
  return nodeReadiness(node, now, meaningWeight, context) === 'ready';
}

/**
 * Does this account have enough worked-on study for the engine to run?
 *
 * Counted across every candidate regardless of whether Review has already asked about it: a node
 * already in the queue still says the account is one someone has been studying in.
 */
export function engineHasEnoughReady(
  nodes: readonly ReviewCandidateNode[],
  now: Date,
  meaningWeightByNoteId: ReadonlyMap<string, number>,
  context: CommittedSignalContext = {},
): boolean {
  let ready = 0;
  for (const node of nodes) {
    /*
     * Chapters do not count toward the cold start.
     *
     * The gate asks whether this is an account someone has been *studying* in, and reading is
     * the one signal that arrives without any writing at all. Counted here, a reader who has
     * turned to five chapters and written nothing would unlock the engine and be asked about
     * five chapters — which is the demo-of-a-feature the cold start exists to prevent. They
     * still get chapter items once the account clears the gate on its own study.
     */
    if (node.nodeKind === 'chapter') continue;
    const weight = node.noteId ? meaningWeightByNoteId.get(node.noteId) ?? null : null;
    if (nodeIsReady(node, now, weight, context)) {
      ready += 1;
      if (ready >= ENGINE_COLD_START_MIN_READY) return true;
    }
  }
  return false;
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
  /**
   * `NoteFingerprints.meaningWeight` by note id, for the readiness floor.
   *
   * Passed in rather than read here because this module is pure. An empty map means no note
   * clears the floor, which is the safe direction: the engine offers nothing rather than
   * offering everything.
   */
  meaningWeightByNoteId?: ReadonlyMap<string, number>;
  /** Extra facts the nodes cannot see — see `CommittedSignalContext`. */
  signalContext?: CommittedSignalContext;
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

  const weights = options.meaningWeightByNoteId ?? new Map<string, number>();

  const scored = nodes
    .filter((node) => ENGINE_NODE_KINDS.includes(node.nodeKind))
    // Worth asking about at all, before worth asking about now.
    .filter((node) =>
      nodeIsReady(
        node,
        options.now,
        node.noteId ? weights.get(node.noteId) ?? null : null,
        options.signalContext,
      ),
    )
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
