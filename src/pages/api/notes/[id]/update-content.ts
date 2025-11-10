import type { APIRoute } from 'astro';
import { db, Notes, eq, and } from 'astro:db';

export const POST: APIRoute = async ({ params, request, locals }) => {
  try {
    const { userId } = locals.auth();
    const { id } = params;
    const { content } = await request.json();

    if (!content || typeof content !== 'string') {
      return new Response(JSON.stringify({ 
        success: false, 
        error: 'Content is required' 
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

    // Update the note content
    await db.update(Notes)
      .set({ 
        content: content,
        updatedAt: new Date()
      })
      .where(and(eq(Notes.id, id), eq(Notes.userId, userId)));

    return new Response(JSON.stringify({
      success: true,
      message: 'Note content updated successfully'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error updating note content:', error);
    return new Response(JSON.stringify({ 
      success: false, 
      error: 'Internal server error' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

