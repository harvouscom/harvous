/**
 * A church's own review questions: validation, the question a reader is shown, and marking.
 *
 * Three kinds staff can write — multiple choice, put in order, match the pairs — plus the two
 * passage kinds (`verse`, `chapter`) that ride the existing ladders and need nothing here but a
 * name. See docs/CHURCH_V2_ROADMAP.md §B and `ChurchReviewExercises` in server/db/schema.ts.
 *
 * **The key never leaves the server.** Each builder returns what the reader sees (options,
 * phrases, two columns) and, separately, the key the grader rebuilds from the same seed. Only
 * the first half is ever put in a payload — the same discipline as `ChoiceExercise.answerIndex`.
 *
 * **No generative AI.** Staff write every word; Harvous only shuffles them, from a seed, so two
 * devices show the same card and a retry after a miss shows a fresh arrangement.
 *
 * Pure and client-safe: the staff editor validates with the same rules the server enforces.
 */

import { hashSeed, mulberry32 } from '@/utils/verse-cloze';

export const CHURCH_EXERCISE_KINDS = ['verse', 'chapter', 'choice', 'order', 'match'] as const;
export type ChurchExerciseKind = (typeof CHURCH_EXERCISE_KINDS)[number];

/** The kinds staff write words for. The other two are passages. */
export const AUTHORED_CHURCH_EXERCISE_KINDS = ['choice', 'order', 'match'] as const;
export type AuthoredChurchExerciseKind = (typeof AUTHORED_CHURCH_EXERCISE_KINDS)[number];

export function isChurchExerciseKind(value: unknown): value is ChurchExerciseKind {
  return typeof value === 'string' && (CHURCH_EXERCISE_KINDS as readonly string[]).includes(value);
}

export function isAuthoredChurchExerciseKind(value: unknown): value is AuthoredChurchExerciseKind {
  return typeof value === 'string' && (AUTHORED_CHURCH_EXERCISE_KINDS as readonly string[]).includes(value);
}

export const CHURCH_EXERCISE_STATUSES = ['dismissed', 'draft', 'published', 'archived'] as const;
export type ChurchExerciseStatus = (typeof CHURCH_EXERCISE_STATUSES)[number];

export const CHURCH_PROMPT_MAX = 280;
export const CHURCH_OPTION_MAX = 120;
export const CHURCH_MATCH_LEFT_MAX = 80;
export const CHURCH_CHOICE_MIN = 3;
export const CHURCH_CHOICE_MAX = 5;
export const CHURCH_LIST_MIN = 3;
export const CHURCH_LIST_MAX = 6;

/** What a multiple-choice definition stores. `correctIndex` is into `options` as written. */
export interface ChurchChoiceContent {
  options: string[];
  correctIndex: number;
}

/** What an ordering definition stores: the items in their true order. */
export interface ChurchOrderContent {
  items: string[];
}

/** What a matching definition stores: each pair as written. */
export interface ChurchMatchContent {
  pairs: Array<{ left: string; right: string }>;
}

export type ChurchExerciseContent = ChurchChoiceContent | ChurchOrderContent | ChurchMatchContent;

export type ChurchExerciseValidation<T> =
  | { ok: true; value: T }
  | { ok: false; code: string; error: string };

