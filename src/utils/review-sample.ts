/**
 * One taste of Review for an account that does not have it.
 *
 * The line that had to be drawn: a sample is a real, marked question or it is a screenshot.
 * A screenshot is what every paywall already shows. So these are real rungs — built and graded
 * by the same code the paid feature uses, on the same attempt rule it uses, with the verse shown
 * afterwards the way it always is.
 *
 * **Four of them, and the reader picks.** It was one, fill-in-the-blanks, which is the exercise
 * people picture when they think "commit a verse to memory" and so the right one to open on. But
 * a feature whose claim is that it varies what it asks made that claim through a card that only
 * ever did one thing. The other three are the ones keyed to nothing but the verse's own text, so
 * a free account needs no history for them to work. They wear the same names the paid rungs wear
 * — Blanks, First letters, Order, What follows — so the word learned on the sample is the word
 * seen again inside the feature and in its settings.
 *
 * What it is deliberately not. Not a queue: nothing is written, no ReviewItems row, no event,
 * so a free account cannot accumulate state for a feature it has not paid for. Not the
 * engine: the readiness gate asks for days and signals a fresh account cannot have, and a
 * sample that bypassed it would ask about a verse touched once — the exact experience the
 * gate exists to prevent. Instead the sample takes the passage the reader has been around
 * most where one exists, and a well-known verse where nothing does, and says which.
 *
 * Deterministic per reader per day: the same question on every open, so an answer given in
 * the morning is the answer to the question still on screen in the afternoon, and the grader
 * rebuilds exactly what was asked.
 */
import { buildVerseCloze, clozeSegments, gradeVerseRebuild, seededIndex, type VerseClozeSegments } from './verse-cloze';
import {
  buildVerseInitials,
  buildVerseNext,
  buildVerseSequence,
  gradeVerseInitials,
  gradeVerseNext,
  markVerseSequence,
} from './verse-ladder-exercises';

/** Where nothing of the reader's own is usable: verses most people half-know already. */
export const SAMPLE_FALLBACK_REFERENCES = ['John 3:16', 'Psalm 23:1', 'Romans 8:28', 'Philippians 4:13'] as const;

/** The gentlest pass — a third of the content words hidden, never more. */
export const SAMPLE_CLOZE_RATIO = 0.3;

/** A verse has to have enough words to hide a few and still read as a verse. */
export const SAMPLE_MIN_WORDS = 8;

export type SampleSource = 'yours' | 'well-known';

export interface ReviewSampleSpec {
  reference: string;
  source: SampleSource;
}

/** The same seed for the list, the grader, and the reveal, per reader per local day. */
export function sampleSeed(userId: string, dayKey: string): string {
  return `sample:${userId}:${dayKey}`;
}

/**
 * Which verse to ask about.
 *
 * The reader's own passages first, and only where the text is long enough to hide a few words;
 * a well-known verse where nothing of theirs fits.
 *
 * **Chosen by the day on both paths.** This took the *first* usable reference of their own, so
 * a reader with any passage at all met the identical verse every morning — only the blanks
 * moving — while the docblock promised the opposite. The one question a free account is
 * offered was the same question forever, which is a poor argument for a feature whose whole
 * claim is that it varies what it asks.
 */
export function pickSampleReference(input: {
  ownReferences: readonly string[];
  seed: string;
}): ReviewSampleSpec {
  const own = input.ownReferences.map((reference) => reference.trim()).filter(Boolean);
  if (own.length) return { reference: own[seededIndex(input.seed, own.length)], source: 'yours' };
  const fallback = SAMPLE_FALLBACK_REFERENCES[seededIndex(input.seed, SAMPLE_FALLBACK_REFERENCES.length)];
  return { reference: fallback, source: 'well-known' };
}

/**
 * The exercises a free account may try, in the order the chips show them.
 *
 * Every one is keyed to the verse's own text and nothing else — no notes, no highlights, no
 * history — which is what makes them fair to offer someone who has none of those yet. The ids
 * are the paid feature's own family ids, deliberately: see `review-exercise-families.ts`.
 */
export const SAMPLE_EXERCISES = ['blanks', 'letters', 'order', 'next'] as const;
export type SampleExercise = (typeof SAMPLE_EXERCISES)[number];

