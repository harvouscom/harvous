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
    const filter = url.searchParams.get('filter') || 'all'; // 'all' | 'threads' | 'notes' | 'scripture' | 'resources'

    // Fetch more items than needed to check if there are more
    // For scripture filter, fetch a much larger number since most items might not be scripture notes
    const fetchLimit = filter === 'all' 
      ? limit 
      : filter === 'scripture' 
        ? Math.max(limit * 10, 500) // Fetch at least 10x the limit or 500 items, whichever is larger
        : limit * 3; 
    // Only exclude referenced scripture notes in the 'all' tab
    const filterExcludeReferencedScripture = filter === 'all';
    console.log('[load-more API] Filter params', { filter, filterExcludeReferencedScripture, fetchLimit, offset, limit });
    // For scripture filter, fetch from offset 0 to get all items, then filter and apply offset/limit after
    const fetchOffset = filter === 'scripture' ? 0 : offset;
    const items = await getContentItems(userId, fetchLimit, fetchOffset, filterExcludeReferencedScripture);
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
    } else if (filter === 'scripture') {
      filteredItems = items.filter(item => item.type === 'note' && item.noteType === 'scripture');
      console.log('[load-more API] After scripture filter', {
        totalItems: items.length,
        filteredScriptureItems: filteredItems.length,
        sampleNoteTypes: items.slice(0, 10).map(item => ({ type: item.type, noteType: item.noteType }))
      });
      // For scripture filter, apply offset after filtering since we fetched from offset 0
      filteredItems = filteredItems.slice(offset, offset + limit);
    } else if (filter === 'resources') {
      filteredItems = items.filter(item => item.type === 'note' && item.noteType === 'resource');
    }

    // Take only the requested limit (already applied for scripture filter above)
    const limitedItems = filter === 'scripture' ? filteredItems : filteredItems.slice(0, limit);
    
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

