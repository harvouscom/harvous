/**
 * The three questions Review asks about a note, and the rules that keep them honest.
 *
 * A note review used to be an open reflective question — "what made you write this?" — and
 * reading those back, they are not review questions at all. They are invitations to go and mark
 * something, and they have moved to Home as exactly that. What is left here is retrieval: a
 * question about your own note that you can be right about.
 *
 * **What may be graded, and what may not.** The answer key is always something the reader
 * themselves committed: a span they selected, a reference they typed, an edge they drew. It is
 * never a derivation. `NoteFingerprints.themes` and auto-generated tags are deliberately absent
 * from this file — grading those would grade a machine's reading of someone's study, which is
 * the line `verse-ladder-exercises.ts` refuses to cross and this file refuses with it.
 *
 * **Why the questions are about the note rather than its wording.** Quizzing someone on the
 * exact words of their own prose is a strange goal: you do not need to remember how you phrased
 * it, you need to remember what it was. So the *stem* quotes the reader's writing and the
 * *answer* is a fact they chose. That distinction is the whole design.
 *
 * Pure. The server brings the material; this decides the shape.
 */

import { buildChoiceExercise, gradeChoiceExercise, type ChoiceExercise } from '@/utils/choice-exercise';
import { hashSeed, mulberry32 } from '@/utils/verse-cloze';
import type { ReviewPromptKey } from '@/utils/review-prompts';
import { NOTE_LADDER } from '@/utils/review-prompts';

/** What a note can be asked, given what it actually has. */
export interface NoteMaterial {
  /** Enough body, or a highlighted span, to quote back. */
  canRecognize: boolean;
  /** It cites at least one passage. */
  canPassage: boolean;
  /** It is linked to at least one other note. */
  canConnect: boolean;
  /** A highlight in it carries words the reader typed, on a passage that can be named. */
  canAnnotation: boolean;
}

/**
 * The rung this note can actually be asked, starting from where it has climbed to.
 *
 * The verse ladder can assume its material — a verse always has text. A note cannot: one with
 * no links cannot be asked what it was linked to. So the stored `ladderStep` is a *nominal*
 * position and this resolves the effective one, walking forward and wrapping once.
 *
 * Returns null when the note can be asked nothing, which is a real answer: see the floor in
 * `review-opportunities.ts`. A note with no body, no passages and no links is not yet
 * reviewable, and inventing a question for it would mean inventing the answer too.
 */
export function resolveNoteRung(step: number, material: NoteMaterial): ReviewPromptKey | null {
  const can: Record<ReviewPromptKey, boolean> = {
    'note.recognize': material.canRecognize,
    'note.passage': material.canPassage,
    'note.connect': material.canConnect,
    'note.annotation': material.canAnnotation,
  } as Record<ReviewPromptKey, boolean>;

  const start = Number.isFinite(step) ? Math.max(0, Math.trunc(step)) % NOTE_LADDER.length : 0;
  for (let i = 0; i < NOTE_LADDER.length; i++) {
    const key = NOTE_LADDER[(start + i) % NOTE_LADDER.length];
    if (can[key]) return key;
  }
  return null;
}

// ─── Rung 0: which of your notes says this? ──────────────────────────────────

export interface NoteRecognizeExercise extends ChoiceExercise {
  /** The fragment of the reader's own writing that the question quotes. */
  fragment: string;
  /**
   * The same words as a marked span with its run-up, when the fragment is one the reader
   * highlighted rather than one the app picked. `fragment` stays as the flattened text.
   */
  span?: NoteSpan;
}

const OPTION_COUNT = 4;
/** Below this a fragment is not recognisable as anything, and the question is a coin toss. */
const MIN_FRAGMENT_WORDS = 6;
const FRAGMENT_WORDS = 12;

/**
 * A fragment to quote back, taken from the middle of the note.
 *
 * Never the opening words. The row and the dock both print the note's opening line as their
 * context line, so a question built from it would be printed directly above its own answer —
 * and `noteOptionLabel` below falls back to that same opening line for an untitled note.
 */
