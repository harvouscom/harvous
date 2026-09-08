/**
 * The questions Review used to ask about a Thread and a link, now an invitation on Home.
 *
 * They left Review for the same reason the five note prompts did: there is no answer to mark.
 * "What is still unresolved in your Covenant Thread?" is a good question and a bad review — the
 * app cannot tell you whether you got it right, and a queue that mixes things you can be right
 * about with things you cannot stops meaning anything.
 *
 * Folded from eight prompts into five. The three connection phrasings each needed *two* note
 * names to read ("Why did you connect X and Y?"), and Home holds a Thread rather than a pair, so
 * the two worth keeping are rewritten about the notes in the Thread. The third — "where do these
 * pull against each other?" — survives that rewrite; "what is similar and what is distinct?"
 * became one question rather than two clauses.
 *
 * Pure. No Thread knowledge beyond the title it is handed.
 */

import { hashSeed, mulberry32 } from '@/utils/verse-cloze';

/**
 * The rotation. "Thread" is capitalized throughout — it is the product's name for a cluster of
 * connected notes, and `npm run check:thread-terminology` enforces it.
 */
export const THREAD_REFLECT_PROMPTS: readonly ((title: string) => string)[] = [
  (title) => `What central idea is taking shape across your ${title} Thread?`,
  (title) => `What is still unresolved in your ${title} Thread?`,
  (title) => `If your ${title} Thread had one sentence at its centre, what would it be?`,
  (title) => `What do the notes in your ${title} Thread share, and where do they differ?`,
  (title) => `Where do the notes in your ${title} Thread pull against each other?`,
];

/** Days since the epoch, so the rotation turns over at the reader's own midnight. */
export function dayIndex(now: Date = new Date()): number {
  return Math.floor(
    new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 86_400_000,
  );
}

/**
 * The prompt for one Thread today.
 *
 * Seeded on the Thread and the day together, exactly as `noteMarkPrompt` is: the same Thread
 * asks the same thing all day, so a card that survives a reload is not a different card.
 */
export function threadReflectPrompt(
  threadId: string,
  title: string,
  day: number = dayIndex(),
): string {
  const random = mulberry32(hashSeed(`${threadId}:${day}`));
  const pick = THREAD_REFLECT_PROMPTS[Math.floor(random() * THREAD_REFLECT_PROMPTS.length)];
  return pick(title);
}
