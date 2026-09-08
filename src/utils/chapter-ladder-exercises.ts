/**
 * Four exercises about a chapter the reader sat with, every one keyed to the chapter's own text
 * or to the curated index — never to the reader's words.
 *
 * The sibling of `verse-ladder-exercises.ts`, and built out of its parts: `buildChoiceExercise`
 * for the taps, `buildVerseCloze` for the finish, and `VerseSequenceExercise`'s shape for the
 * ordering so the dock needs no new branch to render any of them. What is new is only what is
 * genuinely about a chapter — choosing *which* verse, drawing from the chapter's thirds, and the
 * names too obvious or too weighty to be an answer.
 *
 * Seeded and deterministic, like everything Review builds. The list, the reveal and the grader
 * rebuild the same exercise from the same seed; each exercise salts the seed with its own name
 * so two on one step do not correlate.
 */

import { buildChoiceExercise, gradeChoiceExercise, type ChoiceExercise } from '@/utils/choice-exercise';
import { buildVerseCloze, hashSeed, mulberry32, seededIndex, verseCue, type VerseCloze } from '@/utils/verse-cloze';
import {
  VERSE_NEXT_CUE_WORDS,
  contentWords,
  type VerseSequenceExercise,
} from '@/utils/verse-ladder-exercises';
import { buildVersePerson } from '@/utils/verse-knowledge-exercises';
import type { ChapterVerse } from '@/utils/chapter-text';

/** Openings are eight words, as on every rung that shows the start of a verse. */
export const CHAPTER_CUE_WORDS = VERSE_NEXT_CUE_WORDS;

/** An opening with fewer content words than this is "And he said to them" — not a cue. */
const MIN_CUE_CONTENT_WORDS = 2;

/**
 * How many opening words two verses may share before one is no distractor for the other.
 *
 * Synoptic parallels and the Psalms open verbatim — "Praise the LORD" heads a dozen — and a
 * choice between two identical openings is not a choice. Four words catches the shared
 * formulae without barring verses that merely start with the same name.
 */
const PREFIX_GUARD_WORDS = 4;

/** Fewer verses than this and there is no order to put them in. */
export const MIN_ORDER_VERSES = 3;

/** A verse shorter than this cannot spare a word. */
const MIN_FINISH_WORDS = 6;

/**
 * Chapters offered as distractors when the reader has read too few of their own.
 *
 * Canonical book names, since these are fetched by reference. Well-known on purpose, for the
 * same reason the locate rung's fallback is: a stranger is not a distractor.
 */
export const WELL_KNOWN_CHAPTERS = [
  'Psalms 23',
  'John 1',
  'Romans 8',
  'Genesis 1',
  'Matthew 5',
  '1 Corinthians 13',
  'Isaiah 53',
  'Philippians 4',
  'Psalms 1',
  'Hebrews 11',
] as const;

const normaliseWords = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .split(/\s+/)
    .filter(Boolean);

/** The first few words, normalised, for telling two openings apart. */
export function openingPrefix(text: string, words = PREFIX_GUARD_WORDS): string {
  return normaliseWords(text).slice(0, words).join(' ');
}

/** The verses whose opening can stand on its own as a cue. */
export function chapterCueCandidates(verses: readonly ChapterVerse[]): ChapterVerse[] {
  return verses.filter(
    (verse) => contentWords(verseCue(verse.text, CHAPTER_CUE_WORDS)).length >= MIN_CUE_CONTENT_WORDS,
  );
}

export function pickSeeded<T>(items: readonly T[], seed: string): T | null {
  if (!items.length) return null;
  return items[seededIndex(seed, items.length)];
}

/** One opening from a chapter, seeded, for use as another chapter's distractor. */
export function chapterCueFor(verses: readonly ChapterVerse[], seed: string): string | null {
  const verse = pickSeeded(chapterCueCandidates(verses), seed);
  return verse ? verseCue(verse.text, CHAPTER_CUE_WORDS) : null;
}

// ─── chapter.verse: pick the verse that is in it ─────────────────────────────

export interface ChapterVerseExercise extends ChoiceExercise {
  /** The verse behind the right option, for the truth shown afterwards. Never sent. */
  verse: ChapterVerse;
}

/**
 * Four openings, one of them from this chapter.
 *
 * The distractors are openings of chapters the reader has read, then of well-known ones. Any
 * candidate that opens like the answer is dropped first — see `PREFIX_GUARD_WORDS`.
 */
export function buildChapterVerse(input: {
  verses: readonly ChapterVerse[];
  /** Openings (or verse texts) from other chapters the reader has read. */
  distractorTexts: readonly string[];
  fallbackTexts?: readonly string[];
  seed: string;
}): ChapterVerseExercise | null {
  const seed = `${input.seed}:verse`;
  const verse = pickSeeded(chapterCueCandidates(input.verses), seed);
  if (!verse) return null;
  const answer = verseCue(verse.text, CHAPTER_CUE_WORDS);
  const prefix = openingPrefix(answer);
  const cues = (texts: readonly string[]) =>
    texts
      .map((text) => verseCue(text, CHAPTER_CUE_WORDS))
      .filter((cue) => cue && openingPrefix(cue) !== prefix);
  const choice = buildChoiceExercise({
    answers: [answer],
    pool: cues(input.distractorTexts),
    fallbackPool: cues(input.fallbackTexts ?? []),
    seed,
  });
  return choice ? { ...choice, verse } : null;
}

export function gradeChapterVerse(exercise: ChapterVerseExercise, option: string): boolean {
  return gradeChoiceExercise(exercise, option, [exercise.options[exercise.answerIndex]]);
}

