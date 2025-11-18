import type { APIRoute } from 'astro';
import { getContentItems } from '@/utils/dashboard-data';

export const GET: APIRoute = async ({ request, locals }) => {
  try {
    const { userId } = locals.auth();
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const url = new URL(request.url);
    const offset = parseInt(url.searchParams.get('offset') || '0', 10);
    const limit = parseInt(url.searchParams.get('limit') || '20', 10);
    const filter = url.searchParams.get('filter') || 'all'; // 'all' | 'threads' | 'notes'

    // Fetch more items than needed to check if there are more
    const fetchLimit = filter === 'all' ? limit : limit * 3; 
    const items = await getContentItems(userId, fetchLimit, offset);

    // Filter by type if needed
    let filteredItems = items;
    if (filter === 'threads') {
      filteredItems = items.filter(item => item.type === 'thread');
    } else if (filter === 'notes') {
      filteredItems = items.filter(item => item.type === 'note');
    }

    // Take only the requested limit
    const limitedItems = filteredItems.slice(0, limit);
    
    // Check if there are more items
    const hasMore = limitedItems.length === limit && (items.length === fetchLimit || filteredItems.length > limit);

    return new Response(JSON.stringify({
      items: limitedItems,
      hasMore,
      offset,
      limit
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Error loading more content:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to load more content',
      details: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

