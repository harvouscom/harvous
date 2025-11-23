import type { APIRoute } from 'astro';
import { db, Threads, Notes, NoteThreads, eq, and } from 'astro:db';
import { generateThreadId } from '@/utils/ids';
import { THREAD_COLORS, getRandomThreadColor } from '@/utils/colors';
import { awardThreadCreatedXP } from '@/utils/xp-system';

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

    // Parse form data
    const formData = await request.formData();
    const title = formData.get('title') as string;
    const color = formData.get('color') as string;
    const isPublic = formData.get('isPublic') === 'true';
    const spaceId = formData.get('spaceId') as string;
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

    console.log("Creating thread with userId:", userId, "title:", title, "color:", color, "isPublic:", isPublic, "spaceId:", spaceId, "selectedNoteIds:", selectedNoteIds);

    // Default to "Untitled Thread" if title is empty or whitespace
    const finalTitle = (!title || !title.trim()) ? 'Untitled Thread' : title.trim();

    // Make spaceId optional - if not provided or is 'default_space', set to null
    let finalSpaceId = null;
    if (spaceId && spaceId.trim() && spaceId !== 'default_space') {
      finalSpaceId = spaceId;
    }

    // Validate color if provided
    let threadColor = color;
    if (color && !THREAD_COLORS.includes(color as any)) {
      console.warn(`Invalid color provided: ${color}, using random color instead`);
      threadColor = getRandomThreadColor();
    } else if (!color) {
      threadColor = getRandomThreadColor();
    }

    const capitalizedTitle = finalTitle.charAt(0).toUpperCase() + finalTitle.slice(1);
    
    const newThread = await db.insert(Threads)
      .values({
        id: generateThreadId(),
        title: capitalizedTitle,
        subtitle: null,
        spaceId: finalSpaceId,
        userId,
        isPublic,
        color: threadColor,
        isPinned: false,
        createdAt: new Date()
      })
      .returning()
      .get();

    console.log("Thread created successfully:", newThread);

    // Add selected notes to the thread via junction table
    if (selectedNoteIds.length > 0) {
      console.log(`Adding ${selectedNoteIds.length} notes to thread ${newThread.id}`);
      
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
            .where(and(eq(NoteThreads.noteId, noteId), eq(NoteThreads.threadId, newThread.id)))
            .get();

          if (existingRelation) {
            console.log(`Note ${noteId} is already in thread ${newThread.id}, skipping`);
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
            threadId: newThread.id,
            createdAt: new Date()
          });
          
          console.log(`Note ${noteId} added to thread ${newThread.id} successfully`);

          // If note was in unorganized, update the legacy threadId field to the new thread
          if (isInUnorganized && newThread.id !== 'thread_unorganized') {
            await db.update(Notes)
              .set({ threadId: newThread.id })
              .where(eq(Notes.id, noteId));
            console.log(`Note ${noteId} removed from unorganized and added to thread ${newThread.id}`);
          }
        } catch (error: any) {
          // Log error but continue with other notes
          console.error(`Error adding note ${noteId} to thread:`, error);
        }
      }

      // Update thread timestamp after adding notes
      await db.update(Threads)
        .set({ updatedAt: new Date() })
        .where(and(eq(Threads.id, newThread.id), eq(Threads.userId, userId)));
    }

    // Award XP for thread creation (pass title for validation)
    await awardThreadCreatedXP(userId, newThread.id, capitalizedTitle, null);

    // Add a small delay to ensure the database operation completes
    await new Promise(resolve => setTimeout(resolve, 150));

    return new Response(JSON.stringify({
      success: 'Thread created successfully!',
      thread: newThread
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Error creating thread:', error);
    
    return new Response(JSON.stringify({
      error: error.message || 'Error creating thread'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
