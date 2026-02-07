export const prerender = false;

import type { APIRoute } from 'astro';
import { db, Threads, Notes, eq, and, isNotNull } from 'astro:db';
import { handleAPIError } from '@/utils/error-handling';

export const GET: APIRoute = async ({ request, locals }) => {
  try {
    const { userId } = locals.auth();

    if (!userId) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const origin = new URL(request.url).origin;

    const [threadRows, noteRows] = await Promise.all([
      db
        .select({
          id: Threads.id,
          title: Threads.title,
          shareToken: Threads.shareToken
        })
        .from(Threads)
        .where(and(eq(Threads.userId, userId), isNotNull(Threads.shareToken))),
      db
        .select({
          id: Notes.id,
          title: Notes.title,
          content: Notes.content,
          shareToken: Notes.shareToken
        })
        .from(Notes)
        .where(
          and(
            eq(Notes.userId, userId),
            eq(Notes.noteType, 'default'),
            isNotNull(Notes.shareToken)
          )
        )
    ]);

    const threads = threadRows
      .filter((t): t is typeof t & { shareToken: string } => t.shareToken != null)
      .map((t) => ({
        id: t.id,
        title: t.title || 'Untitled thread',
        shareToken: t.shareToken,
        shareUrl: `${origin}/shared/thread/${t.shareToken}`
      }));

    const notes = noteRows
      .filter((n): n is typeof n & { shareToken: string } => n.shareToken != null)
      .map((n) => {
        const title =
          n.title?.trim() ||
          (n.content?.split('\n')[0]?.trim().slice(0, 80) || 'Untitled note');
        return {
          id: n.id,
          title: title.length > 80 ? title.slice(0, 77) + '...' : title,
          shareToken: n.shareToken,
          shareUrl: `${origin}/shared/note/${n.shareToken}`
        };
      });

    return new Response(
      JSON.stringify({ threads, notes }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'private, max-age=0, no-store'
        }
      }
    );
  } catch (error: unknown) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/profile/my-sharing',
      action: 'get_my_sharing'
    });
    return new Response(
      JSON.stringify({
        error: standardError.message,
        code: standardError.code
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
};
