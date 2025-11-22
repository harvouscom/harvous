import type { APIRoute } from 'astro';
import { db, Notes, eq, desc } from 'astro:db';

export const GET: APIRoute = async ({ request, locals }) => {
  try {
    const { userId } = locals.auth();
    
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get limit from query parameter, default to 50, max 100
    const url = new URL(request.url);
    const limitParam = url.searchParams.get('limit');
    const limit = limitParam ? Math.min(parseInt(limitParam, 10), 100) : 50;
    const maxLimit = Math.max(1, limit); // Ensure at least 1

    // Fetch recent notes for the user
    const notes = await db
      .select({
        id: Notes.id,
        title: Notes.title,
        content: Notes.content,
        threadId: Notes.threadId,
        spaceId: Notes.spaceId,
        simpleNoteId: Notes.simpleNoteId,
        isPublic: Notes.isPublic,
        isFeatured: Notes.isFeatured,
        createdAt: Notes.createdAt,
        updatedAt: Notes.updatedAt,
      })
      .from(Notes)
      .where(eq(Notes.userId, userId))
      .orderBy(desc(Notes.updatedAt), desc(Notes.createdAt))
      .limit(maxLimit);

    // Format the response
    const formattedNotes = notes.map(note => ({
      id: note.id,
      title: note.title || 'Untitled Note',
      content: note.content,
      threadId: note.threadId,
      spaceId: note.spaceId,
      simpleNoteId: note.simpleNoteId,
      isPublic: note.isPublic,
      isFeatured: note.isFeatured,
      createdAt: note.createdAt,
      updatedAt: note.updatedAt,
      lastUpdated: note.updatedAt || note.createdAt,
    }));

    return new Response(JSON.stringify(formattedNotes), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error fetching recent notes:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
