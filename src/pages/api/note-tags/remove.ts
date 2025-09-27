import type { APIRoute } from 'astro';
import { db, NoteTags, eq, and } from 'astro:db';

export const DELETE: APIRoute = async ({ request, locals }) => {
  try {
    const { userId } = locals.auth();
    
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const url = new URL(request.url);
    const noteId = url.searchParams.get('noteId');
    const tagId = url.searchParams.get('tagId');

    if (!noteId || !tagId) {
      return new Response(JSON.stringify({ error: 'Note ID and Tag ID are required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Remove the note-tag relationship
    const result = await db
      .delete(NoteTags)
      .where(and(eq(NoteTags.noteId, noteId), eq(NoteTags.tagId, tagId)));

    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Tag removed from note successfully' 
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error removing tag from note:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
