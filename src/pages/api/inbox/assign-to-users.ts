import type { APIRoute } from 'astro';
import { db, InboxItems, UserInboxItems, UserMetadata, eq, and } from 'astro:db';

/**
 * Assign all active inbox items to all existing users
 * This fixes the issue where items were synced but not assigned to users
 */
export const POST: APIRoute = async ({ locals }) => {
  try {
    const { userId } = locals.auth();
    
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return await assignInboxItems();
  } catch (error: any) {
    console.error('Error assigning inbox items:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to assign inbox items',
      details: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

async function assignInboxItems() {
  try {

    // Get all active inbox items
    const allInboxItems = await db
      .select()
      .from(InboxItems)
      .where(eq(InboxItems.isActive, true));

    // Get all users
    const allUsers = await db.select().from(UserMetadata);

    let totalAssigned = 0;
    const results: string[] = [];

    for (const inboxItem of allInboxItems) {
      // Determine which users should have this item
      let usersToAssign = [];
      
      if (inboxItem.targetAudience === 'all_users' || inboxItem.targetAudience === 'all_new_users') {
        // Assign to all existing users (treat 'all_new_users' as 'all_users' for existing users)
        usersToAssign = allUsers;
      } else {
        continue; // Skip items with other target audiences
      }

      let assignedCount = 0;
      for (const user of usersToAssign) {
        // Check if already assigned
        const existing = await db
          .select()
          .from(UserInboxItems)
          .where(
            and(
              eq(UserInboxItems.userId, user.userId),
              eq(UserInboxItems.inboxItemId, inboxItem.id)
            )
          )
          .get();

        if (!existing) {
          await db.insert(UserInboxItems).values({
            id: `user_inbox_${user.userId}_${inboxItem.id}_${Date.now()}`,
            userId: user.userId,
            inboxItemId: inboxItem.id,
            status: 'inbox',
            createdAt: new Date(),
          });
          assignedCount++;
        }
      }

      if (assignedCount > 0) {
        results.push(`${inboxItem.title}: assigned to ${assignedCount} user(s)`);
        totalAssigned += assignedCount;
      }
    }

    return new Response(JSON.stringify({
      success: true,
      message: `Assigned inbox items to users`,
      totalAssigned,
      itemsProcessed: allInboxItems.length,
      usersProcessed: allUsers.length,
      results,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error: any) {
    console.error('Error assigning inbox items:', error);
    throw error;
  }
}

