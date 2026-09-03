/**
 * The questions Review asks, written by hand.
 *
 * Every prompt in this file was authored once and is filled with the reader's own material at
 * runtime. Nothing here calls a model, and that is the product's position rather than a
 * limitation to be lifted later: a generated question about someone's study of Scripture is a
 * machine's reading of the text presented as a prompt, and Harvous does not do that. The
 * prompts are personal because their *inputs* are personal — your reference, your Thread's
 * title, the two passages you chose to link.
 *
 * **They are instructions, not questions.** "Pick the verse that follows John 15:5." rather than
 * "What comes after John 15:5?" — a review is a thing to do, and phrasing it as a question made
 * the app sound like it was wondering aloud. Every prompt ends in a full stop for that reason.
 *
 * **Each key also has a `task`**: the same instruction with the subject stripped out, for the row
 * on Activity, which leads with *what* is being reviewed and puts the doing underneath. The
 * prompt names the subject because it stands alone in the dock; the task never does, because the
 * title above it already did.
 *
 * Where a rung is graded the answer key is the reader's own material or the Scripture text, never
 * their prose: `attempt` text is still never compared to anything.
 */

import type { ReviewAskableKind, ReviewItemKind } from './review-item-kinds';
import { hashSeed } from './verse-cloze';

export const REVIEW_PROMPT_KEYS = [
  'note.recognize',
  'note.passage',
  'note.connect',
  'note.annotation',
  'verse.recognize',
  'verse.rebuild',
  'verse.recall',
  'verse.next',
  'verse.altered',
  'verse.sequence',
  'verse.locate',
  'verse.connect',
] as const;

export type ReviewPromptKey = (typeof REVIEW_PROMPT_KEYS)[number];

export interface ReviewPromptContext {
  /** Scripture reference when the item has one, else the note or Thread title. */
  reference?: string | null;
  noteTitle?: string | null;
  secondaryNoteTitle?: string | null;
  threadTitle?: string | null;
  /** A distinctive fragment of the verse, for the recognize rung. */
  cue?: string | null;

}

/**
 * The name the question can use, or null when the note has none.
 *
 * Never "this note", which was the old fallback and named nothing at all. A nameless note gets
 * the bare form of the question instead, and the row names it on the line below.
 */
function subjectName(ctx: ReviewPromptContext): string | null {
  return ctx.reference?.trim() || ctx.noteTitle?.trim() || ctx.threadTitle?.trim() || null;
}

/**
 * Build an instruction two ways round: a named subject sits inside the sentence, and anything
 * nameless gets a hand-written bare form.
 *
 * The bare forms are written out rather than spliced. Splicing produced "your this Thread" and
 * "You marked this in this." — a fallback string dropped into a slot that assumed a name.
 */
function named(ctx: ReviewPromptContext, inside: (s: string) => string, bare: string): string {
  const name = subjectName(ctx);
  return name ? inside(name) : bare;
}

/**
 * The same, for the prompts that name a Thread.
 *
 * `subjectName` prefers `reference`, which is right for a verse rung and wrong here: a thread
 * item carries whatever reference its representative note cites, and reading it through the
 * general resolver produced "your Romans 8:15 Thread".
 */
function namedThread(
  ctx: ReviewPromptContext,
  inside: (s: string) => string,
  bare: string,
): string {
  const name = ctx.threadTitle?.trim() || ctx.noteTitle?.trim() || null;
  return name ? inside(name) : bare;
}

/**
 * Prompt text by key. "Thread" is capitalized throughout — it is the product's name for a
 * cluster of connected notes, and `npm run check:thread-terminology` enforces it.
 */
export const REVIEW_PROMPTS: Record<ReviewPromptKey, (ctx: ReviewPromptContext) => string> = {
  /*
   * Three instructions about the note, not about its wording.
   *
   * These replaced five open reflective prompts — "what made you write this?", "what is clearer
   * to you now?" — which turned out not to be review questions at all. They were invitations to
   * go and mark something, and that is where they went: Home, as a suggestion.
   *
   * `note.recognize` never names the note, because the note *is* the answer.
   */
  'note.recognize': () => 'Pick the note this line is from.',
  'note.passage': (ctx) =>
    named(ctx, (s) => `Pick a passage you cited in ${s}.`, 'Pick a passage you cited here.'),
  'note.connect': (ctx) =>
    named(ctx, (s) => `Pick a note you linked to ${s}.`, 'Pick a note you linked to this one.'),
  /*
   * The words the reader typed on a highlight, and the passage they typed them on.
   *
   * Never names the note: the stem is already their own sentence, and the answer is the passage.
   */
  'note.annotation': () => 'Pick the passage you wrote this on.',
  'verse.recognize': (ctx) =>
    ctx.cue?.trim()
      ? named(
          ctx,
          (s) => `Finish ${s} from "${ctx.cue!.trim()}…".`,
          `Finish the verse from "${ctx.cue!.trim()}…".`,
        )
      : named(ctx, (s) => `Say what ${s} says.`, 'Say what this verse says.'),
  'verse.rebuild': (ctx) =>
    named(ctx, (s) => `Fill in the missing words of ${s}.`, 'Fill in the missing words.'),
  'verse.recall': (ctx) =>
    named(ctx, (s) => `Write ${s} from memory.`, 'Write this verse from memory.'),
  'verse.next': (ctx) =>
    named(ctx, (s) => `Pick the verse that follows ${s}.`, 'Pick the verse that follows.'),
  /*
   * The most important line of copy in this feature.
   *
   * It has to say the text has been changed *before* the reader reaches the text, because this
   * is the one rung that puts words on screen which are not what the passage says. Phrased
   * flatly and first: no "can you spot", no game-show framing around someone's Scripture.
   */
  'verse.altered': (ctx) =>
    named(
      ctx,
      (s) => `One word in ${s} has been changed. Find it.`,
      'One word in this verse has been changed. Find it.',
    ),
  'verse.sequence': (ctx) =>
    named(ctx, (s) => `Put ${s} back in order.`, 'Put the verse back in order.'),
  // Never names the passage: the reference is the answer.
  'verse.locate': () => 'Say where this is from.',
  'verse.connect': (ctx) =>
    named(
      ctx,
      (s) => `Say what you connected to ${s}, and why.`,
      'Say what you connected to this verse, and why.',
    ),
};

