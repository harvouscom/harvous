export const prerender = false;

import type { APIRoute } from 'astro';
import { db, Notes, eq, and } from 'astro:db';
import { handleAPIError } from '@/utils/error-handling';

/**
 * Returns the list of locked note IDs (and optionally content) for the current user.
 * Used by the profile "Change lock PIN" flow to re-encrypt all locked notes with the new PIN.
 */
export const GET: APIRoute = async ({ request, locals }) => {
  try {
    const { userId } = locals.auth();

    if (!userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const url = new URL(request.url);
    const includeContent = url.searchParams.get('content') === 'true';

    const lockedOnly = await db
      .select(
        includeContent
          ? { id: Notes.id, content: Notes.content }
          : { id: Notes.id }
      )
      .from(Notes)
      .where(and(eq(Notes.userId, userId), eq(Notes.contentEncrypted, true)))
      .all();

    const result = includeContent
      ? lockedOnly.map((n) => ({ id: n.id, content: (n as { content?: string }).content }))
      : lockedOnly.map((n) => ({ id: n.id }));

    return new Response(JSON.stringify({ notes: result }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/user/locked-notes',
      action: 'get_locked_notes'
    });
    return new Response(
      JSON.stringify({ error: standardError.message, code: standardError.code }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
