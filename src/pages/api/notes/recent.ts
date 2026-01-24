import type { APIRoute } from 'astro';
import { db, Notes, eq, desc, asc, sql } from 'astro:db';
import { handleAPIError } from '@/utils/error-handling';

import { verifyToken } from '@clerk/backend';

export const prerender = false;

export const GET: APIRoute = async ({ request, locals }) => {
  try {
    let userId: string | null = null;

    // SSR Mode: Use middleware auth
    if (locals?.auth) {
      const auth = locals.auth();
      userId = auth.userId || null;
    }
    // Static/Capacitor Mode: Verify JWT from Authorization header
    else {
      const authHeader = request.headers.get('Authorization');
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        try {
          const verified = await verifyToken(token, {
            secretKey: import.meta.env.CLERK_SECRET_KEY
          });
          userId = verified.sub;
        } catch (error) {
          console.error('[API Auth] Token verification failed:', error);
        }
      }
    }

    if (!userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get limit from query parameter, default to 50, max 100
    const url = new URL(request.url);
    const limitParam = url.searchParams.get('limit');
    const limit = limitParam ? Math.min(parseInt(limitParam, 10), 100) : 50;
    const maxLimit = Math.max(1, limit); // Ensure at least 1

    // Fetch recent notes for the user
    const notes = await db
      .select({
        id: Notes.id,
        title: Notes.title,
        content: Notes.content,
        threadId: Notes.threadId,
        spaceId: Notes.spaceId,
        simpleNoteId: Notes.simpleNoteId,
        isPublic: Notes.isPublic,
        isFeatured: Notes.isFeatured,
        createdAt: Notes.createdAt,
        updatedAt: Notes.updatedAt,
        lastVisited: Notes.lastVisited,
      })
      .from(Notes)
      .where(eq(Notes.userId, userId))
      // CRITICAL: Use CASE expression to ensure items WITH lastVisited sort before items WITHOUT
      // SQLite puts NULLs first in DESC order, so we need explicit NULL handling
      // Use explicit asc() to ensure 0 (has lastVisited) sorts before 1 (no lastVisited)
      .orderBy(
        asc(sql`CASE WHEN ${Notes.lastVisited} IS NOT NULL THEN 0 ELSE 1 END`),
        desc(Notes.lastVisited),
        desc(Notes.updatedAt),
        desc(Notes.createdAt),
        asc(Notes.id)
      )
      .limit(maxLimit);

    // Format the response
    const formattedNotes = notes.map(note => ({
      id: note.id,
      title: note.title || 'Untitled Note',
      content: note.content,
      threadId: note.threadId,
      spaceId: note.spaceId,
      simpleNoteId: note.simpleNoteId,
      isPublic: note.isPublic,
      isFeatured: note.isFeatured,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
      lastUpdated: note.lastVisited || note.updatedAt || note.createdAt,
    }));

    return new Response(JSON.stringify(formattedNotes), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/notes/recent',
      action: 'get_recent_notes'
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
