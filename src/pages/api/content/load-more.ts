export const prerender = false;

import type { APIRoute } from 'astro';
import { getContentItems, getScriptureNotesForDashboard, getReferencedScriptureNotesWithoutLastVisited } from '@/utils/dashboard-data';

const jsonHeaders = { 'Content-Type': 'application/json' } as const;

function errorResponse(message: string, details?: string): Response {
  return new Response(
    JSON.stringify({ error: message, details: details ?? message }),
    { status: 500, headers: jsonHeaders }
  );
}

export const GET: APIRoute = async ({ request, locals }) => {
  try {
    try {
      const { userId } = locals.auth();
      if (!userId) {
        return new Response(JSON.stringify({ error: 'Authentication required' }), {
          status: 401,
          headers: jsonHeaders
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
          headers: jsonHeaders
        });
      }

      // For other filters, use the existing getContentItems function.
      // Use limit + offset (no 3x over-fetch); hasMore is still correct after client-side filter + slice.
      const fetchLimit = limit + offset;
      // Only exclude referenced scripture notes in the 'all' tab
      const filterExcludeReferencedScripture = filter === 'all';

      // For 'all' filter on initial load, fetch content and referenced scripture notes in parallel
      let items: Awaited<ReturnType<typeof getContentItems>>;
      let referencedScriptureNotes: any[] = [];
      if (filter === 'all' && offset === 0) {
        [items, referencedScriptureNotes] = await Promise.all([
          getContentItems(userId, fetchLimit, offset, filterExcludeReferencedScripture),
          getReferencedScriptureNotesWithoutLastVisited(userId)
        ]);
      } else {
        items = await getContentItems(userId, fetchLimit, offset, filterExcludeReferencedScripture);
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
        headers: jsonHeaders
      });
    } catch (innerError: unknown) {
      const err = innerError instanceof Error ? innerError : new Error(String(innerError));
      console.error('Error loading more content:', err);
      if (err.stack) {
        console.error('Error stack:', err.stack);
      }
      return errorResponse('Failed to load more content', err.message);
    }
  } catch (outerError: unknown) {
    // Top-level catch: ensure no throw escapes (e.g. from JSON.stringify or Response)
    const message = outerError instanceof Error ? outerError.message : String(outerError);
    const stack = outerError instanceof Error ? outerError.stack : undefined;
    console.error('Load-more API fatal error:', outerError);
    if (stack) {
      console.error('Fatal stack:', stack);
    }
    return errorResponse('Failed to load more content', message);
  }
};

