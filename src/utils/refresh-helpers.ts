/**
 * Utility functions for content list refresh operations
 */

/**
 * Retry a function with exponential backoff
 * @param fn - Function to retry (should return a promise)
 * @param maxAttempts - Maximum number of attempts (default: 3)
 * @param delays - Array of delays in ms between attempts (default: [100, 200, 400])
 * @returns Promise that resolves when function succeeds or all attempts fail
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  delays: number[] = [100, 200, 400]
): Promise<T | null> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const result = await fn();
      return result;
    } catch (error) {
      if (attempt < maxAttempts - 1) {
        const delay = delays[attempt] || delays[delays.length - 1];
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      // Last attempt failed, return null
      return null;
    }
  }
  return null;
}

/**
 * Verify that an item exists in a list after refresh
 * @param items - Array of items to check
 * @param expectedId - ID to look for
 * @param getId - Function to extract ID from an item (defaults to item.id)
 * @returns True if item exists
 */
export function verifyItemExists<T>(
  items: T[],
  expectedId: string,
  getId: (item: T) => string = (item: any) => item.id
): boolean {
  return items.some(item => {
    const id = getId(item);
    return id === expectedId || 
           id === `thread-${expectedId}` || 
           id === `note-${expectedId}` ||
           (item as any).threadId === expectedId ||
           (item as any).noteId === expectedId;
  });
}

/**
 * Create a set of all possible IDs for an item (for optimistic tracking)
 * Includes id, threadId, noteId, and prefixed versions
 */
export function getAllItemIds(item: { id: string; threadId?: string; noteId?: string }): Set<string> {
  const ids = new Set<string>();
  ids.add(item.id);
  if (item.threadId) {
    ids.add(item.threadId);
    ids.add(`thread-${item.threadId}`);
  }
  if (item.noteId) {
    ids.add(item.noteId);
    ids.add(`note-${item.noteId}`);
  }
  return ids;
}


