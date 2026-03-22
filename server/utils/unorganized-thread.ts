/**
 * Unorganized thread utilities — Drizzle port of src/utils/unorganized-thread.ts
 */

import { db, first, Threads, Notes, NoteThreads, eq, and, count, isNull } from '../db';
import { nowISO } from '../db/dates';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function retryDbOperation<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  baseDelay: number = 50
): Promise<T> {
  let lastError: any;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      if (
        (error.message?.includes('SQLITE_BUSY') ||
          error.message?.includes('database is locked')) &&
        attempt < maxRetries - 1
      ) {
        const delay = baseDelay * Math.pow(2, attempt);
        await sleep(delay);
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

export async function ensureUnorganizedThread(userId: string) {
  try {
    const existingThread = await retryDbOperation(async () => {
      return first(await db.select({
        id: Threads.id,
        title: Threads.title,
        subtitle: Threads.subtitle,
        color: Threads.color,
        spaceId: Threads.spaceId,
        isPublic: Threads.isPublic,
        isPinned: Threads.isPinned,
        createdAt: Threads.createdAt,
        updatedAt: Threads.updatedAt,
      })
      .from(Threads)
      .where(and(
        eq(Threads.userId, userId),
        eq(Threads.id, "thread_unorganized")
      ))
      .limit(1));
    });

    if (!existingThread) {
      try {
        await retryDbOperation(async () => {
          await db.insert(Threads).values({
            id: "thread_unorganized",
            title: "Unorganized",
            subtitle: "Notes that haven't been organized into threads yet",
            spaceId: null,
            userId: userId,
            isPublic: true,
            isPinned: false,
            color: null,
            createdAt: nowISO(),
            updatedAt: nowISO(),
          });
        });
      } catch (insertError: any) {
        if (insertError.code === 'SQLITE_CONSTRAINT' ||
            insertError.cause?.code === 'SQLITE_CONSTRAINT' ||
            insertError.rawCode === 1555 ||
            insertError.message?.includes('UNIQUE constraint failed')) {
          // Single global thread_unorganized row exists (created by seed or another user); continue
        } else {
          console.error("Error creating unorganized thread:", insertError);
          throw insertError;
        }
      }
    }

    const noteCount = await retryDbOperation(async () => {
      return first(await db.select({ count: count() })
      .from(Notes)
      .leftJoin(NoteThreads, eq(NoteThreads.noteId, Notes.id))
      .where(and(
        eq(Notes.userId, userId),
        isNull(NoteThreads.id)
      ))
      .limit(1));
    });

    const threadData = {
      id: 'thread_unorganized',
      title: 'Unorganized',
      color: null,
      noteCount: noteCount?.count || 0,
      backgroundGradient: 'linear-gradient(180deg, var(--color-paper) 0%, var(--color-paper) 100%)'
    };

    return threadData;
  } catch (error) {
    console.error("Error in ensureUnorganizedThread:", error);
    return {
      id: 'thread_unorganized',
      title: 'Unorganized',
      color: null,
      noteCount: 0,
      backgroundGradient: 'linear-gradient(180deg, var(--color-paper) 0%, var(--color-paper) 100%)'
    };
  }
}