export const DEFAULT_SAMPLE_EXERCISE: SampleExercise = 'blanks';

export function isSampleExercise(value: unknown): value is SampleExercise {
  return typeof value === 'string' && (SAMPLE_EXERCISES as readonly string[]).includes(value);
}

/** What the reader is shown. The answer key never appears in any variant. */
export type ReviewSampleExercise =
  | { kind: 'blanks'; cloze: VerseClozeSegments; blankCount: number }
  | { kind: 'letters'; initials: string; wordCount: number }
  | { kind: 'order'; phrases: string[] }
  | { kind: 'next'; options: string[] };

/**
 * What each exercise needs beyond the verse itself.
 *
 * Only "what follows" needs anything: the verse after this one, and a few neighbours to sit
 * beside it. The server fetches those; this stays pure so the same code marks and builds.
 */
export interface SampleMaterial {
  text: string;
  nextText?: string | null;
  neighbourTexts?: readonly string[];
}

/** A seed per exercise, so switching chips gives a fresh question on the same verse. */
export function sampleExerciseSeed(seed: string, kind: SampleExercise): string {
  return `${seed}:${kind}`;
}

/**
 * The exercise the reader sees. Null where this verse cannot carry this kind of question —
 * a verse too short to hide words in, one at the end of a book with nothing following it.
 */
export function buildSampleExercise(
  material: SampleMaterial,
  seed: string,
  kind: SampleExercise = DEFAULT_SAMPLE_EXERCISE,
): ReviewSampleExercise | null {
  const text = material.text;
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length < SAMPLE_MIN_WORDS) return null;
  const salted = sampleExerciseSeed(seed, kind);

  if (kind === 'blanks') {
    const cloze = buildVerseCloze(text, salted, SAMPLE_CLOZE_RATIO);
    if (cloze.blanks.length === 0) return null;
    return { kind, cloze: clozeSegments(cloze), blankCount: cloze.blanks.length };
  }
  if (kind === 'letters') {
    const built = buildVerseInitials(text);
    return built ? { kind, initials: built.initials, wordCount: built.wordCount } : null;
  }
  if (kind === 'order') {
    const built = buildVerseSequence(text, salted);
    // `order` is the answer key and stays here.
    return built ? { kind, phrases: built.phrases } : null;
  }
  if (!material.nextText) return null;
  const built = buildVerseNext({
    answerText: material.nextText,
    neighbourTexts: material.neighbourTexts ?? [],
    seed: salted,
  });
  // `answerIndex` stays here, for the same reason it stays on every paid rung.
  return built ? { kind, options: built.options } : null;
}

/** Which of the four this verse can actually carry, for the chips to offer. */
export function availableSampleExercises(material: SampleMaterial, seed: string): SampleExercise[] {
  return SAMPLE_EXERCISES.filter((kind) => buildSampleExercise(material, seed, kind) !== null);
}

/** What a reader sends back, one field per exercise. */
export interface SampleAnswer {
  words?: readonly string[];
  text?: string;
  order?: readonly number[];
  option?: string;
}

/**
 * The grader rebuilds the same question from the same seed, so it marks what was asked.
 *
 * A verse the chosen exercise cannot be built from is wrong rather than right: the reader was
 * never shown that question, and marking an unasked question correct would be worse than
 * marking it incorrect.
 */
export function gradeSampleAnswer(
  material: SampleMaterial,
  seed: string,
  kind: SampleExercise,
  answer: SampleAnswer,
): boolean {
  const salted = sampleExerciseSeed(seed, kind);
  const text = material.text;

  if (kind === 'blanks') {
    const cloze = buildVerseCloze(text, salted, SAMPLE_CLOZE_RATIO);
    return gradeVerseRebuild(cloze, answer.words ?? []);
  }
  if (kind === 'letters') {
    return gradeVerseInitials(text, answer.text ?? '');
  }
  if (kind === 'order') {
    const built = buildVerseSequence(text, salted);
    if (!built) return false;
    return markVerseSequence(built, answer.order ?? []).correct;
  }
  if (!material.nextText) return false;
  const built = buildVerseNext({
    answerText: material.nextText,
    neighbourTexts: material.neighbourTexts ?? [],
    seed: salted,
  });
  return built ? gradeVerseNext(built, answer.option ?? '') : false;
}
