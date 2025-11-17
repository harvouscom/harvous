import type { APIRoute } from 'astro';
import { db, UserInboxItems, eq, and, lt } from 'astro:db';

/**
 * Auto-delete endpoint that permanently deletes archived items older than 60 days
 * This can be called:
 * 1. Manually via GET/POST
 * 2. As a scheduled job (Netlify Scheduled Functions, cron, etc.)
 */
export const POST: APIRoute = async ({ request, locals }) => {
  try {
    // Optional: Require authentication for manual triggers
    // For scheduled jobs, you might want to use a secret token instead
    const authHeader = request.headers.get('authorization');
    const expectedToken = import.meta.env.AUTO_ARCHIVE_SECRET_TOKEN;
    
    if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Calculate date 60 days ago
    const sixtyDaysAgo = new Date();
    sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);

    // Find all archived items that were archived more than 60 days ago
    const itemsToDelete = await db
      .select()
      .from(UserInboxItems)
      .where(
        and(
          eq(UserInboxItems.status, 'archived'),
          lt(UserInboxItems.archivedAt, sixtyDaysAgo)
        )
      )
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

