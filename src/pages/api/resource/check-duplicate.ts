import type { APIRoute } from 'astro';
import { db, ResourceMetadata, Notes, eq, and } from 'astro:db';
import { validateResourceUrl } from '@/utils/validation';

import { verifyToken } from '@clerk/backend';

export const prerender = false;

/**
 * Check if a resource URL already exists for the current user
 * Returns the existing note ID if found
 */
export const POST: APIRoute = async ({ request, locals }) => {
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

    const body = await request.json();
    const { url } = body;

    if (!url || typeof url !== 'string') {
      return new Response(JSON.stringify({
        error: 'URL is required',
        code: 'MISSING_URL'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Validate and normalize URL
    const urlValidation = validateResourceUrl(url);
    if (!urlValidation.isValid) {
      return new Response(JSON.stringify({
        error: urlValidation.error || 'Invalid URL',
        code: urlValidation.code || 'INVALID_URL'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const normalizedUrl = urlValidation.normalizedUrl!;

    // Check if this URL already exists for this user
    // Join ResourceMetadata with Notes to check ownership
    const existingResources = await db
      .select({
        noteId: ResourceMetadata.noteId,
        sourceUrl: ResourceMetadata.sourceUrl,
        sourceTitle: ResourceMetadata.sourceTitle,
        sourceDescription: ResourceMetadata.sourceDescription,
        sourceImage: ResourceMetadata.sourceImage,
        noteTitle: Notes.title,
        simpleNoteId: Notes.simpleNoteId,
      })
      .from(ResourceMetadata)
      .innerJoin(Notes, eq(ResourceMetadata.noteId, Notes.id))
      .where(
        and(
          eq(ResourceMetadata.sourceUrl, normalizedUrl),
          eq(Notes.userId, userId)
        )
      )
      .limit(1);

    if (existingResources.length > 0) {
      const existing = existingResources[0];
      return new Response(JSON.stringify({
        exists: true,
        noteId: existing.noteId,
        simpleNoteId: existing.simpleNoteId,
        title: existing.sourceTitle || existing.noteTitle || 'Untitled Resource',
        description: existing.sourceDescription || null,
        image: existing.sourceImage || null,
        url: existing.sourceUrl
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({
      exists: false
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Error checking for duplicate resource:', error);
    return new Response(JSON.stringify({
      error: 'Failed to check for duplicates',
      code: 'CHECK_FAILED'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};





























