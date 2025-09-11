import type { APIRoute } from 'astro';
import { db, Threads, Notes, eq, and } from 'astro:db';

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

    // First, delete all notes in this thread
    await db.delete(Notes)
      .where(and(eq(Notes.threadId, threadId), eq(Notes.userId, userId)));

    // Then delete the thread itself
    await db.delete(Threads)
      .where(and(eq(Threads.id, threadId), eq(Threads.userId, userId)));

    console.log("Thread and associated notes deleted successfully:", threadId);

    return new Response(JSON.stringify({ 
      success: "Thread deleted successfully!",
      threadId: threadId
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Error deleting thread:', error);
    return new Response(JSON.stringify({ 
      error: error.message || 'Failed to delete thread' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
