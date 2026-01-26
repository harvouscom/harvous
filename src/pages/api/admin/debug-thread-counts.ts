/**
 * Debug endpoint to understand thread count discrepancies
 * GET /api/admin/debug-thread-counts?threadId=<threadId>
 */

import type { APIRoute } from 'astro';
import { db, Notes, NoteThreads, NoteScriptureReferences, ScriptureMetadata, eq, and } from 'astro:db';

export const GET: APIRoute = async ({ request, locals }) => {
  try {
    const { userId } = locals.auth();

    if (!userId) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const url = new URL(request.url);
    const threadId = url.searchParams.get('threadId');

    if (!threadId) {
      return new Response(JSON.stringify({ error: 'threadId parameter required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get all notes in thread
    const allNotes = await db.select({
      id: Notes.id,
      title: Notes.title,
      noteType: Notes.noteType,
      content: Notes.content
    })
    .from(Notes)
    .innerJoin(NoteThreads, eq(NoteThreads.noteId, Notes.id))
    .where(and(
      eq(NoteThreads.threadId, threadId),
      eq(Notes.userId, userId)
    ))
    .all();

    // Get scripture metadata for scripture notes
    const scriptureDetails = await Promise.all(
      allNotes
        .filter(n => n.noteType === 'scripture')
        .map(async (note) => {
          const metadata = await db.select()
            .from(ScriptureMetadata)
            .where(eq(ScriptureMetadata.noteId, note.id))
            .get();

          return {
            id: note.id,
            title: note.title,
            reference: metadata?.reference || 'Unknown'
          };
        })
    );

    // Count by type
    const counts = {
      all: allNotes.length,
      default: allNotes.filter(n => !n.noteType || n.noteType === 'default').length,
      scripture: allNotes.filter(n => n.noteType === 'scripture').length,
      resource: allNotes.filter(n => n.noteType === 'resource').length
    };

    return new Response(JSON.stringify({
      success: true,
      threadId,
      counts,
      notes: allNotes.map(n => ({
        id: n.id,
        title: n.title || '(no title)',
        noteType: n.noteType || 'default',
        contentPreview: n.content?.substring(0, 100) || ''
      })),
      scriptureNotes: scriptureDetails
    }, null, 2), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Error debugging thread counts:', error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message || 'Unknown error'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
