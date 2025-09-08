import type { APIRoute } from 'astro';
import { getAllThreadsWithCounts } from '@/utils/dashboard-data';

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
      backgroundGradient: thread.backgroundGradient || `linear-gradient(180deg, var(--color-${thread.color || 'blessed-blue'}) 0%, var(--color-${thread.color || 'blessed-blue'}) 100%)`
    }));
    
    // Ensure "Unorganized" thread exists
    const hasUnorganizedThread = threadOptions.some(thread => thread.title === "Unorganized");
    if (!hasUnorganizedThread) {
      threadOptions.unshift({
        id: 'thread_unorganized',
        title: 'Unorganized',
        color: null,
        noteCount: 0,
        backgroundGradient: 'linear-gradient(180deg, var(--color-paper) 0%, var(--color-paper) 100%)'
      });
    }

    return new Response(JSON.stringify(threadOptions), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Error fetching threads:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
