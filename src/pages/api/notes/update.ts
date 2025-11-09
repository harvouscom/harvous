import type { APIRoute } from 'astro';
import { db, Notes, Threads, NoteThreads, eq, and } from 'astro:db';

export const PUT: APIRoute = async ({ request, locals }) => {
  try {
    // Get userId from authenticated context
    const { userId } = locals.auth();
    
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Parse request body
    const body = await request.json();
    const { noteId, title, content } = body;

    if (!noteId) {
      return new Response(JSON.stringify({ error: 'Note ID is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    if (!content || !content.trim()) {
      return new Response(JSON.stringify({ error: 'Content is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    console.log("Updating note with ID:", noteId, "for user:", userId);

    // Verify the note belongs to the user before updating
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
      return new Response(JSON.stringify({ error: 'Failed to update note' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
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

    // Regenerate auto-tags based on updated content
    try {
      const { removeAutoTags, generateAutoTags, applyAutoTags } = await import('@/utils/auto-tag-generator');
      
      // Remove existing auto-generated tags
      await removeAutoTags(noteId);
      
      // Generate new auto-tag suggestions based on updated content (80% confidence threshold)
      const autoTagResult = await generateAutoTags(
        capitalizedTitle || '',
        capitalizedContent,
        userId,
        0.8 // Generate high-confidence tags including spiritual themes
      );
      
      // Apply the new auto-generated tags if any were found
      if (autoTagResult.suggestions.length > 0) {
        const applyResult = await applyAutoTags(
          noteId,
          autoTagResult.suggestions,
          userId
        );
        
        console.log(`Regenerated ${applyResult.applied} auto-tags for updated note ${noteId}`);
      }
    } catch (error) {
      // Don't fail note update if auto-tagging fails
      console.log('Auto-tag regeneration failed (non-critical):', error);
    }

    console.log("Note updated successfully:", updatedNote);

    return new Response(JSON.stringify({ 
      success: "Note updated successfully!",
      note: updatedNote
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Error updating note:', error);
    return new Response(JSON.stringify({ 
      error: error.message || 'Failed to update note' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
