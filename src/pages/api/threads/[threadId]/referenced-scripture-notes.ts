import type { APIRoute } from 'astro';
import { db, NoteScriptureReferences, Notes, eq, and, inArray } from 'astro:db';
import { handleAPIError } from '@/utils/error-handling';

export const GET: APIRoute = async ({ params, request, locals }) => {
  try {
    const { userId } = locals.auth();
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const threadId = params.threadId;
    const url = new URL(request.url);
    const noteIdsParam = url.searchParams.get('noteIds');
    
    if (!noteIdsParam) {
      return new Response(JSON.stringify({ scriptureNoteIds: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const noteIds = noteIdsParam.split(',').filter(id => id);
    
    if (noteIds.length === 0) {
      return new Response(JSON.stringify({ scriptureNoteIds: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get scripture notes referenced by these notes
    const references = await db
      .select({ 
        scriptureNoteId: NoteScriptureReferences.scriptureNoteId
      })
      .from(NoteScriptureReferences)
      .innerJoin(Notes, eq(NoteScriptureReferences.scriptureNoteId, Notes.id))
      .where(and(
        inArray(NoteScriptureReferences.noteId, noteIds),
        eq(Notes.userId, userId),
        eq(Notes.noteType, 'scripture')
      ))
      .all();

    const scriptureNoteIds = Array.from(
      new Set(references.map(r => r.scriptureNoteId))
    );

    return new Response(JSON.stringify({ scriptureNoteIds }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error: any) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/threads/[threadId]/referenced-scripture-notes',
      action: 'get_referenced_scripture_notes',
      threadId: params.threadId
    });
    return new Response(JSON.stringify({ 
      error: standardError.message,
      code: standardError.code
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
