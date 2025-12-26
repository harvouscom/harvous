import type { APIRoute } from 'astro';
import { getContentItems, getScriptureNotesForDashboard } from '@/utils/dashboard-data';

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
    const filter = url.searchParams.get('filter') || 'all'; // 'all' | 'threads' | 'notes' | 'scripture' | 'resources'

    // Optimized path for scripture filter - query directly from database
    if (filter === 'scripture') {
      console.log('[load-more API] Using optimized scripture query', { offset, limit });
      
      // The function fetches limit + 1 internally to check for more items
      const { items, hasMore } = await getScriptureNotesForDashboard(userId, limit, offset);
      
      console.log('[load-more API] Scripture notes result', {
        returned: items.length,
        hasMore,
        offset,
        limit
      });
      
      return new Response(JSON.stringify({
        items,
        hasMore,
        offset,
        limit
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // For other filters, use the existing getContentItems function
    // Fetch more items than needed to check if there are more
    const fetchLimit = filter === 'all' 
      ? limit 
      : limit * 3; 
    // Only exclude referenced scripture notes in the 'all' tab
    const filterExcludeReferencedScripture = filter === 'all';
    console.log('[load-more API] Filter params', { filter, filterExcludeReferencedScripture, fetchLimit, offset, limit });
    
    const items = await getContentItems(userId, fetchLimit, offset, filterExcludeReferencedScripture);
    console.log('[load-more API] Items returned', { 
      totalItems: items.length, 
      scriptureNotes: items.filter(item => item.type === 'note' && item.noteType === 'scripture').length 
    });

    // Filter by type if needed
    let filteredItems = items;
    if (filter === 'threads') {
      filteredItems = items.filter(item => item.type === 'thread');
    } else if (filter === 'notes') {
      // Only show default note type (exclude scripture and resource notes)
      filteredItems = items.filter(item => item.type === 'note' && (item.noteType === 'default' || !item.noteType));
    } else if (filter === 'resources') {
      filteredItems = items.filter(item => item.type === 'note' && item.noteType === 'resource');
    }

    // Take only the requested limit
    const limitedItems = filteredItems.slice(0, limit);
    
    console.log('[load-more API] Final result', {
      filter,
      filteredItemsCount: filteredItems.length,
      limitedItemsCount: limitedItems.length,
      limit,
      offset
    });
    
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

