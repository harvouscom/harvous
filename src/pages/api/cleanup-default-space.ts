import type { APIRoute } from 'astro';
import { db, Spaces, eq, and } from 'astro:db';

export const POST: APIRoute = async ({ locals }) => {
  try {
    // Get userId from authenticated context
    const { userId } = locals.auth();
    
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    console.log("Cleaning up default space for user:", userId);

    // Delete the default space for this user
    const result = await db.delete(Spaces)
      .where(and(eq(Spaces.id, 'default_space'), eq(Spaces.userId, userId)));

    console.log("Default space cleanup completed");

    return new Response(JSON.stringify({ 
      success: "Default space cleaned up successfully!"
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Error cleaning up default space:', error);
    return new Response(JSON.stringify({ 
      error: error.message || 'Failed to clean up default space' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
