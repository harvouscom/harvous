import type { APIRoute } from 'astro';
import { db, UserMetadata, eq } from 'astro:db';

/**
 * Test endpoint to set note count for testing freemium limits
 * Only works in development mode
 * 
 * Usage:
 *   POST /api/test/set-note-count
 *   Body: { count: 999, userId: "user_xxx" }
 */
export const POST: APIRoute = async ({ request, locals }) => {
  // Only allow in development
  if (import.meta.env.PROD) {
    return new Response(JSON.stringify({ error: 'Not available in production' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const { userId: authUserId } = locals.auth();
    const body = await request.json();
    const { count, userId: targetUserId } = body;

    // Use authenticated user's ID or provided userId
    const userId = targetUserId || authUserId;

    if (!userId) {
      return new Response(JSON.stringify({ error: 'User ID required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (typeof count !== 'number' || count < 0) {
      return new Response(JSON.stringify({ error: 'Count must be a non-negative number' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get or create user metadata
    let userMetadata = await db
      .select()
      .from(UserMetadata)
      .where(eq(UserMetadata.userId, userId))
      .get();

    const previousCount = userMetadata?.highestSimpleNoteId || 0;

    if (!userMetadata) {
      await db.insert(UserMetadata).values({
        id: `user_metadata_${userId}`,
        userId: userId,
        highestSimpleNoteId: count,
        userColor: 'paper',
        createdAt: new Date()
      });
    } else {
      await db.update(UserMetadata)
        .set({ 
          highestSimpleNoteId: count,
          updatedAt: new Date()
        })
        .where(eq(UserMetadata.userId, userId));
    }

    return new Response(JSON.stringify({
      success: true,
      previousCount,
      newCount: count,
      message: `Note count updated from ${previousCount} to ${count}`,
      canCreateNote: count < 500,
      remaining: Math.max(0, 500 - count)
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    return new Response(JSON.stringify({ 
      error: error.message || 'Error setting note count'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

