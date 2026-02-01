export const prerender = false;

import type { APIRoute } from 'astro';
import { db, Notes, Threads, NoteThreads, ResourceMetadata, eq, and } from 'astro:db';
import { handleAPIError } from '@/utils/error-handling';
import { validateContent } from '@/utils/validation';
import { rateLimitMiddleware, getClientIP } from '@/utils/rate-limit';
import { successResponse, unauthorizedResponse, errorResponse, rateLimitedResponse, notFoundResponse, serverErrorResponse } from '@/utils/api-responses';

export const PUT: APIRoute = async ({ request, locals }) => {
  try {
    // Get userId from authenticated context
    const { userId } = locals.auth();
    
    if (!userId) {
      return unauthorizedResponse();
    }

    // Rate limiting for write operations
    const ip = getClientIP(request);
    const rateLimit = rateLimitMiddleware(userId, '/api/notes/update', 'write', ip);
    if (!rateLimit.allowed) {
      return rateLimitedResponse(
        rateLimit.resetTime || Date.now(),
        rateLimit.error || 'Rate limit exceeded'
      );
    }

    // Parse request body
    const body = await request.json();
    const { noteId, title, content, resourceImage } = body;

    if (!noteId) {
      return errorResponse('Note ID is required');
    }

    // Validate content
    const contentValidation = validateContent(content, true);
    if (!contentValidation.isValid) {
      return errorResponse(contentValidation.error || 'Invalid content', contentValidation.code);
    }

    // Verify the note belongs to the user before updating
    const existingNote = await db.select()
      .from(Notes)
      .where(and(eq(Notes.id, noteId), eq(Notes.userId, userId)))
      .get();

    if (!existingNote) {
      return notFoundResponse('Note');
    }

    // Capitalize content and title
    const capitalizedContent = content.charAt(0).toUpperCase() + content.slice(1);
    const capitalizedTitle = title ? (title.charAt(0).toUpperCase() + title.slice(1)) : title;

    // Update the note
    const updatedNote = await db.update(Notes)
      .set({ 
        title: capitalizedTitle,
        content: capitalizedContent,
        updatedAt: new Date()
      })
      .where(and(eq(Notes.id, noteId), eq(Notes.userId, userId)))
      .returning()
      .get();

    if (!updatedNote) {
      return serverErrorResponse(new Error('Failed to update note'));
    }

    // Update all threads this note belongs to via junction table
    const noteThreads = await db.select({ threadId: NoteThreads.threadId })
      .from(NoteThreads)
      .where(eq(NoteThreads.noteId, noteId))
      .all();

    for (const nt of noteThreads) {
      await db.update(Threads)
        .set({ updatedAt: new Date() })
        .where(and(eq(Threads.id, nt.threadId), eq(Threads.userId, userId)));
    }

    // Regenerate auto-tags based on updated content (async, fire-and-forget)
    const autoTagAsync = async () => {
      try {
        const { removeAutoTags, generateAutoTags, applyAutoTags } = await import('@/utils/auto-tag-generator');
        await removeAutoTags(noteId);
        const autoTagResult = await generateAutoTags(capitalizedTitle || '', capitalizedContent, userId, 0.8);
        if (autoTagResult.suggestions.length > 0) {
          await applyAutoTags(noteId, autoTagResult.suggestions, userId);
        }
      } catch (error) {
        console.error('Auto-tagging failed (non-critical):', error);
      }
    };
    autoTagAsync().catch(() => {});

    // Update ResourceMetadata if this is a resource note and resourceImage is provided
    if (existingNote.noteType === 'resource' && resourceImage !== undefined) {
      try {
        const resourceMetadata = await db.select()
          .from(ResourceMetadata)
          .where(eq(ResourceMetadata.noteId, noteId))
          .get();
        
        if (resourceMetadata) {
          await db.update(ResourceMetadata)
            .set({ 
              sourceImage: resourceImage || null
            })
            .where(eq(ResourceMetadata.noteId, noteId));
        }
      } catch (error: any) {
        // Don't fail note update if ResourceMetadata update fails
        console.error('Error updating ResourceMetadata (non-critical):', error);
      }
    }

    // Process scripture references in the note content (async, fire-and-forget)
    const scriptureAsync = async () => {
      try {
        let actualThreadId = 'thread_unorganized';
        const threadRelation = await db.select()
          .from(NoteThreads)
          .where(eq(NoteThreads.noteId, noteId))
          .limit(1)
          .get();
        if (threadRelation) {
          actualThreadId = threadRelation.threadId;
        }
        const { processScriptureReferences } = await import('@/utils/process-scripture-references');
        await processScriptureReferences(noteId, userId, actualThreadId, capitalizedContent);
      } catch (error: any) {
        console.error('Error processing scripture references (non-critical):', error);
      }
    };
    scriptureAsync().catch(() => {});

    return successResponse({
      success: "Note updated!",
      note: updatedNote
    });

  } catch (error: any) {
    return serverErrorResponse(error, {
      endpoint: '/api/notes/update',
      action: 'update_note'
    });
  }
};
