import type { APIRoute } from 'astro';
import { getSpacesWithCounts } from '@/utils/dashboard-data';

/**
 * Prefetch endpoint for space content
 * Returns space metadata
 * Used by EditSpacePanel to fetch fresh data on mount
 */
export const GET: APIRoute = async ({ params, locals }) => {
  try {
    const { userId } = locals.auth();
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const { spaceId } = params;
    if (!spaceId) {
      return new Response(JSON.stringify({ error: 'Space ID required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Fetch space data
    const spaces = await getSpacesWithCounts(userId);
    const space = spaces.find(s => s.id === spaceId);

    if (!space) {
      return new Response(JSON.stringify({ error: 'Space not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Return lightweight response optimized for caching
    return new Response(JSON.stringify({
      space: {
        id: space.id,
        title: space.title,
        color: space.color,
        backgroundGradient: space.backgroundGradient,
        totalItemCount: space.totalItemCount
      }
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        // Cache for 2 minutes in browser, allow stale responses while revalidating
        'Cache-Control': 'private, max-age=120, stale-while-revalidate=300'
      }
    });
  } catch (error: any) {
    console.error('[prefetch] Error fetching space data:', error);
    return new Response(JSON.stringify({
      error: 'Failed to fetch space data',
      details: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
