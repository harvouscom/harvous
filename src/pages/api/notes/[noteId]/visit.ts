export const prerender = false;

import type { APIRoute } from 'astro';
import { db, Notes, eq, and } from 'astro:db';
import { requireSpaceAccess } from '@/utils/space-permissions';

const jsonHeaders = { 'Content-Type': 'application/json' } as const;
const THROTTLE_MS = 3 * 1000;

/**
 * POST /api/notes/[noteId]/visit
 * Records a visit to a note for lastVisited ordering on the dashboard.
 * Only updates lastVisited when the authenticated user is the note owner.
 * Returns 200 if the user has access (owner or space member); 404 otherwise.
 * Throttled: only updates if lastVisited is older than 3 seconds (matches Astro SSR behavior).
 */
export const POST: APIRoute = async ({ params, request, locals }) => {
  try {
    const { userId } = locals.auth();
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: jsonHeaders
      });
    }

    let { noteId } = params;
    if (!noteId) {
      return new Response(JSON.stringify({ error: 'Note ID required' }), {
        status: 400,
        headers: jsonHeaders
      });
    }
    if (!noteId.startsWith('note_')) {
      noteId = `note_${noteId}`;
    }

    // Optional: skip if this is a prefetch request
    const isPrefetch = request.headers.get('x-prefetch-request') || request.headers.get('purpose') === 'prefetch';
    if (isPrefetch) {
      return new Response(JSON.stringify({ ok: true }), { status: 200, headers: jsonHeaders });
    }

    const note = await db.select({ id: Notes.id, userId: Notes.userId, spaceId: Notes.spaceId, lastVisited: Notes.lastVisited })
      .from(Notes)
      .where(eq(Notes.id, noteId))
      .get();

    if (!note) {
      return new Response(JSON.stringify({ error: 'Note not found' }), {
        status: 404,
        headers: jsonHeaders
      });
    }

    const isOwner = note.userId === userId;
    let isMember = false;
    if (!isOwner && note.spaceId) {
      try {
        await requireSpaceAccess(note.spaceId, userId);
        isMember = true;
      } catch {
        // requireSpaceAccess throws on access denied
      }
    }

    if (!isOwner && !isMember) {
      return new Response(JSON.stringify({ error: 'Note not found' }), {
        status: 404,
        headers: jsonHeaders
      });
    }

    // Only the owner's lastVisited is updated (matches Astro [...slug].astro behavior)
    if (isOwner) {
      const now = new Date();
      const threeSecondsAgo = new Date(now.getTime() - THROTTLE_MS);
      if (!note.lastVisited || new Date(note.lastVisited) < threeSecondsAgo) {
        await db.update(Notes)
          .set({ lastVisited: now })
          .where(and(eq(Notes.id, noteId), eq(Notes.userId, userId)));
      }
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: jsonHeaders });
  } catch (error: any) {
    if (error instanceof Response) return error;
    console.error('[visit] Error updating lastVisited for note:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: jsonHeaders
    });
  }
};