/**
 * The same instruction with the subject taken out, for the row on Activity.
 *
 * The row leads with *what* is being reviewed — the reference, or the note's name — and puts the
 * doing underneath, which is how Home has always read ("A passage you keep returning to · Across
 * 5 of your notes"). Review had it the other way round: the question was the title and the thing
 * it was about was demoted to the line below, so a shelf of rows all read as questions with no
 * subject. A task must therefore never contain a reference or a title; the title above it has
 * already said which.
 */
export const REVIEW_TASKS: Record<ReviewPromptKey, string> = {
  'note.recognize': 'Pick the note this is from',
  'note.passage': 'Pick a passage you cited',
  'note.connect': 'Pick a note you linked',
  'note.annotation': 'Pick the passage you wrote this on',
  'verse.recognize': 'Finish the verse',
  'verse.rebuild': 'Fill in the missing words',
  'verse.recall': 'Write it from memory',
  'verse.next': 'Pick what comes next',
  'verse.altered': 'Find the changed word',
  'verse.sequence': 'Put it back in order',
  'verse.locate': 'Say where it is from',
  'verse.connect': 'Say what you connected to it',
};

export function reviewTaskFor(key: ReviewPromptKey): string {
  return REVIEW_TASKS[key] ?? REVIEW_TASKS['verse.recall'];
}

/**
 * The verse ladder, in order. The rungs are positions on `ReviewItems.ladderStep`, and a clean
 * recall moves the reader up one — so the same verse is asked a different way each time rather
 * than the same way forever, which is the difference between varied retrieval and rereading.
 *
 * The last two were appended rather than inserted, so an item mid-ladder keeps the rung it is
 * on. `sequence` and `locate` are also the only two rungs anything grades: they have one right
 * answer that comes from the text itself. Every other rung is an open question the reader
 * judges for themselves, and that asymmetry is deliberate — see verse-ladder-exercises.ts.
 */
/**
 * The note ladder. Three graded rungs, climbed on a clean recall like the verse ladder.
 *
 * Unlike the verse ladder these are *material-gated*: a note with no links cannot be asked what
 * it was linked to. `resolveNoteRung` in note-ladder-exercises.ts turns this nominal position
 * into the one a given note can actually be asked.
 */
export const NOTE_LADDER: readonly ReviewPromptKey[] = [
  'note.recognize',
  'note.passage',
  'note.connect',
  'note.annotation',
];

export const NOTE_LADDER_MAX_STEP = NOTE_LADDER.length - 1;

export const VERSE_LADDER: readonly ReviewPromptKey[] = [
  'verse.recognize',
  'verse.rebuild',
  'verse.recall',
  'verse.next',
  'verse.connect',
  'verse.sequence',
  'verse.locate',
  'verse.altered',
];

export const VERSE_LADDER_MAX_STEP = VERSE_LADDER.length - 1;

/**
 * What a verse is asked once it has climbed the whole ladder.
 *
 * Without this the top rung is terminal: a verse someone has worked all the way up asks "where
 * is this from?" every time it comes round, forever, and the one passage they know best is the
 * one the app has nothing left to say about.
 *
 * Only the rungs worth repeating. `verse.recognize` and `verse.recall` are how a verse is
 * learned, not how it is kept — asking "what does this verse say?" of something memorised
 * months ago is a question with no work in it. What remains gets harder instead: each pass
 * through this list hides more of the text than the last.
 */
export const VERSE_MAINTENANCE: readonly ReviewPromptKey[] = [
  'verse.rebuild',
  'verse.next',
  'verse.altered',
  'verse.sequence',
  'verse.locate',
];

