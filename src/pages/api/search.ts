import type { APIRoute } from 'astro';
import { db, Notes, Threads, eq, and, or, like, desc } from 'astro:db';

export const GET: APIRoute = async ({ request, locals }) => {
  try {
    // Get user ID from Clerk authentication
    const { userId } = locals.auth();
    
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get search parameters
    const url = new URL(request.url);
    const query = url.searchParams.get('q');
    const type = url.searchParams.get('type') || 'all'; // all, notes, threads
    const limit = parseInt(url.searchParams.get('limit') || '50');

    if (!query || query.trim().length === 0) {
      return new Response(JSON.stringify({ results: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const searchTerm = `%${query.trim()}%`;
    let results: any[] = [];

    // Search notes if requested
    if (type === 'all' || type === 'notes') {
      const notes = await db
        .select()
        .from(Notes)
        .where(
          and(
            eq(Notes.userId, userId),
            or(
              like(Notes.title, searchTerm),
              like(Notes.content, searchTerm)
            )
          )
        )
        .orderBy(desc(Notes.updatedAt), desc(Notes.createdAt))
        .limit(limit);

      const noteResults = notes.map(note => ({
        id: note.id,
        type: 'note',
        title: note.title || 'Untitled Note',
        content: note.content.substring(0, 200) + (note.content.length > 200 ? '...' : ''),
        threadId: note.threadId,
        spaceId: note.spaceId,
        lastUpdated: note.updatedAt || note.createdAt,
        createdAt: note.createdAt,
        updatedAt: note.updatedAt,
      }));

      results = [...results, ...noteResults];
    }

    // Search threads if requested
    if (type === 'all' || type === 'threads') {
      const threads = await db
        .select()
        .from(Threads)
        .where(
          and(
            eq(Threads.userId, userId),
            like(Threads.title, searchTerm)
          )
        )
        .orderBy(desc(Threads.updatedAt), desc(Threads.createdAt))
        .limit(limit);

      const threadResults = threads.map(thread => ({
        id: thread.id,
        type: 'thread',
        title: thread.title,
        subtitle: thread.subtitle || '',
        spaceId: thread.spaceId,
        color: thread.color,
        lastUpdated: thread.updatedAt || thread.createdAt,
        createdAt: thread.createdAt,
        updatedAt: thread.updatedAt,
      }));

      results = [...results, ...threadResults];
    }

    // Sort all results by last updated
    results.sort((a, b) => 
      new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime()
    );

    // Limit total results
    results = results.slice(0, limit);

    return new Response(JSON.stringify({ 
      results,
      query,
      type,
      total: results.length
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Search API error:', error);
    return new Response(JSON.stringify({ 
      error: 'Internal server error',
      results: []
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
