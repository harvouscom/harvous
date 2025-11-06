import type { APIRoute } from 'astro';
import { getInboxItemWithNotes } from '@/utils/inbox-data';

export const GET: APIRoute = async ({ url, locals }) => {
  try {
    const { userId } = locals.auth();
    
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
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

    return new Response(JSON.stringify({
      success: true,
      item: inboxItem,
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

