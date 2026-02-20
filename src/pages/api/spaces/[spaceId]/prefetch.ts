export const prerender = false;

import type { APIRoute } from 'astro';
import { db, Spaces, eq } from 'astro:db';
import { getSpacesWithCounts, getThreadsForSpaceBySpaceId, getNotesForSpaceForMember } from '@/utils/dashboard-data';
import { requireSpaceAccess } from '@/utils/space-permissions';
import { getThreadGradientCSS } from '@/utils/colors';

/**
 * Prefetch endpoint for space content
 * Returns space metadata
 * Used by EditSpacePanel to fetch fresh data on mount
 * Supports both owners (via getSpacesWithCounts) and members (via requireSpaceAccess)
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

    // Try owner path first
    const spaces = await getSpacesWithCounts(userId);
    let space = spaces.find(s => s.id === spaceId);
    let ownerId: string = userId;

    // If not owner, try member path
    if (!space) {
      try {
        const { space: spaceRow } = await requireSpaceAccess(spaceId, userId);
        const spaceFromDb = await db.select().from(Spaces).where(eq(Spaces.id, spaceId)).get();
        if (spaceFromDb) {
          ownerId = spaceFromDb.userId;
          const [threads, notesResult] = await Promise.all([
            getThreadsForSpaceBySpaceId(spaceId),
            getNotesForSpaceForMember(spaceId, spaceRow.userId, 100)
          ]);
          const totalItemCount = threads.length + (notesResult.notes?.length ?? 0);
          space = {
            id: spaceFromDb.id,
            title: spaceFromDb.title,
            color: spaceFromDb.color,
            backgroundGradient: spaceFromDb.backgroundGradient ?? getThreadGradientCSS(spaceFromDb.color || 'paper'),
            totalItemCount,
            isPublic: spaceFromDb.isPublic ?? false
          };
        }
      } catch {
        // No access - leave space null
      }
    }

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
        totalItemCount: space.totalItemCount,
        isPublic: space.isPublic,
        ownerId,
        memberCount: 0
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
