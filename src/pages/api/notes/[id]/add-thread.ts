import type { APIRoute } from 'astro';
import { db, Notes, Threads, NoteThreads, eq, and } from 'astro:db';

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

    // Verify the target thread exists and belongs to the user
    const targetThread = await db.select()
      .from(Threads)
      .where(and(eq(Threads.id, threadId), eq(Threads.userId, userId)))
      .get();

    if (!targetThread) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Target thread not found' 
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check if the note is already in this thread
    const existingRelation = await db.select()
      .from(NoteThreads)
      .where(and(eq(NoteThreads.noteId, id), eq(NoteThreads.threadId, threadId)))
      .get();

    if (existingRelation) {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Note is already in this thread' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Add the note to the thread (many-to-many relationship)
    console.log(`Attempting to insert: noteId=${id}, threadId=${threadId}`);
    try {
      const noteThreadId = `note-thread-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      await db.insert(NoteThreads).values({
        id: noteThreadId,
        noteId: id,
        threadId: threadId,
        createdAt: new Date()
      });
      console.log(`Note ${id} added to thread ${threadId} successfully`);
      
      // If this is the first thread for the note, also update the primary threadId
      const existingThreads = await db.select()
        .from(NoteThreads)
        .where(eq(NoteThreads.noteId, id))
        .all();
      
      if (existingThreads.length === 1) {
        // This is the first thread, update the primary threadId
        await db.update(Notes)
          .set({ threadId: threadId })
          .where(eq(Notes.id, id));
        console.log(`Updated primary threadId to ${threadId} for note ${id}`);
      }
    } catch (insertError) {
      console.error('Error inserting into NoteThreads:', insertError);
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Database insert failed: ' + insertError.message 
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Note added to thread successfully',
      note: {
        id: note.id,
        threadId: threadId
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error adding note to thread:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: 'Internal server error' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
