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
    const updatedNotes: string[] = [];
    const updatedThreads: string[] = [];

    // Update notes
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

          // Update the note's spaceId
          await db.update(Notes)
            .set({ 
              spaceId: spaceId,
              updatedAt: new Date()
            })
            .where(and(eq(Notes.id, noteId), eq(Notes.userId, userId)));

          updatedNotes.push(noteId);
        } catch (error: any) {
          errors.push(`Failed to update note ${noteId}: ${error.message}`);
        }
      }
    }

    // Update threads
    if (threadIds.length > 0) {
      for (const threadId of threadIds) {
        try {
          // Don't allow moving unorganized thread
          if (threadId === 'thread_unorganized') {
            errors.push('Cannot move unorganized thread');
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

          // Update the thread's spaceId
          await db.update(Threads)
            .set({ 
              spaceId: spaceId,
              updatedAt: new Date()
            })
            .where(and(eq(Threads.id, threadId), eq(Threads.userId, userId)));

          updatedThreads.push(threadId);
        } catch (error: any) {
          errors.push(`Failed to update thread ${threadId}: ${error.message}`);
        }
      }
    }

    return new Response(JSON.stringify({
      success: true,
      message: `Added ${updatedNotes.length} note(s) and ${updatedThreads.length} thread(s) to space`,
      updatedNotes,
      updatedThreads,
      errors: errors.length > 0 ? errors : undefined
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Error adding items to space:', error);
    return new Response(JSON.stringify({ 
      error: error.message || 'Failed to add items to space' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

