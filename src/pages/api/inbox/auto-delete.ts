import type { APIRoute } from 'astro';
import { db, UserInboxItems, eq, and, lt } from 'astro:db';

/**
 * Auto-delete endpoint that permanently deletes archived items older than 30 days
 * This can be called:
 * 1. Manually via GET/POST
 * 2. As a scheduled job (Netlify Scheduled Functions, cron, etc.)
 */
export const POST: APIRoute = async ({ request, locals }) => {
  try {
    // Check authentication: either secret token OR authenticated user
    const authHeader = request.headers.get('authorization');
    const expectedToken = import.meta.env.AUTO_ARCHIVE_SECRET_TOKEN;
    const auth = locals.auth();
    const isAuthenticated = auth?.userId;
    const hasValidToken = expectedToken && authHeader === `Bearer ${expectedToken}`;
    
    // Require either valid token (for scheduled jobs) or authenticated user (for client-side calls)
    if (expectedToken && !hasValidToken && !isAuthenticated) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Calculate date 30 days ago, set to start of day for consistent comparison
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    thirtyDaysAgo.setHours(0, 0, 0, 0); // Set to start of day

    // Build query conditions
    const conditions = [
      eq(UserInboxItems.status, 'archived'),
      lt(UserInboxItems.archivedAt, thirtyDaysAgo)
    ];

    // If authenticated user (not using secret token), only delete their items
    // Secret token calls delete all users' items (for scheduled jobs)
    if (isAuthenticated && !hasValidToken) {
      conditions.push(eq(UserInboxItems.userId, auth.userId));
    }

    // Find all archived items that were archived more than 30 days ago
    // (If authenticated user) Only items belonging to the authenticated user
    const itemsToDelete = await db
      .select()
      .from(UserInboxItems)
      .where(and(...conditions))
      .all();

    let deletedCount = 0;
    const errors: string[] = [];

    // Delete each archived item
    for (const userInboxItem of itemsToDelete) {
      try {
        await db
          .delete(UserInboxItems)
          .where(eq(UserInboxItems.id, userInboxItem.id));
        
        deletedCount++;
      } catch (error: any) {
        console.error(`Error deleting archived item ${userInboxItem.id}:`, error);
        errors.push(`Failed to delete ${userInboxItem.id}: ${error.message}`);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      message: `Auto-deleted ${deletedCount} archived item(s)`,
      deletedCount,
      errors: errors.length > 0 ? errors : undefined,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Error in auto-delete:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to auto-delete archived items',
      details: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

// Also support GET for easy manual triggering
export const GET: APIRoute = POST;

