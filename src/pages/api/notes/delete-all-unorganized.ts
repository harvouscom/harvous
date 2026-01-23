import type { APIRoute } from 'astro';
import { db, Notes, eq, and } from 'astro:db';
import { getAuthFromRequest, unauthorizedResponse } from '@/utils/auth-helpers';

export const prerender = false;

export const DELETE: APIRoute = async ({ request, locals }) => {
  try {
    // Get authenticated user
    const userId = await getAuthFromRequest(request);
    if (!userId) {
      return unauthorizedResponse();
    }

    // Delete all notes from the unorganized thread
    const result = await db.delete(Notes)
      .where(and(
        eq(Notes.userId, userId),
        eq(Notes.threadId, 'thread_unorganized')
      ));


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
      error: 'Failed to erase notes from unorganized thread' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
