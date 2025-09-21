import type { APIRoute } from 'astro';
import { db, Notes, UserMetadata, eq, and, desc, isNotNull } from 'astro:db';

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

    // Get or create user metadata to track highest simpleNoteId used
    let userMetadata = await db.select()
      .from(UserMetadata)
      .where(eq(UserMetadata.userId, userId))
      .get();
    
    if (!userMetadata) {
      // Check if user has existing notes to get the highest ID
      const existingNotes = await db.select({
        simpleNoteId: Notes.simpleNoteId
      })
      .from(Notes)
      .where(and(
        eq(Notes.userId, userId),
        isNotNull(Notes.simpleNoteId)
      ))
      .orderBy(desc(Notes.simpleNoteId))
      .limit(1);
      
      const highestExistingId = existingNotes.length > 0 ? (existingNotes[0].simpleNoteId || 0) : 0;
      
      // Create user metadata record with the highest existing ID
      await db.insert(UserMetadata).values({
        id: `user_metadata_${userId}`,
        userId: userId,
        highestSimpleNoteId: highestExistingId,
        createdAt: new Date()
      });
      userMetadata = { 
        id: `user_metadata_${userId}`,
        userId: userId,
        highestSimpleNoteId: highestExistingId,
        createdAt: new Date(),
        updatedAt: null
      };
    }
    
    // Debug: userMetadata retrieved
    
    // The next simple note ID is always the highest used + 1
    // This ensures we never reuse deleted IDs
    const nextSimpleNoteId = (userMetadata?.highestSimpleNoteId || 0) + 1;
    
    // Debug: nextSimpleNoteId calculated

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

