import type { APIRoute } from 'astro';
import { db, Threads, Notes, NoteThreads, eq, and } from 'astro:db';

export const DELETE: APIRoute = async ({ request, locals }) => {
  try {
    // Get userId from authenticated context
    const { userId } = locals.auth();
    
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get thread ID from URL params
    const url = new URL(request.url);
    const threadId = url.searchParams.get('threadId');

    if (!threadId) {
      return new Response(JSON.stringify({ error: 'Thread ID is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    console.log("Deleting thread with ID:", threadId, "for user:", userId);

    // Verify the thread belongs to the user before deleting
    const existingThread = await db.select()
      .from(Threads)
      .where(and(eq(Threads.id, threadId), eq(Threads.userId, userId)))
      .get();

    if (!existingThread) {
      return new Response(JSON.stringify({ error: 'Thread not found or access denied' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Don't allow deleting the unorganized thread
    if (threadId === 'thread_unorganized') {
      return new Response(JSON.stringify({ error: 'Cannot delete the unorganized thread' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Remove all NoteThreads relationships for this thread
    // Notes automatically become unorganized when junction entries are deleted
    const affectedNotes = await db.select({ noteId: NoteThreads.noteId })
      .from(NoteThreads)
      .where(eq(NoteThreads.threadId, threadId))
      .all();
    
    await db.delete(NoteThreads)
      .where(eq(NoteThreads.threadId, threadId));
    
    // Set all affected notes' primary threadId to unorganized (legacy field)
    if (affectedNotes.length > 0) {
      const noteIds = affectedNotes.map(n => n.noteId);
      // Update each note individually (Astro DB doesn't support IN clause directly)
      for (const noteId of noteIds) {
        await db.update(Notes)
          .set({ 
            threadId: 'thread_unorganized',
            updatedAt: new Date()
          })
          .where(and(eq(Notes.id, noteId), eq(Notes.userId, userId)));
      }
    }

    // Then delete the thread itself
    await db.delete(Threads)
      .where(and(eq(Threads.id, threadId), eq(Threads.userId, userId)));

    console.log("Thread deleted and notes moved to unorganized thread:", threadId);

    // Dispatch thread deleted event for navigation updates
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('threadDeleted', {
        detail: { threadId: threadId }
      }));
    }

    return new Response(JSON.stringify({ 
      success: "Thread erased successfully! Notes have been moved to the Unorganized thread.",
      threadId: threadId
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Error deleting thread:', error);
    return new Response(JSON.stringify({ 
      error: error.message || 'Failed to erase thread' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
