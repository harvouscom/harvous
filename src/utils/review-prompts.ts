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
 * They are also all open questions with no correct answer stored anywhere. Review never grades
 * what the reader writes; it records only whether they said they had it. That is what keeps
 * this a study aid rather than a quiz, and it is why `attempt` text is never compared to
 * anything.
 */

import type { ReviewItemKind } from './review-item-kinds';

export const REVIEW_PROMPT_KEYS = [
  'note.observe',
  'note.central',
  'note.carry',
  'highlight.why',
  'highlight.detail',
  'connection.why',
  'connection.distinct',
  'thread.central',
  'thread.unresolved',
  'verse.recognize',
  'verse.rebuild',
  'verse.recall',
  'verse.contextualize',
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

/** Falls back rather than rendering "undefined" — every prompt must read as a sentence. */
function subject(ctx: ReviewPromptContext): string {
  return (
    ctx.reference?.trim() ||
    ctx.noteTitle?.trim() ||
    ctx.threadTitle?.trim() ||
    'this note'
  );
}

function threadName(ctx: ReviewPromptContext): string {
  return ctx.threadTitle?.trim() || ctx.noteTitle?.trim() || 'this';
}

/**
 * Prompt text by key. "Thread" is capitalized throughout — it is the product's name for a
 * cluster of connected notes, and `npm run check:thread-terminology` enforces it.
 */
export const REVIEW_PROMPTS: Record<ReviewPromptKey, (ctx: ReviewPromptContext) => string> = {
  'note.observe': (ctx) => `Before opening it, what did you observe in ${subject(ctx)}?`,
  'note.central': (ctx) => `What is the central idea of your note on ${subject(ctx)}?`,
  'note.carry': (ctx) => `What did you intend to carry forward from ${subject(ctx)}?`,
  'highlight.why': (ctx) => `You marked this in ${subject(ctx)}. What made it worth keeping?`,
  'highlight.detail': (ctx) => `What detail in ${subject(ctx)} led you to mark this passage?`,
  'connection.why': (ctx) =>
    `Why did you connect ${ctx.noteTitle?.trim() || 'these notes'} and ${
      ctx.secondaryNoteTitle?.trim() || 'the other'
    }?`,
  'connection.distinct': (ctx) =>
    `${ctx.noteTitle?.trim() || 'One note'} and ${
      ctx.secondaryNoteTitle?.trim() || 'the other'
    } sit together in your study. What is similar, and what is distinct?`,
  'thread.central': (ctx) =>
    `What central idea is taking shape across your ${threadName(ctx)} Thread?`,
  'thread.unresolved': (ctx) =>
    `What is still unresolved in your ${threadName(ctx)} Thread?`,
  'verse.recognize': (ctx) =>
    ctx.cue?.trim()
      ? `${subject(ctx)} — "${ctx.cue.trim()}…" What comes next?`
      : `${subject(ctx)} — what does this verse say?`,
  'verse.rebuild': (ctx) => `Fill in what is missing from ${subject(ctx)}.`,
  'verse.recall': (ctx) => `${subject(ctx)} — write it as you remember it.`,
  'verse.contextualize': (ctx) => `What happens just before or after ${subject(ctx)}?`,
  'verse.connect': (ctx) =>
    `What note or passage did you connect to ${subject(ctx)}, and why?`,
};

/**
 * The verse ladder, in order. The rungs are positions 0..4 on `ReviewItems.ladderStep`, and a
 * clean recall moves the reader up one — so the same verse is asked a different way each time
 * rather than the same way forever, which is the difference between varied retrieval and
 * rereading.
 */
export const VERSE_LADDER: readonly ReviewPromptKey[] = [
  'verse.recognize',
  'verse.rebuild',
  'verse.recall',
  'verse.contextualize',
  'verse.connect',
];

export const VERSE_LADDER_MAX_STEP = VERSE_LADDER.length - 1;

/** The rung whose prompt hides part of the verse. The page renders a cloze only here. */
export const VERSE_REBUILD_STEP = 1;

const ROTATIONS: Record<Exclude<ReviewItemKind, 'verse'>, readonly ReviewPromptKey[]> = {
  note: ['note.observe', 'note.central', 'note.carry'],
  highlight: ['highlight.why', 'highlight.detail'],
  connection: ['connection.why', 'connection.distinct'],
  thread: ['thread.central', 'thread.unresolved'],
};

/**
 * Which prompt this item gets this time.
 *
 * Rotation by review count rather than at random, for two reasons: the same item asked twice
 * on two devices must read the same, and a reader who sees "what did you observe" every single
 * time stops reading the question. Deterministic, so it is testable and cacheable.
 */
export function pickPromptKey(
  kind: ReviewItemKind,
  reviewCount: number,
  ladderStep = 0,
): ReviewPromptKey {
  if (kind === 'verse') {
    const step = Math.min(Math.max(0, Math.trunc(ladderStep)), VERSE_LADDER_MAX_STEP);
    return VERSE_LADDER[step];
  }
  const options = ROTATIONS[kind];
  const index = Math.max(0, Math.trunc(reviewCount)) % options.length;
  return options[index];
}

export function fillReviewPrompt(key: ReviewPromptKey, ctx: ReviewPromptContext): string {
  return REVIEW_PROMPTS[key](ctx);
}

/** One call from an item row to its rendered question. */
export function reviewPromptFor(
  item: {
    kind: ReviewItemKind;
    reviewCount: number;
    ladderStep?: number | null;
  },
  ctx: ReviewPromptContext,
): { key: ReviewPromptKey; prompt: string } {
  const key = pickPromptKey(item.kind, item.reviewCount, item.ladderStep ?? 0);
  return { key, prompt: fillReviewPrompt(key, ctx) };
}
