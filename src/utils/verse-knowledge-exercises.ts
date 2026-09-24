/**
 * The three rungs whose answer key is the curated scripture knowledge layer.
 *
 * Everything else on the verse ladder is keyed to the text itself or to something the reader
 * committed. These three are keyed to editorial data *about* Scripture — OpenBible's topic
 * index, its people and places, the Treasury of Scripture Knowledge cross-references — which is
 * a different kind of key and needs its own statement of what it may and may not do.
 *
 * **What it may do.** Frame a prompt, supply distractors, and be the answer to a question about
 * Scripture: which theme a verse carries, who it is about, what it is cross-referenced with. The
 * index is a curated, weighted, attributed dataset; asking a reader to recognise its reading of a
 * verse is a fair question about the Bible.
 *
 * **What it must never do.** Be the answer to a question about what the reader's *own note*
 * meant. `NoteFingerprints.themes`, auto-tags and tone are a machine's reading of someone's
 * prose, and grading those grades the detector. None of them is imported here, and the note
 * ladder never reaches into this file.
 *
 * **What it grades, honestly stated.** A miss here means the reader disagreed with the index, not
 * that they forgot something they knew. So the answer shown after a miss is phrased as "the
 * index has this as…", a theme miss never counts as a lapse, and the two-attempt rule matters
 * more on these rungs than anywhere else.
 *
 * Pure. The server brings the material; this decides the shape.
 */

import { buildChoiceExercise, type ChoiceExercise } from '@/utils/choice-exercise';

/** Below this an OpenBible topic edge is incidental. Mirrors `MIN_THEME_CORROBORATION_RELEVANCE`. */
export const VERSE_THEME_MIN_RELEVANCE = 50;

/** Below this a TSK cross-reference is one voter's opinion rather than the index's. */
export const CROSSREF_MIN_VOTES = 5;

const OPTION_COUNT = 4;

/**
 * "Pick the theme this verse carries."
 *
 * `answers` is every topic on the verse at or above the floor — a set, because a verse carries
 * several and any of them is right. `exclude` is *every* topic on the verse at any relevance:
 * a topic the index attaches weakly is still not a wrong answer, and must not be offered as one.
 * Distractors come from the reader's other passages first, so the wrong options are themes they
 * have actually met.
 */
export function buildVerseTheme(input: {
  answers: readonly string[];
  /** Every topic on the verse, any relevance — barred as distractors. */
  onVerse: readonly string[];
  /** Topics carried by the reader's other cited verses. */
  pool: readonly string[];
  /** The wider index, used only when the reader's own runs short. */
  fallbackPool?: readonly string[];
  seed: string;
}): ChoiceExercise | null {
  if (!input.answers.length) return null;
  return buildChoiceExercise({
    answers: input.answers,
    pool: input.pool,
    fallbackPool: input.fallbackPool,
    exclude: input.onVerse,
    optionCount: OPTION_COUNT,
    seed: input.seed,
  });
}

/**
 * "Pick who this verse is about."
 *
 * Same shape as the theme rung. `onVerse` bars every person the index places here, so a verse
 * about both Moses and Aaron never offers Aaron as the wrong answer to Moses.
 */
export function buildVersePerson(input: {
  answers: readonly string[];
  onVerse: readonly string[];
  pool: readonly string[];
  fallbackPool?: readonly string[];
  seed: string;
}): ChoiceExercise | null {
  if (!input.answers.length) return null;
  return buildChoiceExercise({
    answers: input.answers,
    pool: input.pool,
    fallbackPool: input.fallbackPool,
    exclude: input.onVerse,
    optionCount: OPTION_COUNT,
    seed: input.seed,
  });
}

/**
 * "Pick the place this verse names."
 *
 * The twin of the person rung, and askable for the same reason: the index puts a place at a
 * verse, so it is either named there or it is not, and no reading of the text decides it. What
 * the rung must never become is "where did this happen" — the index says Bethany is *named* in
 * John 11, not that the whole chapter takes place there, and the prompt is worded to match.
 *
 * `onVerse` bars every place the index puts here, so a verse naming both Jerusalem and Bethany
 * never offers Bethany as the wrong answer to Jerusalem.
 */
export function buildVersePlace(input: {
  answers: readonly string[];
  onVerse: readonly string[];
  pool: readonly string[];
  fallbackPool?: readonly string[];
  seed: string;
}): ChoiceExercise | null {
  if (!input.answers.length) return null;
  return buildChoiceExercise({
    answers: input.answers,
    pool: input.pool,
    fallbackPool: input.fallbackPool,
    exclude: input.onVerse,
    optionCount: OPTION_COUNT,
    seed: input.seed,
  });
}

/**
 * "Pick the passage this verse is cross-referenced with" — asked with references.
 *
 * It was asked with eight-word openings, reusing the next-verse builder, on the reasoning that a
 * reader recognises "Abide in me, and I in you" before "John 15:4". Derek's call (Sept 2026) went
 * the other way: a cross-reference *is* a reference, it is how the index and every study Bible
 * print it, and a line of openings made the card another "what comes next". So the options are
 * references, and the verse on the card is the question.
 *
 * Shaped like the other index-keyed rungs. `answers` is every cross-reference the index carries
 * for the verse — a set, since any of them is right — and all of them are barred as distractors,
 * with the verse itself, so no wrong option is secretly a right one. Distractors are the reader's
 * own passages, same book first (`pool`, from `partitionByBook`), so the book never gives the
 * answer away; well-known verses top it up for a reader with little on file.
 */
export function buildVerseCrossref(input: {
  /** Every cross-reference of the verse, as references. */
  answers: readonly string[];
  /** The verse asked about, never an option. */
  verse: string;
  /** The reader's passages, closest first. */
  pool: readonly string[];
  fallbackPool?: readonly string[];
  seed: string;
}): ChoiceExercise | null {
  if (!input.answers.length) return null;
  return buildChoiceExercise({
    answers: input.answers,
    pool: input.pool,
    fallbackPool: [...(input.fallbackPool ?? []), ...CROSSREF_FALLBACK_REFERENCES],
    exclude: [...input.answers, input.verse],
    optionCount: OPTION_COUNT,
    seed: input.seed,
  });
}

/** Verses most readers half-know, for a reader with too few passages of their own. */
export const CROSSREF_FALLBACK_REFERENCES = [
  'John 3:16',
  'Psalms 23:1',
  'Romans 8:28',
  'Philippians 4:13',
  'Genesis 1:1',
  'Proverbs 3:5',
  'Isaiah 40:31',
  'Matthew 11:28',
  'Jeremiah 29:11',
  'John 14:6',
] as const;
