import type { APIRoute } from 'astro';
import { db, Notes, Threads, Spaces, Tags, NoteTags, NoteThreads, UserMetadata, UserXP, Comments, ScriptureMetadata, Members, eq } from 'astro:db';

import { verifyToken } from '@clerk/backend';

export const prerender = false;

export const DELETE: APIRoute = async ({ request, locals  }) => {
  try {
    let userId: string | null = null;

    // SSR Mode: Use middleware auth
    if (locals?.auth) {
      const auth = locals.auth();
      userId = auth.userId || null;
    }
    // Static/Capacitor Mode: Verify JWT from Authorization header
    else {
      const authHeader = request.headers.get('Authorization');
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        try {
          const verified = await verifyToken(token, {
            secretKey: import.meta.env.CLERK_SECRET_KEY
          });
          userId = verified.sub;
        } catch (error) {
          console.error('[API Auth] Token verification failed:', error);
        }
      }
    }

    if (!userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }


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

    return new Response(JSON.stringify({ 
      success: true,
      message: 'All data cleared'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Clear data error:', error);
    return new Response(JSON.stringify({ 
      error: error.message || 'Failed to clear data' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

