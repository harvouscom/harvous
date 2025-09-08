import type { APIRoute } from 'astro';
import { db, Notes, eq } from 'astro:db';

export const GET: APIRoute = async ({ locals }) => {
  try {
    // Get userId from authenticated context
    const { userId } = locals.auth();
    
    if (!userId) {
      return new Response(JSON.stringify({ 
        error: 'Authentication required' 
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
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

    // Format the ID with leading zeros (e.g., N001, N002, N003, etc.)
    const formattedId = `N${nextSimpleNoteId.toString().padStart(3, '0')}`;

    return new Response(JSON.stringify({ 
      nextNoteId: nextSimpleNoteId,
      formattedId: formattedId
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Error getting next note ID:', error);
    return new Response(JSON.stringify({ 
      error: error.message || 'Failed to get next note ID' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
