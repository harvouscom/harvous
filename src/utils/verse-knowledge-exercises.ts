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
import { buildVerseNext, type VerseNextExercise } from '@/utils/verse-ladder-exercises';

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
 * "Pick the passage this verse is cross-referenced with."
 *
 * The same shape as "what comes next": the answer is a verse shown as an eight-word opening,
 * never as a reference — naming it would answer nothing but arithmetic, and a reader is far more
 * likely to recognise "Abide in me, and I in you" than "John 15:4". The caller supplies the
 * highest-voted target as the answer and cues of unrelated passages the reader has cited as the
 * distractors. Reusing the next-verse builder is deliberate: the two rungs differ only in which
 * text is the answer, and one builder cannot drift from itself.
 */
export function buildVerseCrossref(input: {
  answerText: string;
  distractorTexts: readonly string[];
  seed: string;
}): VerseNextExercise | null {
  return buildVerseNext({
    answerText: input.answerText,
    neighbourTexts: input.distractorTexts,
    seed: input.seed,
  });
}