/** Plain text only: tags stripped, whitespace collapsed. A question is not a note. */
export function cleanChurchText(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const sameText = (value: string) => value.toLowerCase();

function hasDuplicates(values: readonly string[]): boolean {
  const seen = new Set<string>();
  for (const value of values) {
    const key = sameText(value);
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
}

function fail(code: string, error: string): { ok: false; code: string; error: string } {
  return { ok: false, code, error };
}

/** Staff's question text, cleaned and bounded. */
export function validateChurchPrompt(value: unknown): ChurchExerciseValidation<string> {
  const prompt = cleanChurchText(value);
  if (!prompt) return fail('PROMPT_REQUIRED', 'Write the question');
  if (prompt.length > CHURCH_PROMPT_MAX) {
    return fail('PROMPT_TOO_LONG', `Keep the question under ${CHURCH_PROMPT_MAX} characters`);
  }
  return { ok: true, value: prompt };
}

function cleanList(raw: unknown, max: number): string[] | null {
  if (!Array.isArray(raw)) return null;
  const out = raw.map(cleanChurchText);
  return out.some((value) => value.length > max) ? null : out;
}

/**
 * Check what staff wrote, the same way on both sides of the wire.
 *
 * Bounds are about the card, not taste: more than five options or six pieces stops fitting on a
 * phone, and fewer than three is a coin toss rather than a question.
 */
export function validateChurchExerciseContent(
  kind: AuthoredChurchExerciseKind,
  raw: unknown,
): ChurchExerciseValidation<ChurchExerciseContent> {
  const input = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;

  if (kind === 'choice') {
    const options = cleanList(input.options, CHURCH_OPTION_MAX);
    if (!options) return fail('OPTION_TOO_LONG', `Keep each option under ${CHURCH_OPTION_MAX} characters`);
    if (options.some((option) => !option)) return fail('OPTION_EMPTY', 'Fill in every option, or remove it');
    if (options.length < CHURCH_CHOICE_MIN || options.length > CHURCH_CHOICE_MAX) {
      return fail('OPTION_COUNT', `Give ${CHURCH_CHOICE_MIN} to ${CHURCH_CHOICE_MAX} options`);
    }
    if (hasDuplicates(options)) return fail('OPTION_DUPLICATE', 'Two options say the same thing');
    const correctIndex = input.correctIndex;
    if (typeof correctIndex !== 'number' || !Number.isInteger(correctIndex) || correctIndex < 0 || correctIndex >= options.length) {
      return fail('CORRECT_REQUIRED', 'Mark which option is right');
    }
    return { ok: true, value: { options, correctIndex } };
  }

  if (kind === 'order') {
    const items = cleanList(input.items, CHURCH_OPTION_MAX);
    if (!items) return fail('ITEM_TOO_LONG', `Keep each piece under ${CHURCH_OPTION_MAX} characters`);
    if (items.some((item) => !item)) return fail('ITEM_EMPTY', 'Fill in every piece, or remove it');
    if (items.length < CHURCH_LIST_MIN || items.length > CHURCH_LIST_MAX) {
      return fail('ITEM_COUNT', `Give ${CHURCH_LIST_MIN} to ${CHURCH_LIST_MAX} pieces`);
    }
    // Two identical pieces would make two right answers the grader can only call one of.
    if (hasDuplicates(items)) return fail('ITEM_DUPLICATE', 'Two pieces say the same thing');
    return { ok: true, value: { items } };
  }

  const rawPairs = Array.isArray(input.pairs) ? input.pairs : null;
  if (!rawPairs) return fail('PAIR_COUNT', `Give ${CHURCH_LIST_MIN} to ${CHURCH_LIST_MAX} pairs`);
  const pairs = rawPairs.map((pair) => {
    const p = (pair && typeof pair === 'object' ? pair : {}) as Record<string, unknown>;
    return { left: cleanChurchText(p.left), right: cleanChurchText(p.right) };
  });
  if (pairs.some((pair) => !pair.left || !pair.right)) return fail('PAIR_EMPTY', 'Fill in both sides of every pair');
  if (pairs.some((pair) => pair.left.length > CHURCH_MATCH_LEFT_MAX)) {
    return fail('PAIR_TOO_LONG', `Keep the left side under ${CHURCH_MATCH_LEFT_MAX} characters`);
  }
  if (pairs.some((pair) => pair.right.length > CHURCH_OPTION_MAX)) {
    return fail('PAIR_TOO_LONG', `Keep the right side under ${CHURCH_OPTION_MAX} characters`);
  }
  if (pairs.length < CHURCH_LIST_MIN || pairs.length > CHURCH_LIST_MAX) {
    return fail('PAIR_COUNT', `Give ${CHURCH_LIST_MIN} to ${CHURCH_LIST_MAX} pairs`);
  }
  if (hasDuplicates(pairs.map((pair) => pair.left)) || hasDuplicates(pairs.map((pair) => pair.right))) {
    return fail('PAIR_DUPLICATE', 'Each side of every pair must be different from the others');
  }
  return { ok: true, value: { pairs } };
}

/** Read a stored definition back. Anything malformed is treated as no question at all. */
export function parseChurchExerciseContent(
  kind: string,
  raw: string | null | undefined,
): ChurchExerciseContent | null {
  if (!isAuthoredChurchExerciseKind(kind) || !raw) return null;
  try {
    const parsed = validateChurchExerciseContent(kind, JSON.parse(raw));
    return parsed.ok ? parsed.value : null;
  } catch {
    return null;
  }
}

// ─── What the reader sees ─────────────────────────────────────────────────────

/** Seeded Fisher-Yates over `count` positions. */
function shuffledIndices(count: number, seed: string): number[] {
  const random = mulberry32(hashSeed(seed));
  const indices = Array.from({ length: count }, (_, i) => i);
  for (let i = indices.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }
  return indices;
}

/** A shuffle that moved nothing is not a puzzle — rotate by one so there is always work. */
function shuffledOutOfOrder(count: number, seed: string): number[] {
  const shuffled = shuffledIndices(count, seed);
  if (count > 1 && shuffled.every((value, index) => value === index)) {
    return [...shuffled.slice(1), shuffled[0]];
  }
  return shuffled;
}

export interface ChurchChoiceExercise {
  /** Shown to the reader. */
  options: string[];
  /** Server only. */
  answerIndex: number;
}

export function buildChurchChoice(content: ChurchChoiceContent, seed: string): ChurchChoiceExercise {
  // shuffled[i] = which written option sits at display position i.
  const shuffled = shuffledIndices(content.options.length, seed);
  return {
    options: shuffled.map((original) => content.options[original]),
    answerIndex: shuffled.indexOf(content.correctIndex),
  };
}

/** Same shape as `VerseSequenceExercise`, so the dock's ordering card draws it unchanged. */
export interface ChurchOrderExercise {
  /** Shown to the reader, out of order. */
  phrases: string[];
  /** Server only: for each true position, where that piece now appears. */
  order: number[];
}

export function buildChurchOrder(content: ChurchOrderContent, seed: string): ChurchOrderExercise {
  const shuffled = shuffledOutOfOrder(content.items.length, seed);
  return {
    phrases: shuffled.map((original) => content.items[original]),
    order: content.items.map((_, original) => shuffled.indexOf(original)),
  };
}

export interface ChurchMatchExercise {
  /** Shown to the reader, both columns shuffled independently. */
  left: string[];
  right: string[];
  /** Server only: for each displayed left item, the index of its partner in `right`. */
  key: number[];
}

export function buildChurchMatch(content: ChurchMatchContent, seed: string): ChurchMatchExercise {
  const leftOrder = shuffledIndices(content.pairs.length, `${seed}:left`);
  /* The right column is shuffled *relative to the left*, never on its own: two independent
     shuffles sometimes agree, and then every partner sits beside its pair and the card has
     answered itself. `perm[j]` is which displayed left row the right item at `j` belongs to. */
  const perm = shuffledOutOfOrder(content.pairs.length, `${seed}:right`);
  return {
    left: leftOrder.map((pair) => content.pairs[pair].left),
    right: perm.map((row) => content.pairs[leftOrder[row]].right),
    key: leftOrder.map((_, row) => perm.indexOf(row)),
  };
}

// ─── Marking ─────────────────────────────────────────────────────────────────

const loose = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ');

/** By text, not index, and only against the options actually offered. */
export function gradeChurchChoice(exercise: ChurchChoiceExercise, chosen: string): boolean {
  const picked = loose(chosen ?? '');
  if (!picked) return false;
  const offered = exercise.options.map(loose);
  if (!offered.includes(picked)) return false;
  return offered[exercise.answerIndex] === picked;
}

export function markChurchOrder(
  exercise: ChurchOrderExercise,
  answer: readonly number[],
): { correct: boolean; parts: boolean[] } {
  const parts = exercise.order.map((expected, index) => answer[index] === expected);
  return { correct: answer.length === exercise.order.length && parts.every(Boolean), parts };
}

/**
 * `pairs[i]` is the index in `right` the reader matched to displayed left item `i`.
 * Per pair, so the ones already right can stay put on a retry.
 */
export function markChurchMatch(
  exercise: ChurchMatchExercise,
  pairs: readonly number[],
): { correct: boolean; parts: boolean[] } {
  const parts = exercise.key.map((expected, index) => pairs[index] === expected);
  return { correct: pairs.length === exercise.key.length && parts.every(Boolean), parts };
}

/** Parse a submitted match answer: at most six integers, each a valid column index. */
export function parseChurchMatchAnswer(raw: unknown, size: number): number[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > CHURCH_LIST_MAX) return null;
  const out: number[] = [];
  for (const value of raw) {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value >= size) return null;
    out.push(value);
  }
  return out;
}

/** The answer, said once the question is over — for the result card, never before. */
export function churchExerciseTruth(content: ChurchExerciseContent): string {
  if ('correctIndex' in content) return content.options[content.correctIndex] ?? '';
  if ('items' in content) return content.items.join(' → ');
  return content.pairs.map((pair) => `${pair.left} — ${pair.right}`).join('; ');
}
