import type { APIRoute } from 'astro';
import { db, UserInboxItems, InboxItems, eq, and } from 'astro:db';
import { rateLimitMiddleware, getClientIP } from '@/utils/rate-limit';

import { verifyToken } from '@clerk/backend';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
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

    // Rate limiting for write operations
    const ip = getClientIP(request);
    const rateLimit = rateLimitMiddleware(userId, '/api/inbox/unarchive', 'write', ip);
    if (!rateLimit.allowed) {
      return new Response(JSON.stringify({ 
        error: rateLimit.error,
        code: 'RATE_LIMIT_EXCEEDED'
      }), {
        status: 429,
        headers: { 
          'Content-Type': 'application/json',
          'X-RateLimit-Remaining': String(rateLimit.remaining || 0),
          'X-RateLimit-Reset': String(rateLimit.resetTime || Date.now())
        }
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

    // Ensure the InboxItems record is active so it appears in inbox
    // getInboxItems() filters by isActive: true, so we need to ensure it's set
    await db.update(InboxItems)
      .set({
        isActive: true,
        updatedAt: new Date(),
      })
      .where(eq(InboxItems.id, inboxItemId));

    return new Response(JSON.stringify({
      success: true,
      message: 'Item unarchived',
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

