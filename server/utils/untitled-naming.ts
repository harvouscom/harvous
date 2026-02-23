/**
 * Untitled naming utilities — Drizzle port of src/utils/untitled-naming.ts
 */

import { db, Threads, Notes, eq } from '../db';

export async function getNextUntitledThreadName(userId: string): Promise<string> {
  const prefix = 'Untitled Thread';

  const existingThreads = await db.select({ title: Threads.title })
    .from(Threads)
    .where(eq(Threads.userId, userId))
    .all();

  const usedNumbers: number[] = [];

  for (const thread of existingThreads) {
    const title = thread.title;
    if (title === prefix) {
      usedNumbers.push(0);
      continue;
    }
    const match = title.match(/^Untitled Thread (\d+)$/);
    if (match) {
      usedNumbers.push(parseInt(match[1], 10));
    }
  }

  const highestNumber = usedNumbers.length > 0 ? Math.max(...usedNumbers) : 0;
  return `${prefix} ${highestNumber + 1}`;
}

export async function getNextUntitledNoteName(userId: string): Promise<string> {
  const prefix = 'Untitled Note';

  const existingNotes = await db.select({ title: Notes.title })
    .from(Notes)
    .where(eq(Notes.userId, userId))
    .all();

  const usedNumbers: number[] = [];

  for (const note of existingNotes) {
    const title = note.title;
    if (!title) continue;
    if (title === prefix) {
      usedNumbers.push(0);
      continue;
    }
    const match = title.match(/^Untitled Note (\d+)$/);
    if (match) {
      usedNumbers.push(parseInt(match[1], 10));
    }
  }

  const highestNumber = usedNumbers.length > 0 ? Math.max(...usedNumbers) : 0;
  return `${prefix} ${highestNumber + 1}`;
}
