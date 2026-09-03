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

import { MIN_BLANK_LENGTH, STOPWORDS, bareWord, hashSeed, mulberry32, verseCue } from '@/utils/verse-cloze';
import { buildChoiceExercise, gradeChoiceExercise, type ChoiceExercise } from '@/utils/choice-exercise';

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
 * A thin wrapper over `buildChoiceExercise` now that the note ladder needs the same shape about
 * a different subject. What stays here is what is genuinely about scripture: the fragment, and
 * the canned references for a reader who has not marked enough passages of their own.
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

  const choice = buildChoiceExercise({
    answers: [answer],
    pool: poolReferences,
    fallbackPool: FALLBACK_REFERENCES,
    optionCount: LOCATE_OPTION_COUNT,
    seed,
  });
  if (!choice) return null;

  return { phrase, options: choice.options, answerIndex: choice.answerIndex };
}

/** "What comes after this?" — the options are openings, not whole verses. */
export interface VerseNextExercise {
  /** What the reader picks between: the first few words of four verses. */
  options: string[];
  answerIndex: number;
}

/** Enough of a verse to recognise it, and few enough words to read four of them at a glance. */
export const VERSE_NEXT_CUE_WORDS = 8;
const NEXT_OPTION_COUNT = 4;

/**
 * Build "what comes after this?".
 *
 * The options are cues rather than whole verses for two reasons, and the second is the one that
 * matters: four full verses is a wall of text nobody reads, and a long option gives away its own
 * answer through subject matter — you can pick the one that sounds like a continuation without
 * remembering anything. Eight words is enough to recognise a verse you know and not enough to
 * reason your way to one you do not.
 *
 * The caller supplies neighbours from the same chapter. Distractors from elsewhere would test
 * whether the reader recognises the topic, which is not what the rung is for.
 */
export function buildVerseNext(input: {
  answerText: string;
  neighbourTexts: readonly string[];
  seed: string;
}): VerseNextExercise | null {
  const answer = verseCue(input.answerText, VERSE_NEXT_CUE_WORDS);
  if (!answer) return null;

  const pool = input.neighbourTexts
    .map((text) => verseCue(text, VERSE_NEXT_CUE_WORDS))
    .filter(Boolean);

  const choice = buildChoiceExercise({
    answers: [answer],
    pool,
    optionCount: NEXT_OPTION_COUNT,
    seed: input.seed,
  });
  if (!choice) return null;

  return { options: choice.options, answerIndex: choice.answerIndex };
}

/** True when the reader picked the verse that actually follows. */
export function gradeVerseNext(exercise: VerseNextExercise, answer: string): boolean {
  const shown = exercise.options[exercise.answerIndex];
  if (!shown) return false;
  return gradeChoiceExercise(exercise, answer, [shown]);
}

// ─── Text-keyed rungs: first letters, key words, which comes first, the book ─────────

/** The words in a verse worth recalling: not stopwords, not too short, in order. */
export function contentWords(text: string): string[] {
  return text
    .trim()
    .split(/\s+/)
    .map((token) => bareWord(token))
    .filter((word) => word.length >= MIN_BLANK_LENGTH && !STOPWORDS.has(word.toLowerCase()));
}

const normaliseWord = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

/** "I a t v; y a t b." — the classic memory-verse aid, punctuation kept where it was. */
export interface VerseInitialsExercise {
  initials: string;
  wordCount: number;
}

export function buildVerseInitials(text: string): VerseInitialsExercise | null {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (tokens.length < 4) return null;
  let wordCount = 0;
  const initials = tokens
    .map((token) => {
      const word = bareWord(token);
      if (!word) return token;
      wordCount += 1;
      const at = token.indexOf(word);
      const leading = at > 0 ? token.slice(0, at) : '';
      const trailing = token.slice(at + word.length);
      return `${leading}${word.charAt(0)}${trailing}`;
    })
    .join(' ');
  return wordCount >= 4 ? { initials, wordCount } : null;
}

