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
import { hashSeed } from './verse-cloze';

export const REVIEW_PROMPT_KEYS = [
  'note.observe',
  'note.central',
  'note.carry',
  'note.phrase',
  'note.unclear',
  'highlight.why',
  'highlight.detail',
  'connection.why',
  'connection.distinct',
  'connection.tension',
  'thread.central',
  'thread.unresolved',
  'thread.backbone',
  'verse.recognize',
  'verse.rebuild',
  'verse.recall',
  'verse.contextualize',
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
  /** The note's own opening words, when it has no title to be named by. */
  notePhrase?: string | null;
}

/**
 * What the question is about, and whether it is a *name* or the note's own words.
 *
 * The distinction decides the sentence shape. "What did you see in Romans 8?" is fine, and
 * "What did you see in The first book Lets type more content here?" is not — an excerpt is a
 * fragment of prose, not a noun you can put after a preposition. Those lead instead:
 * "The first book Lets type more content here — what did you see?"
 *
 * Never "this note", which was the old fallback and named nothing at all.
 */
function subject(ctx: ReviewPromptContext): { text: string; isPhrase: boolean } {
  const name = ctx.reference?.trim() || ctx.noteTitle?.trim() || ctx.threadTitle?.trim();
  if (name) return { text: name, isPhrase: false };
  const phrase = ctx.notePhrase?.trim();
  if (phrase) return { text: phrase, isPhrase: true };
  return { text: 'this', isPhrase: false };
}

/**
 * Build a question two ways round: named subjects sit inside the sentence, the note's own
 * words lead it. `tail` is the phrase-led form, with the subject already spoken for.
 */
function ask(ctx: ReviewPromptContext, inside: (s: string) => string, tail: string): string {
  const { text, isPhrase } = subject(ctx);
  if (!isPhrase) return inside(text);
  // Trailing punctuation is already trimmed where the excerpt is built, so that the label and
  // the question hold the same string; this is belt and braces for any other caller.
  return `${text.replace(/[.,;:—–-]+$/, '').trim()} — ${tail}`;
}

/** The old shape, for prompts that only ever name a Thread or a passage. */
function subjectText(ctx: ReviewPromptContext): string {
  return subject(ctx).text;
}

function threadName(ctx: ReviewPromptContext): string {
  return ctx.threadTitle?.trim() || ctx.noteTitle?.trim() || 'this';
}

/**
 * Prompt text by key. "Thread" is capitalized throughout — it is the product's name for a
 * cluster of connected notes, and `npm run check:thread-terminology` enforces it.
 */
