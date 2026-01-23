import type { APIRoute } from 'astro';
import { getAllThreadsWithCounts, getSpacesWithCounts, getInboxDisplayCount } from '@/utils/dashboard-data';
import { getThreadGradientCSS } from '@/utils/colors';
import { handleAPIError } from '@/utils/error-handling';
import { ensureUnorganizedThread } from '@/utils/unorganized-thread';
import { getAuthFromRequest, unauthorizedResponse } from '@/utils/auth-helpers';

export const prerender = false;

export const GET: APIRoute = async ({ request, locals  }) => {
  try {
    const userId = await getAuthFromRequest(request);

    if (!userId) {
      return unauthorizedResponse();
    }
    
    // Fetch navigation data in parallel
    const [threads, spaces, inboxCount, unorganizedThreadData] = await Promise.all([
      getAllThreadsWithCounts(userId),
      getSpacesWithCounts(userId),
      getInboxDisplayCount(userId),
      ensureUnorganizedThread(userId)
    ]);
    
    // Ensure threads and spaces have backgroundGradient property
    const threadsWithGradients = threads.map(thread => ({
      ...thread,
      backgroundGradient: thread.backgroundGradient || getThreadGradientCSS(thread.color || 'blue')
    }));
    
    // Always include unorganized thread in the threads array (even if count is 0)
    // This ensures refreshNavigationCounts() can always update the unorganized count
    // and prevents stale counts from persisting
    threadsWithGradients.push({
      id: 'thread_unorganized',
      title: 'Unorganized',
      subtitle: 'Notes that haven\'t been organized into threads yet',
      color: null,
      spaceId: null,
      isPublic: true,
      isPinned: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      noteCount: unorganizedThreadData.noteCount || 0,
      lastUpdated: new Date(),
      accentColor: getThreadGradientCSS('paper'),
      backgroundGradient: unorganizedThreadData.backgroundGradient || getThreadGradientCSS('paper')
    });
    
    const spacesWithGradients = spaces.map(space => ({
      ...space,
      backgroundGradient: space.backgroundGradient || getThreadGradientCSS(space.color || 'paper')
    }));
    
    return new Response(JSON.stringify({
      threads: threadsWithGradients,
      spaces: spacesWithGradients,
      inboxCount
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'private, max-age=60, stale-while-revalidate=120' // Cache 1 min, serve stale up to 3 min while revalidating
      }
    });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/navigation/data',
      action: 'get_navigation_data'
    });
    return new Response(JSON.stringify({ 
      error: standardError.message,
      code: standardError.code
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

