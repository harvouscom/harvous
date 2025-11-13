import type { APIRoute } from 'astro';
import { db, UserInboxItems, InboxItems, eq, and, lt } from 'astro:db';

/**
 * Auto-archive endpoint that archives inbox items older than 14 days
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

    // Calculate date 14 days ago
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);

    // Find all inbox items that are:
    // 1. Still in 'inbox' status
    // 2. Created more than 14 days ago
    const itemsToArchive = await db
      .select({
        userInboxItem: UserInboxItems,
        inboxItem: InboxItems,
      })
      .from(UserInboxItems)
      .innerJoin(InboxItems, eq(UserInboxItems.inboxItemId, InboxItems.id))
      .where(
        and(
          eq(UserInboxItems.status, 'inbox'),
          eq(InboxItems.isActive, true),
          lt(UserInboxItems.createdAt, fourteenDaysAgo)
        )
      );

    let archivedCount = 0;
    const errors: string[] = [];

    // Archive each item
    for (const { userInboxItem } of itemsToArchive) {
      try {
        await db
          .update(UserInboxItems)
          .set({
            status: 'archived',
            archivedAt: new Date(),
          })
          .where(eq(UserInboxItems.id, userInboxItem.id));
        
        archivedCount++;
      } catch (error: any) {
        console.error(`Error archiving item ${userInboxItem.id}:`, error);
        errors.push(`Failed to archive ${userInboxItem.id}: ${error.message}`);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      message: `Auto-archived ${archivedCount} item(s)`,
      archivedCount,
      errors: errors.length > 0 ? errors : undefined,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Error in auto-archive:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to auto-archive items',
      details: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

// Also support GET for easy manual triggering
export const GET: APIRoute = POST;

