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

/**
 * Which tier a rung is asking at.
 *
 * `pass` is the driver and comes from `verseRungFor` / `chapterRungFor`: 0 for the whole climb,
 * then 1, 2, 3… on each loop of the maintenance cycle. It is rung-scoped rather than
 * item-scoped, which is exactly the property wanted here — meeting `verse.initials` for the
 * first time is tier 0 even on a verse the reader has answered a dozen times on other rungs.
 *
 * **A first meeting is never accelerated.** `pass === 0` is tier 0 whatever else is true, and
 * that is the rule the whole file is written around: the first attempt at any exercise is easy.
 *
 * `recallState` only shortens the gap between tier 1 and tier 2. Reaching tier 2 on pass alone
 * takes a second full loop of the ladder — around fifteen clean recalls — and intervals compound
 * as a verse settles, so on the calendar that is a very long way out. A verse the scheduler
 * already calls `durable` is one the reader demonstrably holds; asking it at full strength is
 * the point of having a full strength. `slipping` is deliberately *not* a demotion: dropping
 * someone to an easier form the moment they miss would take away the rung they were working on
 * just as they started working on it, and the ladder already steps back on a genuine stall.
 *
 * Read from the item as it was asked, never as it now is — the outcome route grades and restores
 * the truth before the counters move, and this has to sit on the same side of that line.
 */
export function reviewTierFor(pass: number, recallState?: RecallState | null): ReviewTier {
  const base = Math.max(0, Math.trunc(Number.isFinite(pass) ? pass : 0));
  if (base <= 0) return 0;
  const accelerated = recallState === 'durable' ? base + 1 : base;
  return Math.min(2, accelerated) as ReviewTier;
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
}

const CLOZE_TIERS: readonly VerseClozeSpec[] = [
  { ratio: 0.2, maxBlanks: 2, uniformWidths: false },
  { ratio: 0.4, maxBlanks: 4, uniformWidths: false },
  { ratio: 0.6, maxBlanks: Number.POSITIVE_INFINITY, uniformWidths: true },
];

export function verseClozeSpec(pass: number, recallState?: RecallState | null): VerseClozeSpec {
  return CLOZE_TIERS[reviewTierFor(pass, recallState)];
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

export function verseInitialsShare(pass: number, recallState?: RecallState | null): number {
  return INITIALS_TIERS[reviewTierFor(pass, recallState)];
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

export function verseRecallMode(pass: number, recallState?: RecallState | null): VerseRecallMode {
  return RECALL_TIERS[reviewTierFor(pass, recallState)];
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

export function verseKeywordsCount(pass: number, recallState?: RecallState | null): number {
  return KEYWORDS_TIERS[reviewTierFor(pass, recallState)];
}

/** The smallest count any tier asks for, for the availability probe — see `verseFamilyMemberAvailable`. */
export const VERSE_KEYWORDS_MIN_COUNT = KEYWORDS_TIERS[0];
