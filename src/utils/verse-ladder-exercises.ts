/**
 * Two verse exercises the app can actually mark: put it back in order, and say where it is from.
 *
 * The rest of the ladder asks open questions with no right answer stored anywhere — the reader
 * judges their own recall, and Review never grades what they wrote. These two are different in
 * kind, and deliberately so: an ordering and a multiple choice have one correct answer that
 * comes from the *text*, not from a machine's reading of it. Nothing here evaluates a person's
 * interpretation, which is the line the whole feature refuses to cross.
 *
 * Both are seeded and deterministic, so the same rung of the same item is the same puzzle on
 * every device, and the answer key is recomputed on the server rather than sent to the client.
 *
 * Pure. `verse-cloze.ts` next door does the same job for the rebuild rung.
 */

import { hashSeed, mulberry32 } from '@/utils/verse-cloze';

// ─── Sequence: put the phrases back in order ─────────────────────────────────

export interface VerseSequenceExercise {
  /** The phrases as shown, shuffled. */
  phrases: string[];
  /** `order[i]` is the index in `phrases` of the phrase that belongs at position i. */
  order: number[];
}

/** Fewer than this and the puzzle is trivial; more and it is a memory test of the UI. */
const MIN_PHRASES = 3;
const MAX_PHRASES = 6;
/** A fragment shorter than this reads as debris rather than a phrase, and gets merged. */
const MIN_PHRASE_WORDS = 3;

/**
 * Split a verse into phrases at its own punctuation.
 *
 * Clause boundaries rather than a fixed word count, because a verse cut every five words gives
 * the reader nothing to reason about — the whole exercise is recognising how the sentence
 * moves. Short fragments merge into the phrase before them so that "and" or "for" is never a
 * chip on its own.
 */
export function splitVersePhrases(text: string): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return [];

  const raw = clean
    .split(/(?<=[,;:.!?—])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);

  const merged: string[] = [];
  for (const part of raw) {
    const words = part.split(' ').filter(Boolean).length;
    if (merged.length && words < MIN_PHRASE_WORDS) {
      merged[merged.length - 1] = `${merged[merged.length - 1]} ${part}`;
      continue;
    }
    merged.push(part);
  }

  // A verse with no internal punctuation still deserves the exercise: fall back to even-ish
  // word runs, which is worse than clause boundaries and better than refusing.
  if (merged.length < MIN_PHRASES) {
    const words = clean.split(' ').filter(Boolean);
    if (words.length < MIN_PHRASES * MIN_PHRASE_WORDS) return [];
    const size = Math.ceil(words.length / MIN_PHRASES);
    const chunks: string[] = [];
    for (let i = 0; i < words.length; i += size) chunks.push(words.slice(i, i + size).join(' '));
    return chunks;
  }

  if (merged.length <= MAX_PHRASES) return merged;

  // Too many: fold the tail into the last phrase rather than dropping the end of the verse.
  const head = merged.slice(0, MAX_PHRASES - 1);
  head.push(merged.slice(MAX_PHRASES - 1).join(' '));
  return head;
}

