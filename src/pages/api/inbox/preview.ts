import type { APIRoute } from 'astro';
import { getInboxItemWithNotes } from '@/utils/inbox-data';
import { db, UserInboxItems, eq, and } from 'astro:db';
import { getAuthFromRequest, unauthorizedResponse } from '@/utils/auth-helpers';

export const prerender = false;

export const GET: APIRoute = async ({ request, url, locals  }) => {
  try {
    const userId = await getAuthFromRequest(request);
    
    if (!userId) {
      return unauthorizedResponse();
    }

    const inboxItemId = url.searchParams.get('inboxItemId');

    if (!inboxItemId) {
      return new Response(JSON.stringify({ error: 'inboxItemId is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const inboxItem = await getInboxItemWithNotes(inboxItemId);

    if (!inboxItem) {
      return new Response(JSON.stringify({ error: 'Inbox item not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get user's status for this item
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

    const userStatus = userInboxItem?.status || null;

    return new Response(JSON.stringify({
      success: true,
      item: {
        ...inboxItem,
        userStatus: userStatus,
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Error fetching inbox item preview:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to fetch inbox item preview',
      details: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

