export const prerender = false;

import type { APIRoute } from 'astro';
import { db, ResourceMetadata, Notes, eq, and } from 'astro:db';
import { handleAPIError } from '@/utils/error-handling';
import { rateLimitMiddleware, getClientIP } from '@/utils/rate-limit';

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    // Get userId from authenticated context
    const { userId } = locals.auth();
    
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Rate limiting for write operations
    const ip = getClientIP(request);
    const rateLimit = rateLimitMiddleware(userId, '/api/resource/update-metadata', 'write', ip);
    if (!rateLimit.allowed) {
      return new Response(JSON.stringify({ 
        error: rateLimit.error,
        code: 'RATE_LIMIT_EXCEEDED'
      }), {
        status: 429,
        headers: { 
          'Content-Type': 'application/json',
          'X-RateLimit-Remaining': String(rateLimit.remaining || 0),
          'X-RateLimit-Reset': String(rateLimit.resetTime || Date.now())
        }
      });
    }

    // Parse request body
    const body = await request.json();
    const { noteId, image } = body;

    if (!noteId) {
      return new Response(JSON.stringify({ error: 'Note ID is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Verify the note belongs to the user
    const existingNote = await db.select()
      .from(Notes)
      .where(and(eq(Notes.id, noteId), eq(Notes.userId, userId)))
      .get();

    if (!existingNote) {
      return new Response(JSON.stringify({ error: 'Note not found or access denied' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Verify this is a resource note
    if (existingNote.noteType !== 'resource') {
      return new Response(JSON.stringify({ error: 'Note is not a resource note' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Find the ResourceMetadata record
    const resourceMetadata = await db.select()
      .from(ResourceMetadata)
      .where(eq(ResourceMetadata.noteId, noteId))
      .get();

    if (!resourceMetadata) {
      return new Response(JSON.stringify({ error: 'Resource metadata not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Update the image field
    await db.update(ResourceMetadata)
      .set({ 
        sourceImage: image || null
      })
      .where(eq(ResourceMetadata.noteId, noteId));

    return new Response(JSON.stringify({ 
      success: true,
      message: 'Resource metadata updated'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/resource/update-metadata',
      action: 'update_resource_metadata'
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