/** Seeded Fisher-Yates, so the same item and rung shuffle the same way everywhere. */
function shuffledIndices(count: number, seed: string): number[] {
  const random = mulberry32(hashSeed(seed));
  const indices = Array.from({ length: count }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices;
}

/**
 * Build the ordering puzzle. Returns null when the verse is too short to make one.
 *
 * `phrases` is what the reader sees. `order` is the answer key and never leaves the server.
 */
export function buildVerseSequence(text: string, seed: string): VerseSequenceExercise | null {
  const phrases = splitVersePhrases(text);
  if (phrases.length < MIN_PHRASES) return null;

  // shuffled[i] = which original phrase sits at display position i.
  const shuffled = shuffledIndices(phrases.length, seed);
  const displayed = shuffled.map((original) => phrases[original]);

  // The answer: for each original position, where that phrase now appears.
  const order = phrases.map((_, original) => shuffled.indexOf(original));

  // A shuffle that changed nothing is not a puzzle — rotate by one so there is always work.
  if (order.every((position, index) => position === index)) {
    const rotated = [...displayed.slice(1), displayed[0]];
    return { phrases: rotated, order: order.map((position) => (position + phrases.length - 1) % phrases.length) };
  }

  return { phrases: displayed, order };
}

/** True when the reader's arrangement matches the verse. */
export function gradeVerseSequence(
  exercise: VerseSequenceExercise,
  answer: readonly number[],
): boolean {
  if (answer.length !== exercise.order.length) return false;
  return exercise.order.every((expected, index) => answer[index] === expected);
}

// ─── Locate: which passage is this from? ─────────────────────────────────────

export interface VerseLocateExercise {
  /** A fragment of the verse, without its reference. */
  phrase: string;
  /** Four references, one of them right. */
  options: string[];
  /** Index into `options` of the correct reference. Never sent to the client. */
  answerIndex: number;
}

const LOCATE_OPTION_COUNT = 4;

/**
 * References used when the reader has not marked enough passages of their own.
 *
 * Well-known ones on purpose: a distractor the reader has never encountered is not a
 * distractor, it is noise, and guessing between "the one I recognise" and three strangers is
 * not the exercise.
 */
const FALLBACK_REFERENCES = [
  'John 3:16',
  'Romans 8:28',
  'Psalm 23:1',
  'Philippians 4:13',
  'Isaiah 40:31',
  'Proverbs 3:5',
  'Matthew 6:33',
  'Ephesians 2:8',
  'Genesis 1:1',
  'Hebrews 11:1',
];

/**
 * Build the "where is this from?" puzzle.
 *
 * Distractors come from the reader's own passages first — the question is about their study,
 * and telling Romans 8 from Ephesians 2 when you have worked in both is a real distinction.
 */
export function buildVerseLocate(
  reference: string,
  text: string,
  poolReferences: readonly string[],
  seed: string,
): VerseLocateExercise | null {
  const phrase = locatePhrase(text);
  if (!phrase) return null;

  const answer = reference.trim();
  if (!answer) return null;

  const seen = new Set([answer.toLowerCase()]);
  const dedupe = (source: readonly string[]): string[] => {
    const out: string[] = [];
    for (const candidate of source) {
      const value = candidate.trim();
      if (!value || seen.has(value.toLowerCase())) continue;
      seen.add(value.toLowerCase());
      out.push(value);
    }
    return out;
  };

  const own = dedupe(poolReferences);
  const canned = dedupe(FALLBACK_REFERENCES);
  if (own.length + canned.length < LOCATE_OPTION_COUNT - 1) return null;

  // The reader's own passages are exhausted before a canned one is used: a reference they have
  // never met is not a distractor, and would turn the question into "pick the familiar one".
  const random = mulberry32(hashSeed(seed));
  const picked: string[] = [];
  for (const tier of [own, canned]) {
    const remaining = [...tier];
    while (picked.length < LOCATE_OPTION_COUNT - 1 && remaining.length) {
      picked.push(remaining.splice(Math.floor(random() * remaining.length), 1)[0]);
    }
  }

  const answerIndex = Math.floor(random() * LOCATE_OPTION_COUNT);
  const options = [...picked];
  options.splice(answerIndex, 0, answer);

  return { phrase, options, answerIndex };
}

/** A middle fragment, so the opening words do not give the reference away. */
function locatePhrase(text: string): string | null {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (words.length < 6) return null;
  const start = Math.min(2, Math.max(0, words.length - 8));
  return words.slice(start, start + 8).join(' ');
}

/** True when the reader picked the right reference. Compared loosely — it is a display string. */
export function gradeVerseLocate(exercise: VerseLocateExercise, answer: string): boolean {
  const chosen = answer?.trim().toLowerCase();
  if (!chosen) return false;
  return exercise.options[exercise.answerIndex]?.trim().toLowerCase() === chosen;
}
