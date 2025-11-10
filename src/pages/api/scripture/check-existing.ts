import type { APIRoute } from 'astro';
import { db, ScriptureMetadata, Notes, eq, and } from 'astro:db';

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

    const { reference } = await request.json();

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

    if (existingScripture) {
      return new Response(JSON.stringify({
        exists: true,
        noteId: existingScripture.noteId,
        reference: existingScripture.reference
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({
      exists: false,
      noteId: null
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

