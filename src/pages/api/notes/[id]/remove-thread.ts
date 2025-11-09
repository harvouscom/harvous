import type { APIRoute } from 'astro';
import { db, Notes, NoteThreads, eq, and } from 'astro:db';
import { ensureUnorganizedThread } from '@/utils/unorganized-thread';

export const POST: APIRoute = async ({ params, request, locals }) => {
  try {
    const { userId } = locals.auth();
    const { id } = params;
    const { threadId } = await request.json();

    if (!threadId) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Thread ID is required' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Verify the note exists and belongs to the user
    const note = await db.select()
      .from(Notes)
      .where(and(eq(Notes.id, id), eq(Notes.userId, userId)))
      .get();

    if (!note) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Note not found' 
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check if the note is in this thread
    const existingRelation = await db.select()
      .from(NoteThreads)
      .where(and(eq(NoteThreads.noteId, id), eq(NoteThreads.threadId, threadId)))
      .get();

    if (!existingRelation) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Note is not in this thread' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Remove the note from the thread
    console.log(`Attempting to delete: noteId=${id}, threadId=${threadId}`);
    try {
      const deleteResult = await db.delete(NoteThreads)
        .where(and(eq(NoteThreads.noteId, id), eq(NoteThreads.threadId, threadId)));
      console.log(`Delete result:`, deleteResult);
      console.log(`Note ${id} removed from thread ${threadId} successfully`);
      
      // Check if this was the last thread for the note
      const remainingThreads = await db.select()
        .from(NoteThreads)
        .where(eq(NoteThreads.noteId, id))
        .all();
      
      if (remainingThreads.length === 0) {
        // This was the last thread, note automatically becomes unorganized (no junction entries)
        // Just ensure unorganized thread exists and set primary threadId to unorganized (legacy field)
        await ensureUnorganizedThread(userId);
        await db.update(Notes)
          .set({ threadId: 'thread_unorganized' })
          .where(eq(Notes.id, id));
        console.log(`Note ${id} had its last thread removed, now in unorganized`);
      }
      // Note: If note still has other threads, no action needed - primary threadId stays as legacy field
    } catch (deleteError) {
      console.error('Error deleting from NoteThreads:', deleteError);
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Database delete failed: ' + deleteError.message 
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Note removed from thread successfully',
      note: {
        id: note.id,
        threadId: threadId
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error removing note from thread:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: 'Internal server error' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
