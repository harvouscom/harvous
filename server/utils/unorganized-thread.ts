/**
 * Sentinel thread utilities (display title: My Pile — id `thread_unorganized`)
 */

import { db, first, Threads, Notes, NoteThreads, eq, and, count, isNull } from '../db';
import { nowISO } from '../db/dates';
import { MY_PILE_THREAD_TITLE } from '@/utils/my-pile-thread';

export async function ensureUnorganizedThread(userId: string) {
  try {
    const existingThread = first(await db.select({
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

    if (existingThread && existingThread.title !== MY_PILE_THREAD_TITLE) {
      await db.update(Threads)
        .set({ title: MY_PILE_THREAD_TITLE, updatedAt: nowISO() })
        .where(eq(Threads.id, 'thread_unorganized'));
    }

    if (!existingThread) {
      try {
        await db.insert(Threads).values({
          id: "thread_unorganized",
          title: MY_PILE_THREAD_TITLE,
          subtitle: "Notes that haven't been organized into threads yet",
          spaceId: null,
          userId: userId,
          isPublic: true,
          isPinned: false,
          color: null,
          createdAt: nowISO(),
          updatedAt: nowISO(),
        });
      } catch (insertError: any) {
        // Postgres unique violation (23505): row already created by another request; continue
        if (insertError.code === '23505' || insertError.message?.includes('unique constraint')) {
          // no-op
        } else {
          console.error("Error creating unorganized thread:", insertError);
          throw insertError;
        }
      }
    }

    // Count unorganized notes (not in any thread).
    // The navigation route supplements this with getThreadNoteTypeCounts()
    // which also includes referenced scripture notes.
    const noteCount = first(await db.select({ count: count() })
      .from(Notes)
      .leftJoin(NoteThreads, eq(NoteThreads.noteId, Notes.id))
      .where(and(
        eq(Notes.userId, userId),
        isNull(NoteThreads.id)
      ))
      .limit(1));

    const threadData = {
      id: 'thread_unorganized',
      title: MY_PILE_THREAD_TITLE,
      color: null,
      noteCount: noteCount?.count || 0,
      backgroundGradient: 'linear-gradient(180deg, var(--color-paper) 0%, var(--color-paper) 100%)'
    };

    return threadData;
  } catch (error) {
    console.error("Error in ensureUnorganizedThread:", error);
    return {
      id: 'thread_unorganized',
      title: MY_PILE_THREAD_TITLE,
      color: null,
      noteCount: 0,
      backgroundGradient: 'linear-gradient(180deg, var(--color-paper) 0%, var(--color-paper) 100%)'
    };
  }
}
