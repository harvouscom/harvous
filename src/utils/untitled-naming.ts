import { db, Threads, Notes, eq, like } from 'astro:db';

/**
 * Get the next available numbered name for untitled threads.
 * Queries existing threads with "Untitled Thread N" pattern and returns the next number.
 * 
 * @param userId - The user's ID to query their threads
 * @returns The next available name, e.g., "Untitled Thread 1", "Untitled Thread 2", etc.
 */
export async function getNextUntitledThreadName(userId: string): Promise<string> {
  const prefix = 'Untitled Thread';
  
  // Query all threads that match "Untitled Thread" or "Untitled Thread N"
  const existingThreads = await db.select({ title: Threads.title })
    .from(Threads)
    .where(eq(Threads.userId, userId));
  
  // Filter and extract numbers from matching titles
  const usedNumbers: number[] = [];
  
  for (const thread of existingThreads) {
    const title = thread.title;
    
    // Match exact "Untitled Thread" (treat as 0, will be skipped)
    if (title === prefix) {
      usedNumbers.push(0);
      continue;
    }
    
    // Match "Untitled Thread N" pattern
    const match = title.match(/^Untitled Thread (\d+)$/);
    if (match) {
      usedNumbers.push(parseInt(match[1], 10));
    }
  }
  
  // Find the highest number and return next
  const highestNumber = usedNumbers.length > 0 ? Math.max(...usedNumbers) : 0;
  return `${prefix} ${highestNumber + 1}`;
}

/**
 * Get the next available numbered name for untitled notes.
 * Queries existing notes with "Untitled Note N" pattern and returns the next number.
 * 
 * @param userId - The user's ID to query their notes
 * @returns The next available name, e.g., "Untitled Note 1", "Untitled Note 2", etc.
 */
export async function getNextUntitledNoteName(userId: string): Promise<string> {
  const prefix = 'Untitled Note';
  
  // Query all notes that have titles
  const existingNotes = await db.select({ title: Notes.title })
    .from(Notes)
    .where(eq(Notes.userId, userId));
  
  // Filter and extract numbers from matching titles
  const usedNumbers: number[] = [];
  
  for (const note of existingNotes) {
    const title = note.title;
    if (!title) continue;
    
    // Match exact "Untitled Note" (treat as 0, will be skipped)
    if (title === prefix) {
      usedNumbers.push(0);
      continue;
    }
    
    // Match "Untitled Note N" pattern
    const match = title.match(/^Untitled Note (\d+)$/);
    if (match) {
      usedNumbers.push(parseInt(match[1], 10));
    }
  }
  
  // Find the highest number and return next
  const highestNumber = usedNumbers.length > 0 ? Math.max(...usedNumbers) : 0;
  return `${prefix} ${highestNumber + 1}`;
}

