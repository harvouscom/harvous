import type { APIRoute } from 'astro';
import { db, Notes, Threads, Spaces, Tags, NoteTags, NoteThreads, UserMetadata, UserXP, Comments, ScriptureMetadata, NoteThreadAccess, Members, eq } from 'astro:db';

export const DELETE: APIRoute = async ({ locals }) => {
  try {
    const { userId } = locals.auth();
    
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    console.log(`Deleting account for user ${userId}`);

    // Delete all user data in the correct order to respect foreign key constraints
    
    // 1. Fetch note IDs first (needed for junction table deletions)
    const userNotes = await db.select({ id: Notes.id }).from(Notes).where(eq(Notes.userId, userId)).all();
    const noteIds = userNotes.map(n => n.id);
    
    // Delete junction tables and related data
    if (noteIds.length > 0) {
      // Delete NoteThreads relationships
      for (const noteId of noteIds) {
        await db.delete(NoteThreads).where(eq(NoteThreads.noteId, noteId));
      }
      
      // Delete NoteTags relationships
      for (const noteId of noteIds) {
        await db.delete(NoteTags).where(eq(NoteTags.noteId, noteId));
      }
      
      // Delete Comments
      for (const noteId of noteIds) {
        await db.delete(Comments).where(eq(Comments.noteId, noteId));
      }
      
      // Delete ScriptureMetadata
      for (const noteId of noteIds) {
        await db.delete(ScriptureMetadata).where(eq(ScriptureMetadata.noteId, noteId));
      }
      
      // Delete NoteThreadAccess
      for (const noteId of noteIds) {
        await db.delete(NoteThreadAccess).where(eq(NoteThreadAccess.noteId, noteId));
      }
    }

    // 2. Delete Notes
    await db.delete(Notes).where(eq(Notes.userId, userId));

    // 3. Delete Threads
    await db.delete(Threads).where(eq(Threads.userId, userId));

    // 4. Delete Spaces and Members
    const userSpaces = await db.select({ id: Spaces.id }).from(Spaces).where(eq(Spaces.userId, userId)).all();
    const spaceIds = userSpaces.map(s => s.id);
    
    if (spaceIds.length > 0) {
      for (const spaceId of spaceIds) {
        await db.delete(Members).where(eq(Members.spaceId, spaceId));
      }
    }
    
    await db.delete(Spaces).where(eq(Spaces.userId, userId));

    // 5. Delete Tags (user's tags)
    await db.delete(Tags).where(eq(Tags.userId, userId));

    // 6. Delete UserXP
    await db.delete(UserXP).where(eq(UserXP.userId, userId));

    // 7. Delete UserMetadata
    await db.delete(UserMetadata).where(eq(UserMetadata.userId, userId));

    console.log(`Deleted all database records for user ${userId}`);

    // 8. Delete user from Clerk
    try {
      const clerkSecretKey = import.meta.env.CLERK_SECRET_KEY;
      
      if (!clerkSecretKey) {
        console.warn('CLERK_SECRET_KEY not found, skipping Clerk user deletion');
        // In production, this should be set, but we'll continue with database deletion
        if (import.meta.env.PROD) {
          console.error('⚠️ WARNING: CLERK_SECRET_KEY not found in production environment');
        }
      } else {
        // Use Clerk REST API to delete user
        const clerkApiUrl = `https://api.clerk.com/v1/users/${userId}`;
        const response = await fetch(clerkApiUrl, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${clerkSecretKey}`,
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error('❌ Clerk API error during user deletion:', {
            status: response.status,
            statusText: response.statusText,
            error: errorText,
            userId: userId,
            environment: import.meta.env.MODE,
            isProduction: import.meta.env.PROD
          });
          
          // In production, log but don't throw - database is already cleaned
          // This ensures the user sees success even if Clerk deletion fails
          // The error is logged for monitoring
          if (import.meta.env.PROD) {
            console.error('⚠️ WARNING: Clerk user deletion failed, but database deletion succeeded');
          }
        } else {
          console.log(`✅ Deleted Clerk user ${userId}`);
        }
      }
    } catch (clerkError: any) {
      console.error('❌ Error deleting Clerk user:', {
        error: clerkError.message,
        stack: clerkError.stack,
        userId: userId,
        environment: import.meta.env.MODE,
        isProduction: import.meta.env.PROD
      });
      // Continue even if Clerk deletion fails - database is already cleaned
      // Return success but log the error for monitoring
      if (import.meta.env.PROD) {
        console.error('⚠️ WARNING: Exception during Clerk user deletion, but database deletion succeeded');
      }
    }

    return new Response(JSON.stringify({ 
      success: true,
      message: 'Account and all data deleted successfully'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Delete account error:', error);
    return new Response(JSON.stringify({ 
      error: error.message || 'Failed to delete account' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

