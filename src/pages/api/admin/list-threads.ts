/**
 * Debug endpoint to list all threads for the current user
 * GET /api/admin/list-threads
 */

import type { APIRoute } from 'astro';
import { db, Threads, eq } from 'astro:db';

export const GET: APIRoute = async ({ request, locals }) => {
  try {
    const { userId } = locals.auth();

    if (!userId) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get all threads for this user
    const threads = await db.select()
      .from(Threads)
      .where(eq(Threads.userId, userId))
      .all();

    return new Response(JSON.stringify({
      success: true,
      userId,
      threadCount: threads.length,
      threads: threads.map(t => ({
        id: t.id,
        title: t.title,
        isPinned: t.isPinned
      }))
    }, null, 2), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Error listing threads:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message || 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
