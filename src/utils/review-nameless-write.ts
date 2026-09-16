import type { ReviewPromptContext, ReviewPromptKey } from '@/utils/review-prompts';

/** The name a prompt can print. */
export function reviewPromptSubject(ctx: ReviewPromptContext): string | null {
  return ctx.reference?.trim() || ctx.noteTitle?.trim() || ctx.threadTitle?.trim() || null;
}

/**
 * Rungs whose exercise is an empty writer, a skeleton, or a handful of boxes — nothing of the
 * verse is on screen, so the subject is the only handle the reader has.
 *
 * `finish` recall still shows most of the verse, and a low-tier initials exercise still reads as
 * a sentence with gaps. Those can stand a bare prompt. The rest cannot: "Write this verse from
 * memory." above a blank box is a question about nothing.
 */
export function reviewExerciseNeedsNamedSubject(
  key: ReviewPromptKey,
  ctx?: Pick<ReviewPromptContext, 'recallMode' | 'initialsTier'>,
): boolean {
  if (key === 'verse.recall') return (ctx?.recallMode ?? 'reference') !== 'finish';
  if (key === 'verse.initials') return (ctx?.initialsTier ?? 2) >= 2;
  if (key === 'verse.keywords') return true;
  if (key === 'chapter.finish') return true;
  return false;
}

/** True when this prompt would send the reader to a blank writer with no named passage. */
export function reviewPromptIsNamelessWrite(
  key: ReviewPromptKey,
  ctx: ReviewPromptContext,
): boolean {
  return reviewExerciseNeedsNamedSubject(key, ctx) && !reviewPromptSubject(ctx);
}