/**
 * Did the reader write the verse back from its first letters?
 *
 * Every content word must appear, in order, in what they wrote — a subsequence match, so
 * "the/a/and" slips and a paraphrased connective are not marked as forgetting. Case and
 * punctuation are forgiven for the same reason the cloze forgives them.
 */
export function gradeVerseInitials(text: string, attempt: string): boolean {
  const wanted = contentWords(text).map(normaliseWord);
  if (!wanted.length) return false;
  const written = attempt.trim().split(/\s+/).map(normaliseWord).filter(Boolean);
  let i = 0;
  for (const word of written) {
    if (word === wanted[i]) i += 1;
    if (i === wanted.length) return true;
  }
  return false;
}

/** "Name three words from this verse." Free recall: the lightest rung on the ladder. */
export interface VerseKeywordsExercise {
  count: number;
}

export const VERSE_KEYWORDS_COUNT = 3;

export function buildVerseKeywords(text: string): VerseKeywordsExercise | null {
  const distinct = new Set(contentWords(text).map(normaliseWord));
  return distinct.size >= VERSE_KEYWORDS_COUNT ? { count: VERSE_KEYWORDS_COUNT } : null;
}

/** Each typed word is a distinct content word of the verse, in any order. */
export function gradeVerseKeywords(text: string, words: readonly string[]): boolean {
  const wanted = new Set(contentWords(text).map(normaliseWord));
  const given = new Set(words.map(normaliseWord).filter(Boolean));
  if (given.size < VERSE_KEYWORDS_COUNT) return false;
  for (const word of given) if (!wanted.has(word)) return false;
  return true;
}

/**
 * "Pick which comes first in John 15." Two openings from the same chapter, one of them the
 * verse in question; the answer is the lower verse number. The caller must never pass an
 * adjacent verse — "which comes first, 15:5 or 15:6" is a question about a digit.
 */
export interface VerseBeforeExercise {
  options: string[];
  answerIndex: number;
}

export function buildVerseBefore(input: {
  verse: { number: number; text: string };
  other: { number: number; text: string };
  seed: string;
}): VerseBeforeExercise | null {
  if (Math.abs(input.verse.number - input.other.number) < 2) return null;
  const a = verseCue(input.verse.text, VERSE_NEXT_CUE_WORDS);
  const b = verseCue(input.other.text, VERSE_NEXT_CUE_WORDS);
  if (!a || !b || a === b) return null;
  const earlier = input.verse.number < input.other.number ? a : b;
  const swap = hashSeed(input.seed) % 2 === 1;
  const options = swap ? [b, a] : [a, b];
  return { options, answerIndex: options.indexOf(earlier) };
}

export function gradeVerseBefore(exercise: VerseBeforeExercise, option: string): boolean {
  return gradeChoiceExercise(exercise, option, [exercise.options[exercise.answerIndex]]);
}

/**
 * "Pick the book this is from." The easier locate, offered when the reader's own reference pool
 * is too thin for a fair locate — see `verseFamilyMemberAvailable`. Options are books the reader
 * has cited, topped up from a fixed list of well-known ones.
 */
const WELL_KNOWN_BOOKS = ['Genesis', 'Psalms', 'Isaiah', 'Matthew', 'John', 'Romans', 'Hebrews', 'Revelation'];

export function buildVerseBook(input: {
  book: string;
  poolBooks: readonly string[];
  seed: string;
}): ChoiceExercise | null {
  const book = input.book.trim();
  if (!book) return null;
  return buildChoiceExercise({
    answers: [book],
    pool: input.poolBooks,
    fallbackPool: WELL_KNOWN_BOOKS,
    optionCount: LOCATE_OPTION_COUNT,
    seed: input.seed,
  });
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
  const shown = exercise.options[exercise.answerIndex];
  if (!shown) return false;
  return gradeChoiceExercise(exercise, answer, [shown]);
}
