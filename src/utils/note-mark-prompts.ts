/**
 * The five questions that used to be note reviews, and are now an invitation to mark a note.
 *
 * They left Review because they are not review questions. "What made you write this?" has no
 * right answer, nothing to compare against, and no way to be wrong — which makes it a fine thing
 * to ask someone and a poor thing to grade them on. What it actually wants is for you to go back
 * into the note and mark the part that answers it, so it belongs on Home beside the other
 * suggestions that ask you to make something.
 *
 * Kept as one recall kind rather than five. Five would shatter `RECALL_KIND_TIER` measurement
 * into samples too small to read, and the difference between these questions is wording, not
 * behaviour — nobody taps "what stuck with you" for reasons they would not tap "what did you
 * see".
 *
 * Pure. No note knowledge beyond the title it is handed.
 */

import { hashSeed, mulberry32 } from '@/utils/verse-cloze';

/**
 * The rotation, in the second-person voice the review prompts settled on.
 *
 * Phrased about the note rather than about the reader's motives where the original strayed:
 * "what made you write this" asks after a state of mind from months ago, and the answer people
 * actually have is about the text in front of them.
 */
export const NOTE_MARK_PROMPTS = [
  'What did you see here?',
  'What were you working out?',
  'What stuck with you?',
  'What is worth keeping from this?',
  'What is clearer to you now?',
] as const;

export type NoteMarkPrompt = (typeof NOTE_MARK_PROMPTS)[number];

/** Days since the epoch, so the rotation turns over at the reader's own midnight. */
export function dayIndex(now: Date = new Date()): number {
  return Math.floor(
    new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() / 86_400_000,
  );
}

/**
 * The prompt for one note today.
 *
 * Seeded on the note and the day together: the same note asks the same thing all day, so a card
 * that survives a reload is not a different card, and two notes suggested on the same day rarely
 * ask the same question.
 */
export function noteMarkPrompt(noteId: string, day: number = dayIndex()): NoteMarkPrompt {
  const random = mulberry32(hashSeed(`${noteId}:${day}`));
  return NOTE_MARK_PROMPTS[Math.floor(random() * NOTE_MARK_PROMPTS.length)];
}
