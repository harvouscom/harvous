import type { APIRoute } from 'astro';
import { db, Spaces, Notes, Threads, eq, and } from 'astro:db';
import { generateSpaceId } from '@/utils/ids';
import { getThreadGradientCSS } from '@/utils/colors';

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
    const color = formData.get('color') as string || 'paper';
    const isPublic = formData.get('isPublic') === 'true';
    
    // Parse selected items (can be JSON string or individual form fields)
    let selectedNoteIds: string[] = [];
    let selectedThreadIds: string[] = [];
    
    const noteIdsStr = formData.get('selectedNoteIds') as string;
    const threadIdsStr = formData.get('selectedThreadIds') as string;
    
    if (noteIdsStr) {
      try {
        selectedNoteIds = JSON.parse(noteIdsStr);
      } catch {
        // If not JSON, treat as comma-separated
        selectedNoteIds = noteIdsStr.split(',').filter(id => id.trim());
      }
    }
    
    if (threadIdsStr) {
      try {
        selectedThreadIds = JSON.parse(threadIdsStr);
      } catch {
        // If not JSON, treat as comma-separated
        selectedThreadIds = threadIdsStr.split(',').filter(id => id.trim());
      }
    }

    console.log("Creating space with userId:", userId, "title:", title, "color:", color, "isPublic:", isPublic);
    console.log("Selected note IDs:", selectedNoteIds);
    console.log("Selected thread IDs:", selectedThreadIds);

    if (!title || !title.trim()) {
      return new Response(JSON.stringify({ error: 'Title is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const capitalizedTitle = title.charAt(0).toUpperCase() + title.slice(1);
    
    // Generate background gradient based on color
    const backgroundGradient = getThreadGradientCSS(color);
    
    const newSpace = await db.insert(Spaces)
      .values({
        id: generateSpaceId(),
        title: capitalizedTitle,
        description: null,
        color: color,
        backgroundGradient: backgroundGradient,
        userId,
        isPublic: isPublic,
        isActive: true,
        order: 0,
        createdAt: new Date()
      })
      .returning()
      .get();

    console.log("Space created successfully:", newSpace);

    // Update selected notes to belong to the new space
    if (selectedNoteIds.length > 0) {
      for (const noteId of selectedNoteIds) {
        try {
          // Verify the note exists and belongs to the user
          const note = await db.select()
            .from(Notes)
            .where(and(eq(Notes.id, noteId), eq(Notes.userId, userId)))
            .get();

          if (note) {
            await db.update(Notes)
              .set({ 
                spaceId: newSpace.id,
                updatedAt: new Date()
              })
              .where(and(eq(Notes.id, noteId), eq(Notes.userId, userId)));
          }
        } catch (error: any) {
          console.error(`Error updating note ${noteId}:`, error);
          // Continue with other notes even if one fails
        }
      }
    }

    // Update selected threads to belong to the new space
    if (selectedThreadIds.length > 0) {
      for (const threadId of selectedThreadIds) {
        try {
          // Don't allow moving unorganized thread
          if (threadId === 'thread_unorganized') {
            console.warn('Skipping unorganized thread');
            continue;
          }

          // Verify the thread exists and belongs to the user
          const thread = await db.select()
            .from(Threads)
            .where(and(eq(Threads.id, threadId), eq(Threads.userId, userId)))
            .get();

          if (thread) {
            await db.update(Threads)
              .set({ 
                spaceId: newSpace.id,
                updatedAt: new Date()
              })
              .where(and(eq(Threads.id, threadId), eq(Threads.userId, userId)));
          }
        } catch (error: any) {
          console.error(`Error updating thread ${threadId}:`, error);
          // Continue with other threads even if one fails
        }
      }
    }

    // Add a small delay to ensure the database operation completes
    await new Promise(resolve => setTimeout(resolve, 150));

    return new Response(JSON.stringify({
      success: 'Space created successfully!',
      space: newSpace,
      addedNotes: selectedNoteIds.length,
      addedThreads: selectedThreadIds.length
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Error creating space:', error);
    
    return new Response(JSON.stringify({
      error: error.message || 'Error creating space'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
