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

import {
  MIN_BLANK_LENGTH,
  STOPWORDS,
  bareWord,
  clozeSegments,
  hashSeed,
  markVerseRebuild,
  mulberry32,
  verseCue,
  type VerseClozeBlank,
  type VerseClozeSegments,
} from '@/utils/verse-cloze';
import {
  RECALL_LEAD_IN_WORDS,
  RECALL_SHOWN_SHARE,
  VERSE_KEYWORDS_MIN_COUNT,
  type ReviewTier,
  type VerseRecallMode,
} from '@/utils/review-difficulty';
import type { RecallState } from '@/utils/review-item-kinds';
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
  return markVerseSequence(exercise, answer).correct;
}

/** Per placed position, so the phrases already in the right place can stay there. */
export function markVerseSequence(
  exercise: VerseSequenceExercise,
  answer: readonly number[],
): { correct: boolean; parts: boolean[] } {
  const parts = exercise.order.map((expected, index) => answer[index] === expected);
  return { correct: answer.length === exercise.order.length && parts.every(Boolean), parts };
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
/**
 * A span the reader marked while reading, fit to be the fragment a rung shows.
 *
 * "Prefer what the reader marked" is the rule the note rungs already follow; this is its verse
 * half. The span has to be at least a few words — "bribes" is a bookmark, not a fragment — and
 * has to actually occur in the verse as this translation reads it, or the rung would be asking
 * where a line is from that the text does not contain. A long span is cut to the first dozen
 * words: past that it is the verse, not a fragment of it.
 */
export const READER_SPAN_MIN_WORDS = 3;
export const READER_SPAN_MAX_WORDS = 12;

export function readerSpanFragment(excerpt: string | null | undefined, verseText: string): string | null {
  const words = (excerpt ?? '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (words.length < READER_SPAN_MIN_WORDS) return null;
  const span = words.slice(0, READER_SPAN_MAX_WORDS).join(' ');
  const normalise = (s: string) => s.replace(/\s+/g, ' ').toLowerCase();
  if (!normalise(verseText).includes(normalise(span))) return null;
  return span;
}

/**
 * "Pick the words you marked in this verse."
 *
 * The reader dragged a highlighter over part of a verse; the question is whether they can find
 * that part again among windows of the same verse they did not mark. It is the smallest question
 * in the product and one of the few whose answer is entirely theirs — no editor, no index, no
 * reading of the text, just what they chose to underline.
 *
 * **The distractors are the hard part.** They are other windows of *the same verse*, cut to the
 * same length as the span, and none may overlap it: a window sharing three of the span's five
 * words is not a wrong answer, it is a second right one wearing a disguise. Where the verse is
 * too short to yield enough non-overlapping windows, neighbouring verses supply the rest — cut
 * at word boundaries, same length, so the four options read alike and only the marking tells
 * them apart.
 */
/** Four windows of the same length: the one they marked, and three they did not. */
const MARKED_OPTION_COUNT = 4;

export function buildVerseMarked(input: {
  /** The verse the reader marked, plain text. */
  verseText: string;
  /** Verses either side, for when the verse itself cannot spare enough windows. */
  neighbourTexts: readonly string[];
  /** The span they marked, already floored by `readerSpanFragment`. */
  span: string;
  seed: string;
}): ChoiceExercise | null {
  const span = input.span.replace(/\s+/g, ' ').trim();
  const spanWords = span.split(' ').filter(Boolean);
  if (spanWords.length < READER_SPAN_MIN_WORDS) return null;

  const normalise = (value: string) => value.replace(/\s+/g, ' ').toLowerCase().trim();
  const verseWords = input.verseText.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const spanAt = indexOfWords(verseWords, spanWords);
  if (spanAt < 0) return null;

  const windows: string[] = [];
  const push = (words: readonly string[], from: number) => {
    const window = words.slice(from, from + spanWords.length);
    if (window.length !== spanWords.length) return;
    const text = window.join(' ');
    // Whole words only, and never a window carrying any part of what they marked.
    if (overlapsSpan(text, span)) return;
    if (windows.some((taken) => normalise(taken) === normalise(text))) return;
    windows.push(text);
  };

  // The verse's own windows first: a distractor from the same sentence is the fairest one.
  for (let i = 0; i + spanWords.length <= verseWords.length; i++) {
    if (i + spanWords.length > spanAt && i < spanAt + spanWords.length) continue;
    push(verseWords, i);
  }
  for (const neighbour of input.neighbourTexts) {
    const words = neighbour.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
    for (let i = 0; i + spanWords.length <= words.length; i += spanWords.length) push(words, i);
  }

  return buildChoiceExercise({
    answers: [span],
    pool: windows,
    optionCount: MARKED_OPTION_COUNT,
    seed: `${input.seed}:marked`,
  });
}

/** Where `needle` begins inside `haystack`, comparing bare words. -1 when it is not there. */
function indexOfWords(haystack: readonly string[], needle: readonly string[]): number {
  const bare = (value: string) => value.replace(/[^\p{L}\p{N}']/gu, '').toLowerCase();
  for (let i = 0; i + needle.length <= haystack.length; i++) {
    let hit = true;
    for (let j = 0; j < needle.length; j++) {
      if (bare(haystack[i + j]) !== bare(needle[j])) {
        hit = false;
        break;
      }
    }
    if (hit) return i;
  }
  return -1;
}

/** True when a candidate shares any content word with the marked span. */
function overlapsSpan(candidate: string, span: string): boolean {
  const bare = (value: string) => value.replace(/[^\p{L}\p{N}']/gu, '').toLowerCase();
  const marked = new Set(
    span.split(' ').map(bare).filter((word) => word.length > 2 && !STOPWORDS.has(word)),
  );
  if (!marked.size) return false;
  return candidate.split(' ').map(bare).some((word) => marked.has(word));
}

/** True when the reader picked the words they had actually marked. */
export function gradeVerseMarked(exercise: ChoiceExercise, chosen: string, span: string): boolean {
  return gradeChoiceExercise(exercise, chosen, [span]);
}

export function buildVerseLocate(
  reference: string,
  text: string,
  poolReferences: readonly string[],
  seed: string,
  /** A fragment the reader marked themselves, preferred over the middle of the verse. */
  readerPhrase: string | null = null,
  /** Same-book passages first; the canned list is always last. */
  fallbackPool: readonly string[] = FALLBACK_REFERENCES,
): VerseLocateExercise | null {
  const phrase = readerPhrase ?? locatePhrase(text);
  if (!phrase) return null;

  const answer = reference.trim();
  if (!answer) return null;

  const choice = buildChoiceExercise({
    answers: [answer],
    pool: poolReferences,
    fallbackPool: [...fallbackPool, ...FALLBACK_REFERENCES.filter((r) => !fallbackPool.includes(r))],
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

/**
 * The first rung: given the reference, pick the words that belong to it.
 *
 * The strategy doc's first stage is "use a small cue to identify what was studied" —
 * recognition. What shipped instead asked the reader to write the verse out from memory, which
 * is the hardest thing on the ladder standing at its foot: the first question anyone ever met
 * on a new verse was the one they were least able to answer. This is the inverse of `locate`
 * (a fragment, pick the reference) and shares its options with `next` (openings, not whole
 * verses), so the reader is choosing between things that all look like plausible beginnings.
 */
export function buildVerseRecognize(input: {
  answerText: string;
  poolTexts: readonly string[];
  seed: string;
}): VerseNextExercise | null {
  const answer = verseCue(input.answerText, VERSE_NEXT_CUE_WORDS);
  if (!answer) return null;

  const pool = input.poolTexts.map((text) => verseCue(text, VERSE_NEXT_CUE_WORDS)).filter(Boolean);
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
/**
 * The words of a verse that carry it: long enough to be worth recalling, not a stopword.
 *
 * Split on dashes as well as spaces. The NET sets clauses with em dashes and no spaces — "and
 * I in him—bears much fruit" — so "him—bears" arrived as one token, and a token like that can
 * never match anything a reader types. It counted against them on every rung built from these
 * words, and made a perfect answer unmarkable.
 */
export function contentWords(text: string): string[] {
  return text
    .trim()
    .split(/[\s\u2013\u2014—–-]+/)
    .map((token) => bareWord(token))
    .filter((word) => word.length >= MIN_BLANK_LENGTH && !STOPWORDS.has(word.toLowerCase()));
}

const normaliseWord = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

/**
 * "I a t v; y a t b." — the classic memory-verse aid, punctuation kept where it was.
 *
 * Staged, because the full skeleton is a hard question and this is an *opening* rung: step 1 of
 * the verse ladder draws between this and the cloze, so roughly half of all new verses met
 * "write the whole thing from its first letters" as the very first thing Review ever asked
 * them. Graded on every content word, all-or-nothing, with no per-part feedback — a reader who
 * missed one word of eighteen saw a bare "not this one" three times running.
 *
 * At tier 0 and 1 a *share* of the content words is reduced and the rest of the verse is shown
 * in full, so the line still reads as a sentence and the reduced words can be typed in place.
 * Only tier 2 is the whole-verse skeleton this rung started as.
 */
export interface VerseInitialsExercise {
  /** The line as displayed, with the chosen words standing on their first letter. */
  initials: string;
  wordCount: number;
  tier: ReviewTier;
  /**
   * Which words were reduced, in order. **Server-only** — this is the answer key, and it never
   * goes in a payload. The client gets `segments` and the letters, which is the question.
   */
  reduced: VerseClozeBlank[];
  /**
   * Tier 0 and 1: the line split at each reduced word, so they are inputs in place rather than
   * a whole verse retyped into a box. Absent at tier 2, where the exercise is the free-text
   * skeleton and there is nothing to split.
   */
  segments?: VerseClozeSegments & { letters: string[] };
}

/** Below this there is not enough verse for the rung to be worth asking. */
const INITIALS_MIN_WORDS = 4;

export function buildVerseInitials(
  text: string,
  seed = '',
  share = 1,
  recallState?: RecallState | null,
): VerseInitialsExercise | null {
  const tokens = text.trim().split(/\s+/).filter(Boolean);
  if (tokens.length < INITIALS_MIN_WORDS) return null;

  const wordCount = tokens.filter((token) => bareWord(token)).length;
  if (wordCount < INITIALS_MIN_WORDS) return null;

  const tier = share >= 1 ? 2 : share >= 0.5 ? 1 : 0;
  void recallState;

  /*
   * Tier 2 is the original: every word on its initial, nothing to split, free text.
   *
   * Kept byte-identical to what this function used to return, so a reader who has climbed to
   * the top of the rung meets exactly the exercise they were meeting before.
   */
  if (tier === 2) {
    const initials = tokens
      .map((token) => {
        const word = bareWord(token);
        if (!word) return token;
        const at = token.indexOf(word);
        return `${at > 0 ? token.slice(0, at) : ''}${word.charAt(0)}${token.slice(at + word.length)}`;
      })
      .join(' ');
    return { initials, wordCount, tier, reduced: [] };
  }

  /*
   * Below that, choose a share of the *content* words — the same eligibility the cloze uses, so
   * "the" and "and" are never the thing being asked for — and leave every other word whole.
   */
  const eligible: number[] = [];
  tokens.forEach((token, index) => {
    const word = bareWord(token);
    if (!word || word.length < MIN_BLANK_LENGTH) return;
    if (STOPWORDS.has(word.toLowerCase())) return;
    if (!token.includes(word)) return;
    eligible.push(index);
  });
  if (!eligible.length) return null;

  const target = Math.max(1, Math.min(eligible.length, Math.round(eligible.length * share)));
  const random = mulberry32(hashSeed(`${seed}:initials`));
  const pool = [...eligible];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const chosen = pool.slice(0, target).sort((a, b) => a - b);
  const reduced: VerseClozeBlank[] = chosen.map((index) => ({ index, word: bareWord(tokens[index]) }));

  const chosenSet = new Set(chosen);
  const initials = tokens
    .map((token, index) => {
      if (!chosenSet.has(index)) return token;
      const word = bareWord(token);
      const at = token.indexOf(word);
      return `${token.slice(0, at)}${word.charAt(0)}${token.slice(at + word.length)}`;
    })
    .join(' ');

  /*
   * The gaps, via the cloze splitter, so the spacing and the punctuation rules are the ones
   * already proved rather than a second implementation of them. The first letter is handed over
   * beside each gap instead of inside it — it is the hint, not part of the answer.
   */
  const base = clozeSegments({ tokens, blanks: reduced, display: '' });
  const letters = reduced.map((blank) => blank.word.charAt(0));

  return { initials, wordCount, tier, reduced, segments: { ...base, letters } };
}

/**
 * Tier 0 and 1: did each reduced word come back?
 *
 * The same per-slot marking the cloze uses, and for the same reason — the reader has been given
 * the first letter and the word's place in the sentence, so the exact word is a fair ask, and
 * telling them *which* one missed is what makes the retry worth having.
 */
export function markVerseInitialsParts(
  exercise: VerseInitialsExercise,
  answers: readonly string[],
): { correct: boolean; parts: boolean[] } {
  return markVerseRebuild({ tokens: [], blanks: exercise.reduced, display: '' }, answers);
}

/**
 * Tier 2: did the reader write the verse back from its first letters?
 *
 * Every content word must appear, in order, in what they wrote — a subsequence match, so
 * "the/a/and" slips and a paraphrased connective are not marked as forgetting. Case and
 * punctuation are forgiven for the same reason the cloze forgives them.
 *
 * Now returns `parts` and `reached` like `markVerseRecall`, which it never did: this was the one
 * produced rung in the feature that answered a miss with nothing but "no". `parts` indexes the
 * reader's own words, so showing it back marks their sentence rather than handing over the
 * verse's vocabulary.
 */
export function markVerseInitials(
  text: string,
  attempt: string,
): { correct: boolean; parts: boolean[]; reached: { matched: number; total: number } } {
  const wanted = contentWords(text).map(normaliseWord);
  const written = attempt.trim().split(/\s+/).filter(Boolean);
  const parts: boolean[] = [];
  let matched = 0;
  let i = 0;
  for (const word of written) {
    const normalised = normaliseWord(word);
    if (i < wanted.length && normalised === wanted[i]) {
      parts.push(true);
      matched += 1;
      i += 1;
      continue;
    }
    parts.push(false);
  }
  const total = wanted.length;
  return { correct: total > 0 && matched === total, parts, reached: { matched, total } };
}

/** The whole-verse form, for callers with nothing but a verdict to give (the free sample). */
export function gradeVerseInitials(text: string, attempt: string): boolean {
  return markVerseInitials(text, attempt).correct;
}

/**
 * Writing a verse out from memory, marked on how much of it you actually produced.
 *
 * The two rungs that ask for this used to mark nothing at all: you typed, pressed a button,
 * read the verse and decided for yourself. That is the strongest exercise in the feature
 * attached to the weakest feedback, and it is the first thing a new reader meets.
 *
 * Marking is deliberately forgiving, because the thing being tested is the verse and not your
 * typing. Only content words count — "the", "and", "a" slipping is not forgetting — case and
 * punctuation are ignored, and they need only appear **in order**, so an extra word or a
 * paraphrase between them costs nothing. What it measures is how much of the verse you
 * reached, against a share of its content words.
 *
 * The share is set for the one rung that asks for this — recall, which hands over nothing but
 * the reference. Insisting on all of a verse there would fail almost everyone almost always.
 * (The first rung used to ask for production too, at a higher share; it is a recognition tap
 * now, which is what its name always meant.)
 */
export const RECALL_MIN_SHARE = 0.45;

/**
 * How much of the verse is on screen before the reader writes the rest.
 *
 * This rung used to hand over the reference and nothing else, on a first meeting and on the
 * twentieth alike — the single hardest question in the feature, asked at full strength from the
 * first day. Staged now: finish the sentence, then carry on from its opening, then the bare
 * reference it always was.
 *
 * `shown` is what the card prints above the box; `hiddenText` is the only thing graded. Marking
 * against the whole verse while showing two thirds of it would mean a reader who finished it
 * perfectly still scored two thirds — the coverage floor is a share of *what was asked for*.
 */
export interface VerseRecallExercise {
  shown: string | null;
  hiddenText: string;
  mode: VerseRecallMode;
}

export function buildVerseRecall(text: string, mode: VerseRecallMode): VerseRecallExercise {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean || mode === 'reference') return { shown: null, hiddenText: clean, mode };

  const tokens = clean.split(' ').filter(Boolean);

  if (mode === 'leadIn') {
    if (tokens.length <= RECALL_LEAD_IN_WORDS + 1) return { shown: null, hiddenText: clean, mode };
    return {
      shown: tokens.slice(0, RECALL_LEAD_IN_WORDS).join(' '),
      hiddenText: tokens.slice(RECALL_LEAD_IN_WORDS).join(' '),
      mode,
    };
  }

  /*
   * "Finish it" cuts at a clause boundary rather than at a word count, so the reader is picking
   * up a sentence rather than resuming mid-phrase. The phrase splitter is the one the sequence
   * rung already uses; a verse it cannot split falls back to the word count, which is worse and
   * still answerable.
   */
  const phrases = splitVersePhrases(clean);
  if (phrases.length >= 2) {
    const target = Math.max(1, Math.round(phrases.length * RECALL_SHOWN_SHARE));
    const keep = Math.min(phrases.length - 1, target);
    return {
      shown: phrases.slice(0, keep).join(' '),
      hiddenText: phrases.slice(keep).join(' '),
      mode,
    };
  }

  const cut = Math.max(1, Math.min(tokens.length - 1, Math.round(tokens.length * RECALL_SHOWN_SHARE)));
  return { shown: tokens.slice(0, cut).join(' '), hiddenText: tokens.slice(cut).join(' '), mode };
}

export function verseRecallCoverage(text: string, attempt: string): number {
  const wanted = contentWords(text).map(normaliseWord);
  if (!wanted.length) return 0;
  const written = attempt.trim().split(/\s+/).map(normaliseWord).filter(Boolean);
  let matched = 0;
  let i = 0;
  for (const word of written) {
    // In order, but not consecutively: skip ahead to the next word of the verse this one is.
    const at = wanted.indexOf(word, i);
    if (at === -1) continue;
    matched += 1;
    i = at + 1;
  }
  return matched / wanted.length;
}

export function gradeVerseRecall(text: string, attempt: string, minShare: number): boolean {
  return markVerseRecall(text, attempt, minShare).correct;
}

/**
 * How much of the verse the reader reached, and which of *their own* words landed.
 *
 * `parts` indexes the words they typed, not the verse's — so showing it back marks their
 * sentence rather than handing over the verse's vocabulary. `reached` is the count that lets
 * the card say "five of the nine words that carry it" without naming any of them.
 */
export function markVerseRecall(
  text: string,
  attempt: string,
  minShare: number,
): { correct: boolean; parts: boolean[]; reached: { matched: number; total: number } } {
  const wanted = contentWords(text).map(normaliseWord);
  const written = attempt.trim().split(/\s+/).filter(Boolean);
  const parts: boolean[] = [];
  let matched = 0;
  let i = 0;
  for (const word of written) {
    const at = wanted.indexOf(normaliseWord(word), i);
    if (at === -1) {
      parts.push(false);
      continue;
    }
    parts.push(true);
    matched += 1;
    i = at + 1;
  }
  const total = wanted.length;
  return {
    correct: total > 0 && matched / total >= minShare,
    parts,
    reached: { matched, total },
  };
}

/** "Name three words from this verse." Free recall: the lightest rung on the ladder. */
export interface VerseKeywordsExercise {
  count: number;
}

/** The middle tier's count, and the value every caller used before the rung was staged. */
export const VERSE_KEYWORDS_COUNT = 3;

/**
 * `count` comes from the tier table. A verse without enough distinct content words to fill the
 * asked-for count falls back to what it can manage rather than refusing the rung — being asked
 * for two words of a short verse is a fine question, and the alternative is the step resolving
 * to something else entirely on exactly the verses where this rung reads best.
 */
export function buildVerseKeywords(text: string, count = VERSE_KEYWORDS_COUNT): VerseKeywordsExercise | null {
  const distinct = new Set(contentWords(text).map(normaliseWord));
  /*
   * Strictly more words than the smallest count asked for — the same rule the availability
   * probe applies, and it has to be the same or the step resolves to a rung the builder then
   * refuses. A verse with exactly as many content words as it is asked for is `verse.recall`
   * wearing input boxes.
   */
  if (distinct.size <= VERSE_KEYWORDS_MIN_COUNT) return null;
  return { count: Math.max(VERSE_KEYWORDS_MIN_COUNT, Math.min(count, distinct.size)) };
}

/** Each typed word is a distinct content word of the verse, in any order. */
export function gradeVerseKeywords(
  text: string,
  words: readonly string[],
  count = VERSE_KEYWORDS_COUNT,
): boolean {
  return markVerseKeywords(text, words, count).correct;
}

/**
 * Per word, aligned to the three inputs on screen.
 *
 * A word already used counts as wrong rather than as a second hit on the same one — three
 * inputs asking for three words of the verse, not one word typed three times. This is the
 * safest of all the per-part verdicts: every word judged is a word the reader produced, so
 * nothing about the rest of the verse is given away.
 */
export function markVerseKeywords(
  text: string,
  words: readonly string[],
  count = VERSE_KEYWORDS_COUNT,
): { correct: boolean; parts: boolean[] } {
  const wanted = new Set(contentWords(text).map(normaliseWord));
  const seen = new Set<string>();
  const parts = words.map((word) => {
    const normalised = normaliseWord(word);
    if (!normalised || seen.has(normalised) || !wanted.has(normalised)) return false;
    seen.add(normalised);
    return true;
  });
  return { correct: parts.length >= count && parts.every(Boolean), parts };
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
