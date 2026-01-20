import type { APIRoute } from 'astro';
import { getThreadWithCount, getNotesForThread, getThreadNoteTypeCounts } from '@/utils/dashboard-data';

/**
 * Prefetch endpoint for thread content
 * Returns thread metadata, notes, and note type counts
 * Used by thread cache prefetching system
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

    const { threadId } = params;
    if (!threadId) {
      return new Response(JSON.stringify({ error: 'Thread ID required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Fetch thread data in parallel
    const [thread, notesResult, noteTypeCounts] = await Promise.all([
      getThreadWithCount(threadId, userId),
      getNotesForThread(threadId, userId),
      getThreadNoteTypeCounts(threadId, userId)
    ]);

    if (!thread) {
      return new Response(JSON.stringify({ error: 'Thread not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const notes = Array.isArray(notesResult) ? [] : notesResult.notes;

    // Return lightweight response optimized for caching
    return new Response(JSON.stringify({
      thread: {
        id: thread.id,
        title: thread.title,
        subtitle: thread.subtitle,
        color: thread.color,
        noteCount: thread.noteCount,
        backgroundGradient: thread.backgroundGradient
      },
      notes,
      noteTypeCounts
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        // Cache for 2 minutes in browser, allow stale responses while revalidating
        'Cache-Control': 'private, max-age=120, stale-while-revalidate=300'
      }
    });
  } catch (error: any) {
    console.error('[prefetch] Error fetching thread data:', error);
    return new Response(JSON.stringify({
      error: 'Failed to fetch thread data',
      details: error.message
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
