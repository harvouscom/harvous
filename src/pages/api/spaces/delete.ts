import type { APIRoute } from 'astro';
import { db, Spaces, Threads, Notes, eq, and } from 'astro:db';

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

    // Get space ID from URL params
    const url = new URL(request.url);
    const spaceId = url.searchParams.get('spaceId');

    if (!spaceId) {
      return new Response(JSON.stringify({ error: 'Space ID is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    console.log("Deleting space with ID:", spaceId, "for user:", userId);

    // Verify the space belongs to the user before deleting
    const existingSpace = await db.select()
      .from(Spaces)
      .where(and(eq(Spaces.id, spaceId), eq(Spaces.userId, userId)))
      .get();

    if (!existingSpace) {
      return new Response(JSON.stringify({ error: 'Space not found or access denied' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // First, get all threads in this space
    const spaceThreads = await db.select({ id: Threads.id })
      .from(Threads)
      .where(and(eq(Threads.spaceId, spaceId), eq(Threads.userId, userId)));

    // Delete all notes in threads that belong to this space
    for (const thread of spaceThreads) {
      await db.delete(Notes)
        .where(and(eq(Notes.threadId, thread.id), eq(Notes.userId, userId)));
    }

    // Delete all threads in this space
    await db.delete(Threads)
      .where(and(eq(Threads.spaceId, spaceId), eq(Threads.userId, userId)));

    // Delete any standalone notes directly in this space
    await db.delete(Notes)
      .where(and(eq(Notes.spaceId, spaceId), eq(Notes.userId, userId)));

    // Finally, delete the space itself
    await db.delete(Spaces)
      .where(and(eq(Spaces.id, spaceId), eq(Spaces.userId, userId)));

    console.log("Space and all associated content deleted successfully:", spaceId);

    return new Response(JSON.stringify({ 
      success: "Space deleted successfully!",
      spaceId: spaceId
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Error deleting space:', error);
    return new Response(JSON.stringify({ 
      error: error.message || 'Failed to delete space' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
