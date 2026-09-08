/**
 * One taste of Review for an account that does not have it.
 *
 * The line that had to be drawn: a sample is a real, marked question or it is a screenshot.
 * A screenshot is what every paywall already shows. So this is the fill-in-the-blanks rung —
 * the one people picture when they think "commit a verse to memory" — built and graded by
 * the same code the paid feature uses, on the same attempt rule it uses, with the verse shown
 * afterwards the way it always is.
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

export interface ReviewSampleExercise {
  cloze: VerseClozeSegments;
  blankCount: number;
}

/** The exercise the reader sees. Null where the verse is too short to hide anything in. */
export function buildSampleExercise(text: string, seed: string): ReviewSampleExercise | null {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length < SAMPLE_MIN_WORDS) return null;
  const cloze = buildVerseCloze(text, seed, SAMPLE_CLOZE_RATIO);
  if (cloze.blanks.length === 0) return null;
  return { cloze: clozeSegments(cloze), blankCount: cloze.blanks.length };
}

/** The grader rebuilds the same cloze from the same seed, so it marks what was asked. */
export function gradeSampleAnswer(text: string, seed: string, words: readonly string[]): boolean {
  const cloze = buildVerseCloze(text, seed, SAMPLE_CLOZE_RATIO);
  return gradeVerseRebuild(cloze, words);
}
