import type { APIRoute } from 'astro';
import { db, UserMetadata, eq } from 'astro:db';

export const GET: APIRoute = async ({ locals }) => {
  try {
    const { userId } = locals.auth();
    
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get user metadata including color preference
    const userMetadata = await db.select().from(UserMetadata).where(eq(UserMetadata.userId, userId)).get();
    
    const userColor = userMetadata?.userColor || 'paper';

    return new Response(JSON.stringify({ 
      userColor
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error fetching user profile:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
