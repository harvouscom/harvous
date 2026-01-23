import type { APIRoute } from 'astro';
import { db, UserInboxItems, InboxItems, eq, and, lt } from 'astro:db';
import { getAuthFromRequest, unauthorizedResponse } from '@/utils/auth-helpers';

export const prerender = false;

/**
 * Auto-archive endpoint that archives inbox items older than 14 days
 * This can be called:
 * 1. Manually via GET/POST
 * 2. As a scheduled job (Netlify Scheduled Functions, cron, etc.)
 */
export const POST: APIRoute = async ({ request, locals }) => {
  try {
    // Check authentication: either secret token OR authenticated user
    const authHeader = request.headers.get('authorization');
    const expectedToken = import.meta.env.AUTO_ARCHIVE_SECRET_TOKEN;
        const userId = await getAuthFromRequest(request);
    const isAuthenticated = auth?.userId;
    const hasValidToken = expectedToken && authHeader === `Bearer ${expectedToken}`;
    
    // Require either valid token (for scheduled jobs) or authenticated user (for client-side calls)
    if (expectedToken && !hasValidToken && !isAuthenticated) {
      return unauthorizedResponse();
    }

    // Calculate date 14 days ago, set to start of day for consistent comparison
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    fourteenDaysAgo.setHours(0, 0, 0, 0); // Set to start of day

    // Build query conditions
    const conditions = [
      eq(UserInboxItems.status, 'inbox'),
      eq(InboxItems.isActive, true),
      lt(UserInboxItems.createdAt, fourteenDaysAgo)
    ];

    // If authenticated user (not using secret token), only archive their items
    // Secret token calls archive all users' items (for scheduled jobs)
    if (isAuthenticated && !hasValidToken) {
      conditions.push(eq(UserInboxItems.userId, auth.userId));
    }

    // Find all inbox items that are:
    // 1. Still in 'inbox' status
    // 2. Created more than 14 days ago
    // 3. (If authenticated user) Belong to the authenticated user
    const itemsToArchive = await db
      .select({
        userInboxItem: UserInboxItems,
        inboxItem: InboxItems,
      })
      .from(UserInboxItems)
      .innerJoin(InboxItems, eq(UserInboxItems.inboxItemId, InboxItems.id))
      .where(and(...conditions));

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

