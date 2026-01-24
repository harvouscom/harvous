import type { APIRoute } from 'astro';
import { getInboxItemWithNotes } from '@/utils/inbox-data';
import { db, UserInboxItems, eq, and } from 'astro:db';

import { verifyToken } from '@clerk/backend';

export const prerender = false;

export const GET: APIRoute = async ({ request, url, locals  }) => {
  try {
    let userId: string | null = null;

    // SSR Mode: Use middleware auth
    if (locals?.auth) {
      const auth = locals.auth();
      userId = auth.userId || null;
    }
    // Static/Capacitor Mode: Verify JWT from Authorization header
    else {
      const authHeader = request.headers.get('Authorization');
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        try {
          const verified = await verifyToken(token, {
            secretKey: import.meta.env.CLERK_SECRET_KEY
          });
          userId = verified.sub;
        } catch (error) {
          console.error('[API Auth] Token verification failed:', error);
        }
      }
    }

    if (!userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
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

