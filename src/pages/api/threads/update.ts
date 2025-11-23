import type { APIRoute } from 'astro';
import { threads } from '@/actions/threads';
import { db, Notes, Threads, NoteThreads, eq, and } from 'astro:db';

export const POST: APIRoute = async ({ request, locals, callAction }) => {
  try {
    // Parse form data
    const formData = await request.formData();
    const threadId = formData.get('id') as string;
    const title = formData.get('title') as string;
    const color = formData.get('color') as string;
    const isPublic = formData.get('isPublic') === 'true';
    const selectedNoteIdsStr = formData.get('selectedNoteIds') as string | null;

    // Parse selected note IDs
    let selectedNoteIds: string[] = [];
    if (selectedNoteIdsStr) {
      try {
        selectedNoteIds = JSON.parse(selectedNoteIdsStr);
      } catch (e) {
        console.error('Error parsing selectedNoteIds:', e);
        selectedNoteIds = [];
      }
    }

    console.log("Updating thread with threadId:", threadId, "title:", title, "color:", color, "isPublic:", isPublic, "selectedNoteIds:", selectedNoteIds);

    if (!threadId || !title || !title.trim()) {
      return new Response(JSON.stringify({ error: 'Thread ID and title are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Use Astro.callAction to call the threads.update action with FormData
    const result = await callAction(threads.update, formData);

    console.log("Thread updated successfully:", result);

    // Add selected notes to the thread via junction table
    if (selectedNoteIds.length > 0) {
      const { userId } = locals.auth();
      
      if (userId) {
        console.log(`Adding ${selectedNoteIds.length} notes to thread ${threadId}`);
        
        for (const noteId of selectedNoteIds) {
          try {
            // Verify note exists and belongs to user
            const note = await db.select()
              .from(Notes)
              .where(and(eq(Notes.id, noteId), eq(Notes.userId, userId)))
              .get();
            
            if (!note) {
              console.warn(`Note ${noteId} not found or doesn't belong to user, skipping`);
              continue;
            }

            // Check if note is already in this thread
            const existingRelation = await db.select()
              .from(NoteThreads)
              .where(and(eq(NoteThreads.noteId, noteId), eq(NoteThreads.threadId, threadId)))
              .get();

            if (existingRelation) {
              console.log(`Note ${noteId} is already in thread ${threadId}, skipping`);
              continue;
            }

            // Check if note is currently in unorganized (no NoteThreads entries)
            const existingThreadRelations = await db.select()
              .from(NoteThreads)
              .where(eq(NoteThreads.noteId, noteId))
              .all();
            
            const isInUnorganized = existingThreadRelations.length === 0 || note.threadId === 'thread_unorganized';

            // Add the note to the thread via junction table
            const noteThreadId = `note-thread-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            await db.insert(NoteThreads).values({
              id: noteThreadId,
              noteId: noteId,
              threadId: threadId,
              createdAt: new Date()
            });
            
            console.log(`Note ${noteId} added to thread ${threadId} successfully`);

            // If note was in unorganized, update the legacy threadId field to the new thread
            if (isInUnorganized && threadId !== 'thread_unorganized') {
              await db.update(Notes)
                .set({ threadId: threadId })
                .where(eq(Notes.id, noteId));
              console.log(`Note ${noteId} removed from unorganized and added to thread ${threadId}`);
            }
          } catch (error: any) {
            // Log error but continue with other notes
            console.error(`Error adding note ${noteId} to thread:`, error);
          }
        }

        // Update thread timestamp after adding notes
        await db.update(Threads)
          .set({ updatedAt: new Date() })
          .where(and(eq(Threads.id, threadId), eq(Threads.userId, userId)));
      }
    }

    return new Response(JSON.stringify({
      success: 'Thread updated successfully!',
      thread: result.thread
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Error updating thread:', error);
    
    return new Response(JSON.stringify({
      error: error.message || 'Error updating thread'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
