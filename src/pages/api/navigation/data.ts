import type { APIRoute } from 'astro';
import { getAllThreadsWithCounts, getSpacesWithCounts, getInboxDisplayCount } from '@/utils/dashboard-data';
import { getThreadGradientCSS } from '@/utils/colors';

export const GET: APIRoute = async ({ locals }) => {
  try {
    const auth = locals.auth();
    const { userId } = auth;
    
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Fetch navigation data in parallel
    const [threads, spaces, inboxCount] = await Promise.all([
      getAllThreadsWithCounts(userId),
      getSpacesWithCounts(userId),
      getInboxDisplayCount(userId)
    ]);
    
    // Ensure threads and spaces have backgroundGradient property
    const threadsWithGradients = threads.map(thread => ({
      ...thread,
      backgroundGradient: thread.backgroundGradient || getThreadGradientCSS(thread.color || 'blue')
    }));
    
    const spacesWithGradients = spaces.map(space => ({
      ...space,
      backgroundGradient: space.backgroundGradient || getThreadGradientCSS(space.color || 'blue')
    }));
    
    return new Response(JSON.stringify({
      threads: threadsWithGradients,
      spaces: spacesWithGradients,
      inboxCount
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'private, max-age=30' // Cache for 30 seconds
      }
    });
  } catch (error) {
    console.error('Error fetching navigation data:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to fetch navigation data',
      details: error instanceof Error ? error.message : String(error)
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

