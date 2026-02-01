export const prerender = false;

import type { APIRoute } from 'astro';
import { db, Notes, UserMetadata, NoteThreads, NoteTags, Comments, ScriptureMetadata, eq, and, desc, isNotNull } from 'astro:db';
import { revokeXPOnDeletion, revokeAllXPForItem } from '@/utils/xp-system';
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
    const rateLimit = rateLimitMiddleware(userId, '/api/notes/cleanup-upgrade-note', 'write', ip);
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

    // Get noteId and simpleNoteId from request body
    const { noteId, simpleNoteId } = await request.json();

    if (!noteId || !simpleNoteId) {
      return new Response(JSON.stringify({ 
        error: 'Note ID and simple note ID are required' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Verify the note belongs to the user before deleting
    const existingNote = await db.select()
      .from(Notes)
      .where(and(eq(Notes.id, noteId), eq(Notes.userId, userId)))
      .get();

    if (!existingNote) {
      return new Response(JSON.stringify({ 
        error: 'Note not found or access denied' 
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Verify simpleNoteId matches
    if (existingNote.simpleNoteId !== simpleNoteId) {
      return new Response(JSON.stringify({ 
        error: 'Simple note ID mismatch' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const noteCreatedAt = existingNote.createdAt;

    // 1. Delete related data (junction tables and metadata)
    await db.delete(NoteThreads).where(eq(NoteThreads.noteId, noteId));
    await db.delete(NoteTags).where(eq(NoteTags.noteId, noteId));
    await db.delete(Comments).where(eq(Comments.noteId, noteId));
    await db.delete(ScriptureMetadata).where(eq(ScriptureMetadata.noteId, noteId));

    // 2. Revoke XP associated with the note
    await revokeXPOnDeletion(userId, noteId, noteCreatedAt);
    await revokeAllXPForItem(userId, noteId);

    // 3. Delete the note
    await db.delete(Notes)
      .where(and(eq(Notes.id, noteId), eq(Notes.userId, userId)));

    // 4. Reset highestSimpleNoteId
    const userMetadata = await db.select()
      .from(UserMetadata)
      .where(eq(UserMetadata.userId, userId))
      .get();

    if (userMetadata) {
      if (userMetadata.highestSimpleNoteId === simpleNoteId) {
        // This was the highest note, decrement by 1
        await db.update(UserMetadata)
          .set({ 
            highestSimpleNoteId: simpleNoteId - 1,
            updatedAt: new Date()
          })
          .where(eq(UserMetadata.userId, userId));
      } else if (userMetadata.highestSimpleNoteId > simpleNoteId) {
        // This note had a lower ID, find the new highest from existing notes
        const existingNotes = await db.select({
          simpleNoteId: Notes.simpleNoteId
        })
        .from(Notes)
        .where(and(
          eq(Notes.userId, userId),
          isNotNull(Notes.simpleNoteId)
        ))
        .orderBy(desc(Notes.simpleNoteId))
        .limit(1);

        const newHighestId = existingNotes.length > 0 
          ? (existingNotes[0].simpleNoteId || 0)
          : 0;

        await db.update(UserMetadata)
          .set({ 
            highestSimpleNoteId: newHighestId,
            updatedAt: new Date()
          })
          .where(eq(UserMetadata.userId, userId));
      }
      // If simpleNoteId > highestSimpleNoteId, something is wrong, but don't fail
    }

    return new Response(JSON.stringify({ 
      success: true,
      message: 'Note cleaned up and highestSimpleNoteId reset'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/notes/cleanup-upgrade-note',
      action: 'cleanup_upgrade_note'
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

