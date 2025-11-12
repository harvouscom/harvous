import type { APIRoute } from 'astro';
import { db, ScriptureMetadata, Notes, NoteThreads, eq, and, count, isNull } from 'astro:db';

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const { userId } = locals.auth();
    
    if (!userId) {
      return new Response(JSON.stringify({ 
        error: 'Authentication required' 
      }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const { reference, threadId } = await request.json();

    if (!reference || typeof reference !== 'string') {
      return new Response(JSON.stringify({ 
        error: 'Scripture reference is required' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Find existing scripture note with this reference for this user
    const existingScripture = await db.select({
      noteId: ScriptureMetadata.noteId,
      reference: ScriptureMetadata.reference
    })
      .from(ScriptureMetadata)
      .innerJoin(Notes, eq(ScriptureMetadata.noteId, Notes.id))
      .where(
        and(
          eq(ScriptureMetadata.reference, reference),
          eq(Notes.userId, userId)
        )
      )
      .limit(1)
      .get();

    if (!existingScripture) {
      return new Response(JSON.stringify({
        exists: false,
        noteId: null,
        inThread: false,
        inUnorganized: false
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check if scripture note is in the specified thread
    let inThread = false;
    if (threadId) {
      const threadRelation = await db.select()
        .from(NoteThreads)
        .where(
          and(
            eq(NoteThreads.noteId, existingScripture.noteId),
            eq(NoteThreads.threadId, threadId)
          )
        )
        .limit(1)
        .get();
      
      inThread = !!threadRelation;
    }

    // Check if scripture note is in unorganized (no NoteThreads entries)
    const threadCount = await db.select({ count: count() })
      .from(NoteThreads)
      .where(eq(NoteThreads.noteId, existingScripture.noteId))
      .get();
    
    const inUnorganized = !threadCount || threadCount.count === 0;

    return new Response(JSON.stringify({
      exists: true,
      noteId: existingScripture.noteId,
      reference: existingScripture.reference,
      inThread,
      inUnorganized
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Error checking for existing scripture note:', error);
    return new Response(JSON.stringify({ 
      error: error.message || 'Error checking for existing scripture note' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