export function noteFragment(text: string, seed: string): string | null {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  if (words.length < MIN_FRAGMENT_WORDS) return null;
  if (words.length <= FRAGMENT_WORDS) return words.join(' ');

  const random = mulberry32(hashSeed(seed));
  // Start past the opening, and leave a whole fragment's worth before the end.
  const latest = words.length - FRAGMENT_WORDS;
  const earliest = Math.min(3, latest);
  const start = earliest + Math.floor(random() * Math.max(1, latest - earliest + 1));
  return words.slice(start, start + FRAGMENT_WORDS).join(' ');
}

/**
 * Does this label name *what* a note is, or only *when* it was written?
 *
 * Found in preview, not in design. Rung 0 came back offering "August 13, 2026", "Written 10 Jul",
 * "Written 26 Jun" and "August 16, 2026" — four dates, and no reader alive can say which day a
 * sentence came from. Daily notes are titled with their date, so a title is not by itself a name.
 *
 * A label that fails this is still fine to *show* once the answer is known; it is only barred from
 * being an option, and from being the answer, because the question would be unanswerable.
 */
export function labelNamesWhat(label: string): boolean {
  const value = label.trim();
  if (!value) return false;
  if (value.startsWith('Written ')) return false;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  /*
   * Months are named rather than pattern-matched. A bare `[A-Z][a-z]+ \d+` also matches "Ruth 3",
   * "John 15" and "Psalm 23" — chapter references, which are among the *best* labels there are.
   */
  const month = value.match(/^([A-Za-z]+)\s+\d{1,2}\b/)?.[1] ?? value.match(/^\d{1,2}\s+([A-Za-z]+)\b/)?.[1];
  return !(month != null && MONTHS.has(month.toLowerCase()));
}

/*
 * Whole words, not three-letter prefixes: `'Mark'.slice(0, 3)` is `'mar'`, and a prefix test
 * quietly turned the second Gospel into March.
 */
const MONTHS = new Set([
  'jan', 'january', 'feb', 'february', 'mar', 'march', 'apr', 'april', 'may',
  'jun', 'june', 'jul', 'july', 'aug', 'august', 'sep', 'sept', 'september',
  'oct', 'october', 'nov', 'november', 'dec', 'december',
]);

/**
 * Build "which of your notes says this?".
 *
 * Returns null when the fragment appears inside any option. That is not a hypothetical: an
 * untitled note's label falls back to its own opening line, and a note whose body repeats its
 * title would offer the answer inside the question. Cheaper to skip the rung than to ship a
 * question that answers itself.
 */
export function buildNoteRecognize(input: {
  fragment: string;
  /** Set when the fragment is a span the reader marked; the quote is emphasised in place. */
  span?: NoteSpan | null;
  answerLabel: string;
  poolLabels: readonly string[];
  seed: string;
}): NoteRecognizeExercise | null {
  const fragment = input.fragment.trim();
  if (!fragment) return null;

  const choice = buildChoiceExercise({
    answers: [input.answerLabel],
    pool: input.poolLabels,
    optionCount: OPTION_COUNT,
    seed: input.seed,
  });
  if (!choice) return null;

  /*
   * Everything the stem puts on screen, not just the quote: the context either side is shown
   * too, and an option hiding in the run-up answers the question just as well.
   */
  const shown = input.span ? noteSpanText(input.span) : fragment;
  const haystack = shown.toLowerCase().replace(/\s+/g, ' ');
  const selfAnswering = choice.options.some((option) => {
    const needle = option.toLowerCase().replace(/\s+/g, ' ').trim();
    return needle.length > 0 && (haystack.includes(needle) || needle.includes(haystack));
  });
  if (selfAnswering) return null;

  return { ...choice, fragment, ...(input.span ? { span: input.span } : {}) };
}

/**
 * A highlighted span with the words either side of it.
 *
 * The stem used to be a fragment the app chose out of the middle of the note, which is why a
 * note review could feel like a memory test about a sentence nobody had marked. A span the
 * reader dragged is a better question by itself, and it reads better with a few words of run-up:
 * a quote that starts mid-clause is a puzzle about grammar before it is one about study.
 *
 * The context is trimmed to whole words and capped, because the point is a running start, not
 * the paragraph — and because everything shown here is checked against the options.
 */
export interface NoteSpan {
  before: string;
  quote: string;
  after: string;
}

