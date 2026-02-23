export const prerender = false;

import type { APIRoute } from 'astro';
import { db, Threads, eq } from 'astro:db';
import { getThreadWithCount, getNotesForThread, getThreadNoteTypeCounts, getThreadWithCountForMember, getNotesForThreadForMember, getThreadNoteTypeCountsForMember } from '@/utils/dashboard-data';
import { requireSpaceAccess } from '@/utils/space-permissions';

/**
 * Prefetch endpoint for thread content
 * Returns thread metadata, notes, and note type counts
 * Used by thread cache prefetching system
 * Supports owner path (userId) and member path (thread in shared space).
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

    // Owner path: fetch thread data in parallel
    let [thread, notesResult, noteTypeCounts] = await Promise.all([
      getThreadWithCount(threadId, userId),
      getNotesForThread(threadId, userId),
      getThreadNoteTypeCounts(threadId, userId)
    ]);

    // Member path: thread not found for owner, try shared space member
    if (!thread) {
      const threadRow = await db.select().from(Threads).where(eq(Threads.id, threadId)).get();
      if (threadRow?.spaceId) {
        try {
          const { space } = await requireSpaceAccess(threadRow.spaceId, userId);
          const [memberThread, memberNotesResult, memberNoteTypeCounts] = await Promise.all([
            getThreadWithCountForMember(threadId),
            getNotesForThreadForMember(threadId, space.userId),
            getThreadNoteTypeCountsForMember(threadId)
          ]);
          if (memberThread) {
            thread = memberThread;
            notesResult = memberNotesResult;
            noteTypeCounts = memberNoteTypeCounts;
          }
        } catch (err) {
          if (err instanceof Response) return err;
          throw err;
        }
      }
    }

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
        backgroundGradient: thread.backgroundGradient,
        userId: thread.userId
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
