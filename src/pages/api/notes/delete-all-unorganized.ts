import type { APIRoute } from 'astro';
import { db, Notes, eq, and } from 'astro:db';

export const DELETE: APIRoute = async ({ request, locals }) => {
  try {
    // Get authenticated user
    const auth = await locals.auth();
    if (!auth?.userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const userId = auth.userId;
    console.log('Delete all unorganized notes for user:', userId);

    // Delete all notes from the unorganized thread
    const result = await db.delete(Notes)
      .where(and(
        eq(Notes.userId, userId),
        eq(Notes.threadId, 'thread_unorganized')
      ));

    console.log('Deleted notes from unorganized thread:', result);

    return new Response(JSON.stringify({ 
      success: true, 
      message: 'All notes deleted from unorganized thread' 
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error deleting unorganized thread notes:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to delete notes from unorganized thread' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
