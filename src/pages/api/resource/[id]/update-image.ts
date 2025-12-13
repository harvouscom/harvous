import type { APIRoute } from 'astro';
import { db, ResourceMetadata, Notes, eq, and } from 'astro:db';
import { handleAPIError } from '@/utils/error-handling';
import { rateLimitMiddleware, getClientIP } from '@/utils/rate-limit';

export const POST: APIRoute = async ({ params, request, locals }) => {
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
    const rateLimit = rateLimitMiddleware(userId, '/api/resource/[id]/update-image', 'write', ip);
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

    const { id } = params;
    const body = await request.json();
    const { image } = body;

    if (!id) {
      return new Response(JSON.stringify({ error: 'Note ID is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Verify the note belongs to the user
    const existingNote = await db.select()
      .from(Notes)
      .where(and(eq(Notes.id, id), eq(Notes.userId, userId)))
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
      .where(eq(ResourceMetadata.noteId, id))
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
      .where(eq(ResourceMetadata.noteId, id));

    return new Response(JSON.stringify({ 
      success: true,
      message: 'Resource image updated'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/resource/[id]/update-image',
      action: 'update_resource_image'
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
