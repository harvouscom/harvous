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
 * The `meaningWeight` a note must clear — and, since the signals gate stopped applying to notes,
 * the whole of what Review asks of one.
 *
 * From `computeMeaningWeight`: a 200-character body is 0.10, one cited passage 0.05, one
 * highlight 0.067, and each of pinned / deliberately filed / linked is 0.125. So 0.2 is roughly
 * "a real paragraph, or a short one that was also done something with", and it excludes the two
 * things that made the queue feel arbitrary — a note holding a single scripture pill, and a
 * two-line jotting.
 *
 * **It stays at 0.2 now that it stands alone, and raising it would not be a smaller widening —
 * it would be a widening plus a narrowing.** A note with two committed signals and a weight of
 * 0.25 is askable today; at 0.3 it becomes `too-thin` and stops being offered. On the account
 * this was measured against that is 5 of 31 notes. Shipping a fix for "I have nothing in Review"
 * that simultaneously retires notes which already qualified is the wrong trade.
 *
 * What makes one number safe is that `meaningWeight ?? 0` fails closed: a note with no
 * fingerprint row scores zero, and `computeAndStoreNoteFingerprint` writes none for a
 * `noteType === 'scripture'` note, so generated passage notes can never clear it.
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
  /*
   * Filing a note under a tag by hand is a deliberate act about *this* note. One signal however
   * many tags: the decision was to file it, not how many drawers.
   *
   * `nodeReadiness` no longer consults this for notes — writing one is itself the deliberate act
   * and the meaning floor is the gate. Kept because it is a true measure of intent and this
   * function is exported on its own, and because putting the two-signal rule back on notes is a
   * decision someone should have to make on purpose rather than by restoring a line.
   */
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

  /*
   * For a note the meaning floor *is* the gate, and the signal count does not apply.
   *
   * The signals gate asks "has the reader done something with this beyond seeing it?" — which is
   * the right question for a verse or a chapter, where the node is created by contact. A note is
   * not created by contact. Someone sat down and wrote it, and no counter in this file can
   * observe an act more deliberate than that.
   *
   * Requiring a *second* act on top of it said that writing something does not count until you
   * come back to it, and the effect was not subtle: on a real account, 31 notes cleared the
   * floor and one was ever askable. Never returning to a note is not evidence you would rather
   * forget what is in it.
   *
   * The age gate above still applies, and it is the one doing the work the cold start cares
   * about — nothing written today is asked about today, however substantial it is.
   */
  if (node.nodeKind === 'note') {
    return (meaningWeight ?? 0) < NOTE_MEANING_WEIGHT_FLOOR ? 'too-thin' : 'ready';
  }

  if (countCommittedSignals(node, context) < ENGINE_MIN_COMMITTED_SIGNALS) return 'too-few-signals';
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
     * Chapters count, and used to not.
     *
     * The exclusion read: "reading is the one signal that arrives without any writing at all.
     * Counted here, a reader who has turned to five chapters and written nothing would unlock
     * the engine and be asked about five chapters — the demo-of-a-feature the cold start exists
     * to prevent."
     *
     * The fear is right and the guard was in the wrong place, because it describes chapters that
     * `nodeIsReady` already refuses. A chapter needs two committed signals, and for a chapter
     * those are reads and study dwells, plus one for having marked something in it —
     * `countCommittedSignals` scores a glance at nothing at all. "Turned to five chapters" is
     * five glances: none of them ready, none of them counted, with or without this line.
     *
     * What the line did instead was refuse the reader it was written to protect. Someone who has
     * read eleven chapters and gone back to six of them has been studying by any honest reading
     * of the word, and none of it moved them one step closer to a feature that exists to bring
     * their study back. Reading is how a great many people study, and an engine that waits for
     * writing before it believes them is making a claim about what study looks like that this
     * app should not make.
     *
     * `nodeIsReady` is the arbiter, which is what it is for.
     */
    const weight = node.noteId ? meaningWeightByNoteId.get(node.noteId) ?? null : null;
    if (nodeIsReady(node, now, weight, context)) {
      ready += 1;
      if (ready >= ENGINE_COLD_START_MIN_READY) return true;
    }
  }
  return false;
}

/** What the cold-start gate is waiting for, in terms a reader can be told. */
export interface EngineColdStart {
  /** Non-chapter nodes already past every gate. */
  ready: number;
  /** How many are needed before the engine will create anything. */
  needed: number;
  /**
   * When the gate opens if the reader does nothing else, or null when waiting is not enough.
   *
   * Null is the honest answer far more often than a date is. Age is only one of three reasons a
   * node is held back — the others are too few committed signals and, for notes, too little
   * substance — and neither of those resolves by itself. Promising a Tuesday to someone whose
   * study will still not qualify on Tuesday is worse than saying nothing.
   */
  opensAt: Date | null;
}

/**
 * Why the engine has not started, and when it will.
 *
 * Separate from {@link engineHasEnoughReady} because the two questions have different audiences:
 * that one gates the engine and only needs a boolean, this one is for telling someone what is
 * happening. An account can sit behind the gate for days, and Review showing nothing at all in
 * the meantime is indistinguishable from Review being broken — which is exactly how it was
 * reported.
 *
 * A node is only counted toward `opensAt` if it would actually be ready once it is old enough,
 * which is checked by asking `nodeReadiness` about it at the date it matures rather than by
 * re-deriving the other two gates here. Duplicating them is how this drifts from the gate it
 * describes.
 */
export function describeEngineColdStart(
  nodes: readonly ReviewCandidateNode[],
  now: Date,
  meaningWeightByNoteId: ReadonlyMap<string, number>,
  context: CommittedSignalContext = {},
): EngineColdStart {
  let ready = 0;
  const maturesAt: number[] = [];

  for (const node of nodes) {
    const weight = node.noteId ? meaningWeightByNoteId.get(node.noteId) ?? null : null;
    const readiness = nodeReadiness(node, now, weight, context);
    if (readiness === 'ready') {
      ready += 1;
      continue;
    }
    if (readiness !== 'too-new') continue;

    /*
     * A chapter matures a day after it was read, not three — reading is a different act from
     * writing and `nodeReadiness` already says so. Asking the wrong threshold here would put the
     * estimate two days behind the gate it is describing, which is the quiet way an explanation
     * stops being about the thing it explains.
     */
    const minAge =
      node.nodeKind === 'chapter' ? ENGINE_MIN_CHAPTER_AGE_DAYS : ENGINE_MIN_NODE_AGE_DAYS;
    const matureAt = new Date(node.firstStudiedAt.getTime() + minAge * DAY_MS);
    if (nodeReadiness(node, matureAt, weight, context) === 'ready') maturesAt.push(matureAt.getTime());
  }

  const needed = ENGINE_COLD_START_MIN_READY;
  if (ready >= needed) return { ready, needed, opensAt: null };

  const short = needed - ready;
  if (maturesAt.length < short) return { ready, needed, opensAt: null };

  maturesAt.sort((a, b) => a - b);
  return { ready, needed, opensAt: new Date(maturesAt[short - 1]) };
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
