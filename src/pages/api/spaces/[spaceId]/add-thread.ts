import type { APIRoute } from 'astro';
import { db, Threads, Spaces, eq, and } from 'astro:db';

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
    const { threadId } = body;

    if (!spaceId) {
      return new Response(JSON.stringify({ error: 'Space ID is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!threadId) {
      return new Response(JSON.stringify({ error: 'Thread ID is required' }), {
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

    // Verify the thread exists and belongs to the user
    const thread = await db.select()
      .from(Threads)
      .where(and(eq(Threads.id, threadId), eq(Threads.userId, userId)))
      .get();

    if (!thread) {
      return new Response(JSON.stringify({ error: 'Thread not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Don't allow moving unorganized thread
    if (threadId === 'thread_unorganized') {
      return new Response(JSON.stringify({ error: 'Cannot move unorganized thread' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Update the thread's spaceId
    await db.update(Threads)
      .set({ 
        spaceId: spaceId,
        updatedAt: new Date()
      })
      .where(and(eq(Threads.id, threadId), eq(Threads.userId, userId)));

    return new Response(JSON.stringify({
      success: true,
      message: 'Thread added to space successfully'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Error adding thread to space:', error);
    return new Response(JSON.stringify({ 
      error: error.message || 'Failed to add thread to space' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