// ─── chapter.order: put these in the order they come ─────────────────────────

export interface ChapterOrderExercise extends VerseSequenceExercise {
  /** The three verses in their true order, for the truth shown afterwards. Never sent. */
  verses: ChapterVerse[];
}

/**
 * Three openings, one from each third of the chapter, shuffled.
 *
 * Thirds rather than any three: verses 4, 5 and 6 in order is a question about digits, and
 * one from the start, middle and end asks how the chapter moves. The draw redraws a few times
 * past an opening with nothing in it or one that collides with a cue already taken, and gives
 * up rather than ask a bad question. Never shown solved: an identity shuffle swaps the first
 * two.
 */
export function buildChapterOrder(input: {
  verses: readonly ChapterVerse[];
  seed: string;
}): ChapterOrderExercise | null {
  const verses = input.verses;
  const n = verses.length;
  if (n < MIN_ORDER_VERSES) return null;
  const random = mulberry32(hashSeed(`${input.seed}:order`));

  const thirds = [0, 1, 2].map((i) =>
    verses.slice(Math.floor((i * n) / 3), Math.floor(((i + 1) * n) / 3)),
  );
  const chosen: ChapterVerse[] = [];
  const cues: string[] = [];
  for (const third of thirds) {
    let picked: { verse: ChapterVerse; cue: string } | null = null;
    for (let attempt = 0; attempt < 6 && third.length; attempt++) {
      const verse = third[Math.floor(random() * third.length)];
      const cue = verseCue(verse.text, CHAPTER_CUE_WORDS);
      if (contentWords(cue).length < MIN_CUE_CONTENT_WORDS) continue;
      if (cues.some((taken) => openingPrefix(taken) === openingPrefix(cue))) continue;
      picked = { verse, cue };
      break;
    }
    if (!picked) return null;
    chosen.push(picked.verse);
    cues.push(picked.cue);
  }

  // shuffled[i] = which original position sits at display position i.
  const shuffled = [0, 1, 2];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  if (shuffled.every((original, position) => original === position)) {
    [shuffled[0], shuffled[1]] = [shuffled[1], shuffled[0]];
  }
  const phrases = shuffled.map((original) => cues[original]);
  // The answer: for each original position, where that opening now appears.
  const order = cues.map((_, original) => shuffled.indexOf(original));
  return { phrases, order, verses: chosen };
}

// ─── chapter.finish: finish this verse from it ───────────────────────────────

export interface ChapterFinishExercise {
  verse: ChapterVerse;
  cloze: VerseCloze;
}

/** A verse that can lose a word: long enough, and with something in it worth blanking. */
function canBeFinished(verse: ChapterVerse): boolean {
  if (verse.text.split(/\s+/).filter(Boolean).length < MIN_FINISH_WORDS) return false;
  return buildVerseCloze(verse.text, 'probe', 0.3).blanks.length >= 1;
}

/**
 * Which verses the finish rung may draw from: the ones the reader marked in this chapter when
 * they marked any, else every verse that can spare a word. The reader's own choice first, as on
 * every rung that has one to prefer.
 */
export function chapterFinishCandidates(
  verses: readonly ChapterVerse[],
  highlightedNumbers: readonly number[],
): ChapterVerse[] {
  const marked = verses.filter((verse) => highlightedNumbers.includes(verse.number) && canBeFinished(verse));
  if (marked.length) return marked;
  return verses.filter(canBeFinished);
}

export function buildChapterFinish(input: {
  verses: readonly ChapterVerse[];
  highlightedNumbers: readonly number[];
  seed: string;
  /** Share of content words hidden — `verseClozeRatio(pass)`, so later passes hide more. */
  ratio: number;
}): ChapterFinishExercise | null {
  const seed = `${input.seed}:finish`;
  const verse = pickSeeded(chapterFinishCandidates(input.verses, input.highlightedNumbers), seed);
  if (!verse) return null;
  const cloze = buildVerseCloze(verse.text, seed, input.ratio);
  return cloze.blanks.length ? { verse, cloze } : null;
}

// ─── chapter.person: pick who appears in it ──────────────────────────────────

/**
 * Names that are never an answer and never a distractor.
 *
 * As answers they are trivial — God appears in most chapters. As distractors they are worse
 * than trivial: offering "Jesus" as a wrong answer to "who appears in John 3" is a theological
 * claim the index did not make, and the app must not.
 */
export const BARRED_PERSON_LABELS: ReadonlySet<string> = new Set([
  'god',
  'the lord',
  'lord',
  'jesus',
  'jesus christ',
  'christ',
  'holy spirit',
  'the holy spirit',
]);

export function askablePeople(names: readonly string[]): string[] {
  return names.filter((name) => !BARRED_PERSON_LABELS.has(name.trim().toLowerCase()));
}

/**
 * Four names, one of them placed in this chapter by the index. Any person in the chapter is a
 * right answer; every person in it is barred from being a wrong one.
 */
export function buildChapterPerson(input: {
  /** Everyone the index places in the chapter, barred names included. */
  people: readonly string[];
  /** People from other chapters the reader has read. */
  pool: readonly string[];
  fallbackPool?: readonly string[];
  seed: string;
}): ChoiceExercise | null {
  const answers = askablePeople(input.people);
  if (!answers.length) return null;
  return buildVersePerson({
    answers,
    onVerse: input.people,
    pool: askablePeople(input.pool),
    fallbackPool: askablePeople(input.fallbackPool ?? []),
    seed: `${input.seed}:person`,
  });
}
