import type { APIRoute } from 'astro';
import { db, UserInboxItems, InboxItems, eq, and } from 'astro:db';

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const { userId } = locals.auth();
    
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const body = await request.json();
    const { inboxItemId } = body;

    if (!inboxItemId) {
      return new Response(JSON.stringify({ error: 'inboxItemId is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check if user has this inbox item and get the inbox item for contentType
    const userInboxItem = await db
      .select({
        userInboxItem: UserInboxItems,
        inboxItem: InboxItems,
      })
      .from(UserInboxItems)
      .innerJoin(InboxItems, eq(UserInboxItems.inboxItemId, InboxItems.id))
      .where(
        and(
          eq(UserInboxItems.userId, userId),
          eq(UserInboxItems.inboxItemId, inboxItemId)
        )
      )
      .get();

    if (!userInboxItem) {
      return new Response(JSON.stringify({ error: 'Inbox item not found in your inbox' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check if item is actually archived
    if (userInboxItem.userInboxItem.status !== 'archived') {
      return new Response(JSON.stringify({ error: 'Item is not archived' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Update status back to inbox and clear archivedAt
    await db.update(UserInboxItems)
      .set({
        status: 'inbox',
        archivedAt: null,
      })
      .where(
        and(
          eq(UserInboxItems.userId, userId),
          eq(UserInboxItems.inboxItemId, inboxItemId)
        )
      );

    return new Response(JSON.stringify({
      success: true,
      message: 'Item unarchived successfully',
      contentType: userInboxItem.inboxItem.contentType,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Error unarchiving inbox item:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to unarchive inbox item',
      details: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

