import type { APIRoute } from 'astro';
import { db, Notes, Threads, Spaces, eq, and } from 'astro:db';

export const POST: APIRoute = async ({ params, request, locals }) => {
  try {
    const { userId } = locals.auth();
    
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const { spaceId } = params;
    const body = await request.json();
    const { noteIds = [], threadIds = [] } = body;

    if (!spaceId) {
      return new Response(JSON.stringify({ error: 'Space ID is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Verify the space exists and belongs to the user
    const space = await db.select()
      .from(Spaces)
      .where(and(eq(Spaces.id, spaceId), eq(Spaces.userId, userId)))
      .get();

    if (!space) {
      return new Response(JSON.stringify({ error: 'Space not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const errors: string[] = [];
    const removedNotes: string[] = [];
    const removedThreads: string[] = [];

    // Remove notes from space (set spaceId to null)
    if (noteIds.length > 0) {
      for (const noteId of noteIds) {
        try {
          // Verify the note exists and belongs to the user
          const note = await db.select()
            .from(Notes)
            .where(and(eq(Notes.id, noteId), eq(Notes.userId, userId)))
            .get();

          if (!note) {
            errors.push(`Note ${noteId} not found`);
            continue;
          }

          // Verify the note is actually in this space
          if (note.spaceId !== spaceId) {
            errors.push(`Note ${noteId} is not in this space`);
            continue;
          }

          // Set spaceId to null
          await db.update(Notes)
            .set({ 
              spaceId: null,
              updatedAt: new Date()
            })
            .where(and(eq(Notes.id, noteId), eq(Notes.userId, userId)));

          removedNotes.push(noteId);
        } catch (error: any) {
          errors.push(`Failed to remove note ${noteId}: ${error.message}`);
        }
      }
    }

    // Remove threads from space (set spaceId to null)
    if (threadIds.length > 0) {
      for (const threadId of threadIds) {
        try {
          // Don't allow removing unorganized thread
          if (threadId === 'thread_unorganized') {
            errors.push('Cannot remove unorganized thread');
            continue;
          }

          // Verify the thread exists and belongs to the user
          const thread = await db.select()
            .from(Threads)
            .where(and(eq(Threads.id, threadId), eq(Threads.userId, userId)))
            .get();

          if (!thread) {
            errors.push(`Thread ${threadId} not found`);
            continue;
          }

          // Verify the thread is actually in this space
          if (thread.spaceId !== spaceId) {
            errors.push(`Thread ${threadId} is not in this space`);
            continue;
          }

          // Set spaceId to null
          await db.update(Threads)
            .set({ 
              spaceId: null,
              updatedAt: new Date()
            })
            .where(and(eq(Threads.id, threadId), eq(Threads.userId, userId)));

          removedThreads.push(threadId);
        } catch (error: any) {
          errors.push(`Failed to remove thread ${threadId}: ${error.message}`);
        }
      }
    }

    return new Response(JSON.stringify({
      success: true,
      message: `Removed ${removedNotes.length} note(s) and ${removedThreads.length} thread(s) from space`,
      removedNotes,
      removedThreads,
      errors: errors.length > 0 ? errors : undefined
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Error removing items from space:', error);
    return new Response(JSON.stringify({ 
      error: error.message || 'Failed to remove items from space' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

