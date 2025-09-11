import type { APIRoute } from 'astro';
import { db, Notes, Threads, eq, and } from 'astro:db';
import { generateNoteId } from '@/utils/ids';

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
    const content = formData.get('content') as string;
    const title = formData.get('title') as string;
    const threadId = formData.get('threadId') as string;

    console.log("Creating note with userId:", userId, "title:", title, "content:", content?.substring(0, 50));

    if (!content || !content.trim()) {
      return new Response(JSON.stringify({ error: 'Content is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const capitalizedContent = content.charAt(0).toUpperCase() + content.slice(1);
    const capitalizedTitle = title ? (title.charAt(0).toUpperCase() + title.slice(1)) : title;
    
    // Ensure we have a valid threadId - if it's unorganized, use the default
    let finalThreadId = threadId;
    if (!finalThreadId || finalThreadId === 'thread_unorganized') {
      // Check if unorganized thread exists, create it if it doesn't
      const existingUnorganizedThread = await db.select()
        .from(Threads)
        .where(and(eq(Threads.id, 'thread_unorganized'), eq(Threads.userId, userId)))
        .get();
        
      if (!existingUnorganizedThread) {
        try {
          // Create the unorganized thread
          await db.insert(Threads)
            .values({
              id: 'thread_unorganized',
              title: 'Unorganized',
              subtitle: 'Notes that haven\'t been organized into threads yet',
              spaceId: null,
              userId,
              isPublic: false,
              color: null,
              isPinned: false,
              createdAt: new Date()
            });
          console.log('Created unorganized thread for user:', userId);
        } catch (error) {
          // Thread might already exist due to race condition, that's okay
          console.log('Unorganized thread already exists for user:', userId);
        }
      }
      finalThreadId = 'thread_unorganized';
    }
    
    // Find the next available simple note ID for this user
    const existingNotes = await db.select({ simpleNoteId: Notes.simpleNoteId })
      .from(Notes)
      .where(eq(Notes.userId, userId));
    
    const existingSimpleNoteIds = existingNotes
      .map(note => note.simpleNoteId)
      .filter(id => id !== null && id !== undefined)
      .sort((a, b) => a! - b!);
    
    const nextSimpleNoteId = existingSimpleNoteIds.length > 0 
      ? Math.max(...existingSimpleNoteIds) + 1 
      : 1;
    
    const newNote = await db.insert(Notes)
      .values({ 
        id: generateNoteId(),
        content: capitalizedContent, 
        title: capitalizedTitle, 
        threadId: finalThreadId,
        spaceId: null,
        simpleNoteId: nextSimpleNoteId,
        userId, 
        isPublic: false,
        createdAt: new Date() 
      })
      .returning()
      .get();
      
    console.log("Note created successfully:", newNote);

    // Update the thread's updatedAt timestamp
    await db.update(Threads)
      .set({ updatedAt: new Date() })
      .where(and(eq(Threads.id, finalThreadId), eq(Threads.userId, userId)));

    return new Response(JSON.stringify({ 
      success: "Note created successfully!",
      note: newNote
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Error creating note:', error);
    return new Response(JSON.stringify({ 
      error: error.message || 'Failed to create note' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
