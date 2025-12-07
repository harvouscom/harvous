import type { APIRoute } from 'astro';
import { db, InboxItems, UserInboxItems, UserMetadata, eq, and } from 'astro:db';
import { verifyInboxItemInWebflow } from '@/utils/webflow-verification';

/**
 * Clean reset of inbox items for all users
 * 
 * This endpoint:
 * 1. Clears all UserInboxItems for all users
 * 2. Verifies all InboxItems against Webflow
 * 3. Marks invalid items as inactive
 * 4. Reassigns only valid items to all users
 * 
 * This ensures all users only see items that currently exist in Webflow
 * with "Send to Harvous Inbox?" enabled.
 */
export const POST: APIRoute = async ({ request, locals }) => {
  try {
    // Optional: Require authentication
    const authHeader = request.headers.get('authorization');
    const expectedToken = import.meta.env.INBOX_RESET_SECRET_TOKEN;
    
    if (expectedToken && authHeader !== `Bearer ${expectedToken}`) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Step 1: Clear all UserInboxItems for all users
    const allUserInboxItems = await db.select().from(UserInboxItems).all();
    let clearedCount = 0;
    
    for (const userInboxItem of allUserInboxItems) {
      try {
        await db.delete(UserInboxItems).where(eq(UserInboxItems.id, userInboxItem.id));
        clearedCount++;
      } catch (error) {
        console.error(`Error deleting UserInboxItem ${userInboxItem.id}:`, error);
      }
    }

    // Step 2: Verify all InboxItems against Webflow
    const allInboxItems = await db.select().from(InboxItems).all();
    let verifiedCount = 0;
    let markedInactiveCount = 0;
    const validItems: string[] = [];
    const invalidItems: Array<{ id: string; reason: string }> = [];

    for (const inboxItem of allInboxItems) {
      if (!inboxItem.webflowItemId) {
        // Items without webflowItemId should be marked inactive
        try {
          await db
            .update(InboxItems)
            .set({ isActive: false, updatedAt: new Date() })
            .where(eq(InboxItems.id, inboxItem.id));
          markedInactiveCount++;
          invalidItems.push({ id: inboxItem.id, reason: 'No webflowItemId' });
        } catch (error) {
          console.error(`Error marking item ${inboxItem.id} as inactive:`, error);
        }
        continue;
      }

      // Verify item exists in Webflow and has toggle enabled
      const verification = await verifyInboxItemInWebflow(inboxItem.webflowItemId);
      verifiedCount++;

      if (!verification.isValid) {
        // Item no longer exists or toggle is disabled - mark as inactive
        try {
          await db
            .update(InboxItems)
            .set({ isActive: false, updatedAt: new Date() })
            .where(eq(InboxItems.id, inboxItem.id));
          markedInactiveCount++;
          invalidItems.push({ id: inboxItem.id, reason: verification.reason || 'Invalid' });
        } catch (error) {
          console.error(`Error marking item ${inboxItem.id} as inactive:`, error);
        }
      } else {
        // Item is valid - ensure it's marked as active
        if (!inboxItem.isActive) {
          await db
            .update(InboxItems)
            .set({ isActive: true, updatedAt: new Date() })
            .where(eq(InboxItems.id, inboxItem.id));
        }
        validItems.push(inboxItem.id);
      }
    }

    // Step 3: Reassign valid items to all users
    const allUsers = await db.select().from(UserMetadata).all();
    let totalAssigned = 0;
    const assignmentResults: string[] = [];

    for (const inboxItemId of validItems) {
      const inboxItem = await db
        .select()
        .from(InboxItems)
        .where(eq(InboxItems.id, inboxItemId))
        .get();

      if (!inboxItem || inboxItem.targetAudience !== 'all_users') {
        continue; // Skip items not targeted to all users
      }

      let assignedCount = 0;
      for (const user of allUsers) {
        try {
          await db.insert(UserInboxItems).values({
            id: `user_inbox_${user.userId}_${inboxItemId}_${Date.now()}`,
            userId: user.userId,
            inboxItemId: inboxItemId,
            status: 'inbox',
            createdAt: new Date(),
          });
          assignedCount++;
          totalAssigned++;
        } catch (error) {
          // Ignore duplicate key errors
        }
      }

      if (assignedCount > 0) {
        assignmentResults.push(`${inboxItem.title || inboxItemId}: assigned to ${assignedCount} user(s)`);
      }
    }

    const result = {
      success: true,
      message: 'Clean reset completed',
      summary: {
        clearedUserInboxItems: clearedCount,
        verifiedItems: verifiedCount,
        validItems: validItems.length,
        markedInactive: markedInactiveCount,
        totalUsers: allUsers.length,
        totalAssigned: totalAssigned,
      },
      invalidItems: invalidItems.slice(0, 20), // Limit to first 20 for response size
      assignmentResults: assignmentResults.slice(0, 20), // Limit to first 20 for response size
    };

    return new Response(JSON.stringify(result, null, 2), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Error during clean reset:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to reset inbox items',
      details: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

/**
 * GET endpoint for easy testing
 */
export const GET: APIRoute = async ({ request }) => {
  return new Response(JSON.stringify({ 
    message: 'Use POST method to reset inbox items',
    endpoint: '/api/inbox/reset-all-users',
    method: 'POST',
    note: 'Optional: Set INBOX_RESET_SECRET_TOKEN environment variable for authentication'
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
};
