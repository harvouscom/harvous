export const prerender = false;

import type { APIRoute } from 'astro';
import { getAllThreadsWithCounts } from '@/utils/dashboard-data';
import { getThreadGradientCSS } from '@/utils/colors';
import { ensureUnorganizedThread } from '@/utils/unorganized-thread';
import { handleAPIError } from '@/utils/error-handling';

export const GET: APIRoute = async ({ locals }) => {
  try {
    // Get user ID from Clerk authentication
    const { userId } = locals.auth();
    
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Fetch threads from database
    const threads = await getAllThreadsWithCounts(userId);
    
    // Transform threads to match the expected format
    const threadOptions = threads.map(thread => ({
      id: thread.id,
      title: thread.title,
      color: thread.color,
      spaceId: (thread as any).spaceId || null,
      noteCount: thread.noteCount,
      backgroundGradient: thread.backgroundGradient || getThreadGradientCSS(thread.color || 'blue')
    }));
    
    // Ensure "Unorganized" thread exists with actual count
    // Call ensureUnorganizedThread once regardless of whether it exists in threadOptions
    const unorganizedThreadData = await ensureUnorganizedThread(userId);
    // CRITICAL: Only check by ID, not title - a thread with title "Unorganized" but different ID
    // (like a renamed onboarding thread) should NOT be treated as THE unorganized thread
    const hasUnorganizedThread = threadOptions.some(thread => 
      thread.id === 'thread_unorganized'
    );
    
    if (!hasUnorganizedThread) {
      // Add unorganized thread to the beginning of the list
      threadOptions.unshift({
        id: 'thread_unorganized',
        title: 'Unorganized',
        color: null,
        spaceId: null,
        noteCount: unorganizedThreadData.noteCount || 0,
        backgroundGradient: getThreadGradientCSS('paper')
      });
    } else {
      // Update existing unorganized thread with actual count
      // CRITICAL: Only match by ID to avoid confusion with other threads titled "Unorganized"
      const unorganizedIndex = threadOptions.findIndex(thread => 
        thread.id === 'thread_unorganized'
      );
      if (unorganizedIndex !== -1) {
        threadOptions[unorganizedIndex].noteCount = unorganizedThreadData.noteCount || 0;
        (threadOptions[unorganizedIndex] as any).spaceId = null;
      }
    }

    return new Response(JSON.stringify(threadOptions), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/threads/list',
      action: 'list_threads'
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