const SPAN_CONTEXT_WORDS = 8;

/**
 * A marked span has to be a few words to be a stem. "box" is a bookmark; showing it as the
 * line to recognise a note by is a question nobody could answer. Same floor as the verse side
 * (`READER_SPAN_MIN_WORDS`), kept separate so each file states its own rule.
 */
export const NOTE_SPAN_MIN_WORDS = 3;

function tailWords(text: string, count: number): string {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  return words.slice(Math.max(0, words.length - count)).join(' ');
}

function headWords(text: string, count: number): string {
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  return words.slice(0, count).join(' ');
}

export function buildNoteSpan(input: {
  quote: string;
  prefix?: string | null;
  suffix?: string | null;
}): NoteSpan | null {
  const quote = input.quote.replace(/\s+/g, ' ').trim();
  if (!quote) return null;
  if (quote.split(' ').length < NOTE_SPAN_MIN_WORDS) return null;
  return {
    before: tailWords(input.prefix ?? '', SPAN_CONTEXT_WORDS),
    quote,
    after: headWords(input.suffix ?? '', SPAN_CONTEXT_WORDS),
  };
}

/** Everything the stem puts on screen, for the self-answering check. */
export function noteSpanText(span: NoteSpan): string {
  return [span.before, span.quote, span.after].filter(Boolean).join(' ');
}

// ─── Rungs 1 and 2: what was it about, and what did you link it to? ──────────

/**
 * Build "which of these did you cite here?" or "what did you link this to?".
 *
 * `acceptable` is every passage the note cites, or every note it is linked to — the whole set,
 * because there is no such thing as *the* one. Picking a single member and marking the others
 * wrong would grade an arbitrary row order rather than the reader's study.
 */
export function buildNoteChoice(input: {
  acceptable: readonly string[];
  poolLabels: readonly string[];
  fallbackLabels?: readonly string[];
  seed: string;
}): ChoiceExercise | null {
  if (!input.acceptable.length) return null;
  return buildChoiceExercise({
    answers: input.acceptable,
    pool: input.poolLabels,
    fallbackPool: input.fallbackLabels,
    // Every acceptable answer is barred as a distractor by the primitive itself.
    optionCount: OPTION_COUNT,
    seed: input.seed,
  });
}

/**
 * Build "pick the passage you wrote this on".
 *
 * The stem is the reader's own annotation — the words they typed on a highlight — and the answer
 * is the passage they typed them on. Both ends are theirs: this is the rung that comes closest
 * to asking about their study rather than about their filing.
 *
 * Returns null when the annotation names its own passage, which is common: people write "Romans
 * 8 is about..." on a highlight of Romans 8. A stem containing its answer is not a question.
 */
export function buildNoteAnnotation(input: {
  annotation: string;
  reference: string;
  poolReferences: readonly string[];
  seed: string;
}): NoteRecognizeExercise | null {
  const annotation = input.annotation.replace(/\s+/g, ' ').trim();
  const reference = input.reference.trim();
  if (!annotation || !reference) return null;
  if (annotation.split(' ').filter(Boolean).length < MIN_ANNOTATION_WORDS) return null;

  const haystack = annotation.toLowerCase();
  // The reference itself, and the book alone — "Romans 8:28" and "Romans" both give it away.
  const book = reference.replace(/\s*\d+[:\d\-–,\s]*$/, '').trim().toLowerCase();
  if (haystack.includes(reference.toLowerCase())) return null;
  if (book.length > 2 && haystack.includes(book)) return null;

  const choice = buildChoiceExercise({
    answers: [reference],
    pool: input.poolReferences,
    optionCount: OPTION_COUNT,
    seed: input.seed,
  });
  if (!choice) return null;

  return { ...choice, fragment: annotation };
}

/** Below this an annotation is a word or two, which says nothing about which passage it is on. */
const MIN_ANNOTATION_WORDS = 3;

/** True when the reader picked any of the answers that are genuinely right. */
export function gradeNoteChoice(
  exercise: ChoiceExercise,
  chosen: string,
  acceptable: readonly string[],
): boolean {
  return gradeChoiceExercise(exercise, chosen, acceptable);
}
