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
      noteCount: thread.noteCount,
      backgroundGradient: thread.backgroundGradient || getThreadGradientCSS(thread.color || 'blue')
    }));
    
    // Ensure "Unorganized" thread exists with actual count
    // Call ensureUnorganizedThread once regardless of whether it exists in threadOptions
    const unorganizedThreadData = await ensureUnorganizedThread(userId);
    const hasUnorganizedThread = threadOptions.some(thread => 
      thread.title === "Unorganized" || thread.id === 'thread_unorganized'
    );
    
    if (!hasUnorganizedThread) {
      // Add unorganized thread to the beginning of the list
      threadOptions.unshift({
        id: 'thread_unorganized',
        title: 'Unorganized',
        color: null,
        noteCount: unorganizedThreadData.noteCount || 0,
        backgroundGradient: getThreadGradientCSS('paper')
      });
    } else {
      // Update existing unorganized thread with actual count
      const unorganizedIndex = threadOptions.findIndex(thread => 
        thread.title === "Unorganized" || thread.id === 'thread_unorganized'
      );
      if (unorganizedIndex !== -1) {
        threadOptions[unorganizedIndex].noteCount = unorganizedThreadData.noteCount || 0;
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
