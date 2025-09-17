import type { APIRoute } from 'astro';
import { db, Notes, UserMetadata, eq } from 'astro:db';

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
      // Create user metadata record if it doesn't exist
      await db.insert(UserMetadata).values({
        id: `user_metadata_${userId}`,
        userId: userId,
        highestSimpleNoteId: 0,
        createdAt: new Date()
      });
      userMetadata = { highestSimpleNoteId: 0 };
    }
    
    console.log('Next ID API - userMetadata:', userMetadata);
    
    // The next simple note ID is always the highest used + 1
    // This ensures we never reuse deleted IDs
    const nextSimpleNoteId = userMetadata.highestSimpleNoteId + 1;
    
    console.log('Next ID API - nextSimpleNoteId:', nextSimpleNoteId);

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

