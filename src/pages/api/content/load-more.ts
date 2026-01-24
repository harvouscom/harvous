import type { APIRoute } from 'astro';
import { getContentItems, getScriptureNotesForDashboard, getReferencedScriptureNotesWithoutLastVisited } from '@/utils/dashboard-data';

import { verifyToken } from '@clerk/backend';

export const prerender = false;

export const GET: APIRoute = async ({ request, locals }) => {
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

    const url = new URL(request.url);
    const offset = parseInt(url.searchParams.get('offset') || '0', 10);
    const limit = parseInt(url.searchParams.get('limit') || '20', 10);
    const filter = url.searchParams.get('filter') || 'all'; // 'all' | 'threads' | 'notes' | 'scripture' | 'resources'

    // Optimized path for scripture filter - query directly from database
    if (filter === 'scripture') {
      // The function fetches limit + 1 internally to check for more items
      const { items, hasMore } = await getScriptureNotesForDashboard(userId, limit, offset);
      
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
    
    const items = await getContentItems(userId, fetchLimit, offset, filterExcludeReferencedScripture);
    
    // For 'all' filter on initial load (offset === 0), also fetch referenced scripture notes without lastVisited
    // These should appear in the UI even though they're filtered out by the main API
    let referencedScriptureNotes: any[] = [];
    if (filter === 'all' && offset === 0) {
      referencedScriptureNotes = await getReferencedScriptureNotesWithoutLastVisited(userId);
    }

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
    
    // Check if there are more items
    const hasMore = limitedItems.length === limit && (items.length === fetchLimit || filteredItems.length > limit);

    return new Response(JSON.stringify({
      items: limitedItems,
      hasMore,
      offset,
      limit,
      referencedScriptureNotes: filter === 'all' && offset === 0 ? referencedScriptureNotes : undefined
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