/** The rung a verse is on, and how many times it has been round the maintenance cycle. */
export interface VerseRung {
  key: ReviewPromptKey;
  /**
   * 0 while climbing, then 1, 2, 3… once wrapped.
   *
   * Drives how much of the verse is hidden. Not `reviewCount`, which rises on every answer —
   * ten "almost"s would hand someone a mostly-blank verse they have never once recalled.
   */
  pass: number;
}

export function verseRungFor(step: number): VerseRung {
  const clamped = Number.isFinite(step) ? Math.max(0, Math.trunc(step)) : 0;
  if (clamped < VERSE_LADDER.length) return { key: VERSE_LADDER[clamped], pass: 0 };
  const offset = clamped - VERSE_LADDER.length;
  return {
    key: VERSE_MAINTENANCE[offset % VERSE_MAINTENANCE.length],
    pass: 1 + Math.floor(offset / VERSE_MAINTENANCE.length),
  };
}

/** The rung whose prompt hides part of the verse. The page renders a cloze only here. */
export const VERSE_REBUILD_STEP = 1;

/** Rung 0 of the note ladder, where the note's own identity is the answer. */
export const NOTE_RECOGNIZE_STEP = 0;

/** The graded rungs. The client's own verdict is ignored on these — the server marks them. */
export const VERSE_NEXT_STEP = 3;
export const VERSE_SEQUENCE_STEP = 5;
export const VERSE_LOCATE_STEP = 6;

/**
 * Rungs the server marks, where the puzzle *is* the question.
 *
 * On these the reader taps an option rather than writing an attempt and judging themselves, so
 * the dock fetches the reveal straight away and the client's own verdict is discarded.
 *
 * One function because the answer was being written out by hand in three places — the dock, the
 * subtitle rule and the outcome route — and a rung added to two of them is a rung that asks a
 * question nobody can answer, or marks one nobody was asked.
 */
const GRADED_VERSE_KEYS = new Set<ReviewPromptKey>([
  'verse.rebuild',
  'verse.next',
  'verse.altered',
  'verse.sequence',
  'verse.locate',
]);

export function reviewRungIsGraded(item: {
  kind?: string | null;
  ladderStep?: number | null;
}): boolean {
  // Every note rung is a multiple choice now.
  if (item.kind === 'note') return true;
  if (item.kind !== 'verse') return false;
  // Resolved rather than compared against the step, so a rung reached on a maintenance pass is
  // the same rung it was the first time round.
  return GRADED_VERSE_KEYS.has(verseRungFor(item.ladderStep ?? 0).key);
}

/** Which kinds climb rather than rotate, and how far. */
export function ladderMaxStepFor(kind: ReviewItemKind): number | null {
  if (kind === 'verse') return VERSE_LADDER_MAX_STEP;
  if (kind === 'note') return NOTE_LADDER_MAX_STEP;
  return null;
}

/** The next rung after a clean recall, clamped to the ladder's top. */
export function nextLadderStep(kind: ReviewItemKind, step: number): number {
  const current = Math.max(0, Math.trunc(Number.isFinite(step) ? step : 0));
  // A verse keeps climbing past the top of the ladder, into the maintenance cycle.
  if (kind === 'verse') return current + 1;
  const max = ladderMaxStepFor(kind);
  if (max === null) return step;
  return Math.min(max, current + 1);
}

/**
 * Which rung this item is on.
 *
 * Both remaining kinds climb rather than rotate. The rotation this used to do — a different
 * phrasing each time an item came round — left with the open kinds it served; `reviewCount` and
 * `itemId` are kept in the signature because callers pass them and a rung may want them again.
 */
export function pickPromptKey(
  kind: ReviewAskableKind,
  reviewCount: number,
  ladderStep = 0,
  itemId?: string | null,
): ReviewPromptKey {
  // Past the top the ladder wraps into maintenance rather than stopping — see `verseRungFor`.
  if (kind === 'verse') return verseRungFor(ladderStep).key;
  /*
   * The *nominal* rung for a note. What it can actually be asked depends on whether it has a
   * body to quote, a passage to name or a link to recall — see `resolveNoteRung`, which the
   * server calls with the material in hand. This is the fallback when nothing is known.
   */
  const step = Math.min(Math.max(0, Math.trunc(ladderStep)), NOTE_LADDER_MAX_STEP);
  return NOTE_LADDER[step];
}

export function fillReviewPrompt(key: ReviewPromptKey, ctx: ReviewPromptContext): string {
  return REVIEW_PROMPTS[key](ctx);
}

/** One call from an item row to its rendered question. */
export function reviewPromptFor(
  item: {
    kind: ReviewAskableKind;
    reviewCount: number;
    ladderStep?: number | null;
    id?: string | null;
  },
  ctx: ReviewPromptContext,
): { key: ReviewPromptKey; prompt: string } {
  const key = pickPromptKey(item.kind, item.reviewCount, item.ladderStep ?? 0, item.id ?? null);
  return { key, prompt: fillReviewPrompt(key, ctx) };
}
