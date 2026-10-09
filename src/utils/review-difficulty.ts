/**
 * How hard a rung asks, and when it gets harder.
 *
 * Review's exercises are for repetition, not for catching anyone out. The first time a reader
 * meets a rung it should be easy enough to be worth doing; what makes it a memory aid rather
 * than a quiz is that it tightens as the verse becomes theirs.
 *
 * Before this there was exactly one difficulty knob in the whole feature — `verseClozeRatio`,
 * which widened the cloze — and three rungs ignored it entirely. `verse.initials` asked for the
 * *whole verse* from its first letters, graded on every content word, all-or-nothing, and it is
 * an opening rung: roughly half of all new verses met it as their first question. `verse.recall`
 * handed over the reference and nothing else, on day one and on day four hundred alike. Those
 * are the questions this file exists to stage.
 *
 * **One table, read by every surface.** The list resolves a rung to write the prompt, the reveal
 * builds the exercise, the grader marks it and the truth restores the verse — and all four must
 * agree about which tier they are in, or a reader is marked against a question they were not
 * asked. Everything here is pure and derived, so there is nothing stored to migrate and nothing
 * that can drift between client and server.
 */

import type { RecallState } from './review-item-kinds';

/** Three steps. Naming them is what stops a bare 0/1/2 spreading through the builders. */
export type ReviewTier = 0 | 1 | 2;

/** What decides the tier: where the item is on its ladder, and how the reader has been doing. */
export interface ReviewTierInput {
  /** From `verseRungFor` / `chapterRungFor`: 0 for the whole first climb, then 1, 2, 3… per loop. */
  pass: number;
  recallState?: RecallState | null;
  /** Clean recalls in a row. Anything short of one — `almost` included — resets it to 0. */
  successStreak?: number | null;
  reviewCount?: number | null;
}

/** Clean recalls in a row that lift an item to tier 1, and to tier 2. */
export const TIER_1_STREAK = 2;
export const TIER_2_STREAK = 4;

/**
 * Which tier a rung is asking at.
 *
 * **Two roads up, one road down.** The ladder's `pass` is the slow road: 0 for the whole first
 * climb, then a tier per loop of the maintenance cycle, with `durable` a step ahead. On its own it
 * left every rung at tier 0 for eight or more clean recalls — a verse someone had got right six
 * times running was still asked with a word bank and three easy options. The streak is the fast
 * road: two clean recalls in a row and the next question tightens, four and it is at full
 * strength. The tier is whichever road has got further.
 *
 * And a miss comes back down. `successStreak` is 0 after any answer short of a clean recall, so
 * an item that has been asked before and has no streak was just missed or half-remembered — its
 * next question is a tier easier than the ladder alone would put it. This used to be ruled out
 * ("`slipping` is not a demotion") on the ground that it would take away the rung someone was
 * working on. It does not: the rung — the kind of exercise — stays where the ladder put it; only
 * how much help it gives changes. Derek's ask (Oct 2026): start easy, get harder as they get it,
 * all subject to how they do — and never as a control (`review_difficulty_adapts_silently`).
 *
 * A brand-new item is tier 0 on every road.
 *
 * Read from the item as it was asked, never as it now is — the outcome route grades and restores
 * the truth before the counters move, and this has to sit on the same side of that line.
 */
export function reviewTierFor(input: ReviewTierInput): ReviewTier {
  const pass = Math.max(0, Math.trunc(Number.isFinite(input.pass) ? input.pass : 0));
  const ladder = pass <= 0 ? 0 : Math.min(2, input.recallState === 'durable' ? pass + 1 : pass);
  const streak = Math.max(0, Math.trunc(Number(input.successStreak) || 0));
  const asked = Math.max(0, Math.trunc(Number(input.reviewCount) || 0));
  if (asked > 0 && streak === 0) return Math.max(0, ladder - 1) as ReviewTier;
  const earned = streak >= TIER_2_STREAK ? 2 : streak >= TIER_1_STREAK ? 1 : 0;
  return Math.max(ladder, earned) as ReviewTier;
}

/** The tier input for an item as it was asked, at the pass its rung resolved to. */
export function reviewTierInput(
  pass: number,
  item: { recallState?: string | null; successStreak?: number | null; reviewCount?: number | null },
): ReviewTierInput {
  return {
    pass,
    recallState: (item.recallState ?? null) as RecallState | null,
    successStreak: item.successStreak ?? 0,
    reviewCount: item.reviewCount ?? 0,
  };
}

/** A tier from a loose number — tables index on this, so an out-of-range value cannot miss. */
function tierIndex(tier: number): ReviewTier {
  if (!Number.isFinite(tier) || tier <= 0) return 0;
  return Math.min(2, Math.trunc(tier)) as ReviewTier;
}

