/**
 * One multiple-choice question, built from material the reader committed.
 *
 * Extracted from `buildVerseLocate`, which had this shape hard-coded around scripture
 * references, because the note ladder needs exactly the same thing about a different subject:
 * a right answer, three wrong ones drawn from the reader's own material, and a seeded position
 * so two devices show the same card.
 *
 * Two properties do the real work, and both exist because of specific bugs:
 *
 * - **`answers` is a set, not a value.** "Which of these did you cite here?" has as many right
 *   answers as the note has passages. Picking one of them as *the* answer would grade the row
 *   order of a detector rather than anything the reader decided.
 * - **`exclude` is separate from `answers`.** Every acceptable answer must also be barred from
 *   appearing as a distractor, and callers forget. A note citing Romans 8 and Ephesians 2, asked
 *   about Romans 8, must not offer Ephesians 2 as a wrong option — it is not wrong.
 *
 * Pure. No scripture knowledge, no note knowledge; the callers bring their own vocabulary.
 */

import { hashSeed, mulberry32 } from '@/utils/verse-cloze';

export interface ChoiceExercise {
  /** What the reader picks between. Exactly one is an acceptable answer. */
  options: string[];
  /** Index of the shown answer. Never sent to the client. */
  answerIndex: number;
}

export const DEFAULT_OPTION_COUNT = 4;

const normalise = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');

export interface BuildChoiceExerciseInput {
  /** Every acceptable answer. One is shown; the rest are barred from being distractors. */
  answers: readonly string[];
  /** The reader's own material, drawn from first. */
  pool: readonly string[];
  /** Used only once `pool` is exhausted — see the tier note below. */
  fallbackPool?: readonly string[];
  /** Never a distractor, even though it is not the shown answer. */
  exclude?: readonly string[];
  optionCount?: number;
  seed: string;
}

/**
 * Build the question, or null when there is not enough material for one.
 *
 * Distractors come from `pool` before `fallbackPool`, and the tiering is the point: an option
 * the reader has never encountered is not a distractor, it is noise, and choosing between "the
 * one I recognise" and three strangers is not an exercise.
 */
export function buildChoiceExercise(input: BuildChoiceExerciseInput): ChoiceExercise | null {
  const optionCount = input.optionCount ?? DEFAULT_OPTION_COUNT;
  const random = mulberry32(hashSeed(input.seed));

  const acceptable = input.answers.map((a) => a.trim()).filter(Boolean);
  if (!acceptable.length) return null;

  // Which answer gets shown is itself seeded, so a note citing three passages does not always
  // ask about the same one.
  const answer = acceptable[Math.floor(random() * acceptable.length)];

  // Everything acceptable, plus everything the caller barred, is off the table as a distractor.
  const barred = new Set([...acceptable, ...(input.exclude ?? [])].map(normalise));

  const take = (source: readonly string[]): string[] => {
    const out: string[] = [];
    for (const candidate of source) {
      const value = candidate.trim();
      if (!value || barred.has(normalise(value))) continue;
      barred.add(normalise(value));
      out.push(value);
    }
    return out;
  };

  const own = take(input.pool);
  const fallback = take(input.fallbackPool ?? []);
  if (own.length + fallback.length < optionCount - 1) return null;

  const picked: string[] = [];
  for (const tier of [own, fallback]) {
    const remaining = [...tier];
    while (picked.length < optionCount - 1 && remaining.length) {
      picked.push(remaining.splice(Math.floor(random() * remaining.length), 1)[0]);
    }
  }

  const answerIndex = Math.floor(random() * optionCount);
  const options = [...picked];
  options.splice(answerIndex, 0, answer);

  return { options, answerIndex };
}

/**
 * Did the reader pick an acceptable answer?
 *
 * Checked against `acceptable` rather than against `options[answerIndex]`, so a question with
 * several right answers marks correctly however the build seeded it. Compared loosely: these
 * are display strings, and a difference of case or spacing is not a wrong answer.
 */
export function gradeChoiceExercise(
  exercise: ChoiceExercise,
  chosen: string,
  acceptable: readonly string[],
): boolean {
  const picked = normalise(chosen ?? '');
  if (!picked) return false;
  // Must be one of the options actually offered — a client inventing a correct-looking string
  // has not answered the question.
  if (!exercise.options.some((option) => normalise(option) === picked)) return false;
  return acceptable.some((value) => normalise(value) === picked);
}