export const REVIEW_PROMPTS: Record<ReviewPromptKey, (ctx: ReviewPromptContext) => string> = {
  /*
   * Second person, and short.
   *
   * These read like a worksheet before — "what is the central idea of your note on X", "what in
   * the text itself led you to write this note". Two problems in one sentence: they addressed
   * the note as an object rather than the reader as someone who wrote it, and "this note" named
   * nothing when the note had no title.
   */
  'note.observe': (ctx) => ask(ctx, (s) => `What did you see in ${s}?`, 'what did you see?'),
  'note.central': (ctx) =>
    ask(ctx, (s) => `What were you working out in ${s}?`, 'what were you working out?'),
  'note.carry': (ctx) => ask(ctx, (s) => `What stuck with you from ${s}?`, 'what stuck with you?'),
  'note.phrase': (ctx) => ask(ctx, (s) => `What made you write ${s}?`, 'what made you write it?'),
  'note.unclear': (ctx) =>
    ask(ctx, (s) => `What is clearer to you in ${s} now?`, 'what is clearer to you now?'),
  'highlight.why': (ctx) => `You marked this in ${subjectText(ctx)}. What made it worth keeping?`,
  'highlight.detail': (ctx) => `What detail in ${subjectText(ctx)} led you to mark this passage?`,
  'connection.why': (ctx) =>
    `Why did you connect ${ctx.noteTitle?.trim() || 'these notes'} and ${
      ctx.secondaryNoteTitle?.trim() || 'the other'
    }?`,
  'connection.distinct': (ctx) =>
    `${ctx.noteTitle?.trim() || 'One note'} and ${
      ctx.secondaryNoteTitle?.trim() || 'the other'
    } sit together in your study. What is similar, and what is distinct?`,
  'connection.tension': (ctx) =>
    `Where do ${ctx.noteTitle?.trim() || 'these notes'} and ${
      ctx.secondaryNoteTitle?.trim() || 'the other'
    } pull against each other?`,
  'thread.central': (ctx) =>
    `What central idea is taking shape across your ${threadName(ctx)} Thread?`,
  'thread.unresolved': (ctx) =>
    `What is still unresolved in your ${threadName(ctx)} Thread?`,
  'thread.backbone': (ctx) =>
    `If your ${threadName(ctx)} Thread had one sentence at its centre, what would it be?`,
  'verse.recognize': (ctx) =>
    ctx.cue?.trim()
      ? `${subjectText(ctx)} — "${ctx.cue.trim()}…" What comes next?`
      : `${subjectText(ctx)} — what does this verse say?`,
  'verse.rebuild': (ctx) => `Fill in what is missing from ${subjectText(ctx)}.`,
  'verse.recall': (ctx) => `${subjectText(ctx)} — write it as you remember it.`,
  'verse.contextualize': (ctx) => `What happens just before or after ${subjectText(ctx)}?`,
  'verse.sequence': (ctx) => `Put ${subjectText(ctx)} back in order.`,
  'verse.locate': () => 'Where is this from?',
  'verse.connect': (ctx) =>
    `What note or passage did you connect to ${subjectText(ctx)}, and why?`,
};

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
export const VERSE_LADDER: readonly ReviewPromptKey[] = [
  'verse.recognize',
  'verse.rebuild',
  'verse.recall',
  'verse.contextualize',
  'verse.connect',
  'verse.sequence',
  'verse.locate',
];

export const VERSE_LADDER_MAX_STEP = VERSE_LADDER.length - 1;

/** The rung whose prompt hides part of the verse. The page renders a cloze only here. */
export const VERSE_REBUILD_STEP = 1;

/** The two graded rungs. The client's own verdict is ignored on these — the server marks them. */
export const VERSE_SEQUENCE_STEP = 5;
export const VERSE_LOCATE_STEP = 6;

const ROTATIONS: Record<Exclude<ReviewItemKind, 'verse'>, readonly ReviewPromptKey[]> = {
  note: ['note.observe', 'note.central', 'note.carry', 'note.phrase', 'note.unclear'],
  highlight: ['highlight.why', 'highlight.detail'],
  connection: ['connection.why', 'connection.distinct', 'connection.tension'],
  thread: ['thread.central', 'thread.unresolved', 'thread.backbone'],
};

/**
 * Which prompt this item gets this time.
 *
 * Rotation by review count rather than at random, for two reasons: the same item asked twice
 * on two devices must read the same, and a reader who sees "what did you observe" every single
 * time stops reading the question. Deterministic, so it is testable and cacheable.
 *
 * The item id offsets where in the rotation each item starts. Without it every brand-new item
 * begins at index 0, so a queue of three fresh notes asks "what did you observe" three times —
 * which is exactly how it read in the first preview. The offset is a hash rather than a random
 * pick for the same reason the rotation is: two devices must render the same question.
 */
export function pickPromptKey(
  kind: ReviewItemKind,
  reviewCount: number,
  ladderStep = 0,
  itemId?: string | null,
): ReviewPromptKey {
  if (kind === 'verse') {
    const step = Math.min(Math.max(0, Math.trunc(ladderStep)), VERSE_LADDER_MAX_STEP);
    return VERSE_LADDER[step];
  }
  const options = ROTATIONS[kind];
  const offset = itemId ? hashSeed(itemId) : 0;
  const index = (Math.max(0, Math.trunc(reviewCount)) + offset) % options.length;
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
    id?: string | null;
  },
  ctx: ReviewPromptContext,
): { key: ReviewPromptKey; prompt: string } {
  const key = pickPromptKey(item.kind, item.reviewCount, item.ladderStep ?? 0, item.id ?? null);
  return { key, prompt: fillReviewPrompt(key, ctx) };
}
