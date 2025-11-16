import type { APIRoute } from 'astro';
import { db, Notes, eq, and } from 'astro:db';
import { revokeXPOnDeletion, revokeAllXPForItem } from '@/utils/xp-system';

export const DELETE: APIRoute = async ({ request, locals }) => {
  try {
    // Get userId from authenticated context
    const { userId } = locals.auth();
    
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get note ID from URL params
    const url = new URL(request.url);
    const noteId = url.searchParams.get('noteId');

    if (!noteId) {
      return new Response(JSON.stringify({ error: 'Note ID is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    console.log("DELETE API - Deleting note with ID:", noteId, "for user:", userId);

    // Verify the note belongs to the user before deleting
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

    // Store threadId before deletion for redirect
    const threadId = existingNote.threadId;
    const noteCreatedAt = existingNote.createdAt;

    // Revoke XP if deleted within quick deletion window
    await revokeXPOnDeletion(userId, noteId, noteCreatedAt);
    
    // Revoke all XP for this note (cleanup)
    await revokeAllXPForItem(userId, noteId);

    // Delete the note
    await db.delete(Notes)
      .where(and(eq(Notes.id, noteId), eq(Notes.userId, userId)));

    console.log("DELETE API - Note erased successfully:", noteId);

    return new Response(JSON.stringify({ 
      success: "Note erased successfully!",
      noteId: noteId,
      threadId: threadId
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Error deleting note:', error);
    return new Response(JSON.stringify({ 
      error: error.message || 'Failed to erase note' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