/**
 * How many options a multiple choice offers at each tier.
 *
 * Three at tier 0: one fewer thing to read, and a first meeting with a verse that is about
 * recognising it rather than ruling out look-alikes. The wrong answers are also chosen to be
 * *unlike* the right one at tier 0 and like it at tier 2 — see `buildChoiceExercise`. A rung that
 * already asks with fewer (which-comes-first has two) never grows.
 */
export const EASY_CHOICE_OPTIONS = 3;

export function choiceOptionCount(base: number, tier: ReviewTier | null | undefined): number {
  return tier === 0 ? Math.min(base, EASY_CHOICE_OPTIONS) : base;
}

/**
 * How many phrases the ordering rung cuts a verse into, at most, per tier. Three pieces is a
 * sentence you can put back together; six is a verse you have to know.
 */
const SEQUENCE_PHRASE_TIERS: readonly number[] = [3, 4, 6];

export function verseSequenceMaxPhrases(tier: number): number {
  return SEQUENCE_PHRASE_TIERS[tierIndex(tier)];
}

/**
 * The cloze, tier by tier: how much to hide, and at most how many gaps.
 *
 * The cap is what makes tier 0 a genuinely gentle question. A ratio alone does not: 20% of a
 * long verse's content words is still six or seven gaps, which is a paragraph of typing before
 * the reader has been given any reason to want to. Two gaps in a verse you have just marked is
 * a question you can answer.
 *
 * `uniformWidths` withdraws the last hint rather than adding difficulty. Every input is sized to
 * the character count of the word it stands for — "the same hint the underscore run always gave"
 * — which is a real help early and a giveaway on a verse someone is meant to be producing from
 * memory. It is the only helper in the feature that is taken away, and it is taken away last.
 */
export interface VerseClozeSpec {
  ratio: number;
  maxBlanks: number;
  uniformWidths: boolean;
  /**
   * Offer the missing words as tiles to place, among a few that do not belong.
   *
   * Recognition before production: choosing "loved" from five words is a question a first
   * meeting can answer, and typing it cold is not. From tier 1 the tiles go and the same gaps
   * are typed — the ladder moves from recognising a word to producing it, and the reader is never
   * asked whether they would like the easier form (see `review_difficulty_adapts_silently`).
   */
  wordBank: boolean;
}

const CLOZE_TIERS: readonly VerseClozeSpec[] = [
  { ratio: 0.2, maxBlanks: 2, uniformWidths: false, wordBank: true },
  { ratio: 0.4, maxBlanks: 4, uniformWidths: false, wordBank: false },
  { ratio: 0.6, maxBlanks: Number.POSITIVE_INFINITY, uniformWidths: true, wordBank: false },
];

export function verseClozeSpec(tier: number): VerseClozeSpec {
  return CLOZE_TIERS[tierIndex(tier)];
}

/**
 * What share of a verse's content words are reduced to their first letter.
 *
 * At tier 0 and 1 the rest of the verse is shown in full, so the exercise reads as a sentence
 * with a few words standing on their initials — recognisable, and answerable in place. Only at
 * tier 2 is it the classic whole-verse skeleton, which is where this rung started and which it
 * should never have been on a first asking.
 */
const INITIALS_TIERS: readonly number[] = [0.35, 0.65, 1];

export function verseInitialsShare(tier: number): number {
  return INITIALS_TIERS[tierIndex(tier)];
}

/**
 * How much of the verse is given before the reader writes the rest.
 *
 * - `finish` — most of the verse, cut at a phrase boundary. "Finish it" is a question someone
 *   can answer on a first meeting, and it is still retrieval.
 * - `leadIn` — the opening few words only.
 * - `reference` — nothing but the reference, which is what this rung always did.
 */
export type VerseRecallMode = 'finish' | 'leadIn' | 'reference';

const RECALL_TIERS: readonly VerseRecallMode[] = ['finish', 'leadIn', 'reference'];

export function verseRecallMode(tier: number): VerseRecallMode {
  return RECALL_TIERS[tierIndex(tier)];
}

/** Where `leadIn` cuts. Enough to start the sentence, not enough to carry it. */
export const RECALL_LEAD_IN_WORDS = 4;

/** What share of the verse `finish` gives away, before rounding to a phrase boundary. */
export const RECALL_SHOWN_SHARE = 2 / 3;

/**
 * How many words the keyword rung asks for.
 *
 * Two is a low bar on purpose — this is the lightest rung on the ladder and the one most likely
 * to be someone's first contact with free recall. Four is as far as it goes: past that the rung
 * stops being "name some of this verse" and becomes a worse version of `verse.recall`.
 */
const KEYWORDS_TIERS: readonly number[] = [2, 3, 4];

export function verseKeywordsCount(tier: number): number {
  return KEYWORDS_TIERS[tierIndex(tier)];
}

/** The smallest count any tier asks for, for the availability probe — see `verseFamilyMemberAvailable`. */
export const VERSE_KEYWORDS_MIN_COUNT = KEYWORDS_TIERS[0];
