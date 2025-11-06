import type { APIRoute } from 'astro';
import { db, UserInboxItems, eq, and } from 'astro:db';

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

    // Check if user has this inbox item
    const userInboxItem = await db
      .select()
      .from(UserInboxItems)
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

    // Update status to archived
    await db.update(UserInboxItems)
      .set({
        status: 'archived',
        archivedAt: new Date(),
      })
      .where(
        and(
          eq(UserInboxItems.userId, userId),
          eq(UserInboxItems.inboxItemId, inboxItemId)
        )
      );

    return new Response(JSON.stringify({
      success: true,
      message: 'Item archived successfully',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Error archiving inbox item:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to archive inbox item',
      details: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

