/**
 * The invitation to write about a chapter you just read.
 *
 * The sibling of `note-mark-prompts.ts`, and here for the same reason those five questions left
 * Review: they have no right answer, nothing to compare against, and no way to be wrong. What
 * they want is for you to write something, which makes them a suggestion rather than a question.
 *
 * The Bible reader has been recording chapters for months and nothing on Home ever offered to
 * start a note from one. This is that offer, and it is the near half of the loop whose far half
 * is the `chapter` review kind: read a chapter, be invited to write about it today, be asked
 * about it later.
 *
 * Pure. No reading knowledge beyond the chapter it is handed.
 */

import { hashSeed, mulberry32 } from '@/utils/verse-cloze';
import { dayIndex } from '@/utils/note-mark-prompts';

/**
 * Five, in the second person, about the text rather than about the reader.
 *
 * Each one can be answered by someone who has just read a chapter and has not yet decided what
 * they think of it — which is the state this card finds people in. Nothing here asks for a
 * summary: a chapter summary is a task, and the shelf this sits on is not a task list.
 */
export const READING_NOTE_PROMPTS = [
  'What stood out?',
  'Where did it press on you?',
  'What would you ask the writer?',
  'What did you not expect?',
  'Which line would you keep?',
] as const;

export type ReadingNotePrompt = (typeof READING_NOTE_PROMPTS)[number];

/**
 * The prompt for one chapter today.
 *
 * Seeded on the chapter and the day together, exactly as the note-mark rotation is: the same
 * chapter asks the same thing all day, so a card that survives a reload is the same card.
 */
export function readingNotePrompt(
  book: string,
  chapter: number,
  day: number = dayIndex(),
): ReadingNotePrompt {
  const random = mulberry32(hashSeed(`${book}|${chapter}:${day}`));
  return READING_NOTE_PROMPTS[Math.floor(random() * READING_NOTE_PROMPTS.length)];
}

/** How long a read stays worth writing about. Today or yesterday; past that it is not news. */
export const READING_NOTE_WINDOW_DAYS = 2;

/**
 * "You read this today" / "yesterday", or null once it is neither.
 *
 * By calendar day in the reader's own zone rather than by elapsed hours: someone reading at
 * eleven at night and opening Home at eight the next morning read it *yesterday*, and "9 hours
 * ago" is a timestamp, not a memory.
 */
export function readingNoteEyebrow(readAt: string | Date, now: Date = new Date()): string | null {
  const at = readAt instanceof Date ? readAt : new Date(readAt);
  if (!Number.isFinite(at.getTime())) return null;
  const days = dayIndex(now) - dayIndex(at);
  if (days === 0) return 'You read this today';
  if (days === 1) return 'You read this yesterday';
  return null;
}
