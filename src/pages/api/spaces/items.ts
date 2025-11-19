import type { APIRoute } from 'astro';
import { db, Notes, Threads, NoteThreads, eq, and, ne, count } from 'astro:db';

export const GET: APIRoute = async ({ locals }) => {
  try {
    const { userId } = locals.auth();
    
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Fetch all user notes
    const allNotes = await db.select({
      id: Notes.id,
      title: Notes.title,
      content: Notes.content,
      spaceId: Notes.spaceId,
      createdAt: Notes.createdAt,
      updatedAt: Notes.updatedAt
    })
    .from(Notes)
    .where(eq(Notes.userId, userId))
    .all();

    // Fetch all user threads (excluding unorganized)
    const allThreads = await db.select({
      id: Threads.id,
      title: Threads.title,
      subtitle: Threads.subtitle,
      color: Threads.color,
      spaceId: Threads.spaceId,
      isPublic: Threads.isPublic,
      createdAt: Threads.createdAt,
      updatedAt: Threads.updatedAt
    })
    .from(Threads)
    .where(and(
      eq(Threads.userId, userId),
      ne(Threads.id, 'thread_unorganized')
    ))
    .all();

    // Get note counts for each thread
    const threadsWithCounts = await Promise.all(
      allThreads.map(async (thread) => {
        const noteCountResult = await db.select({ count: count() })
          .from(Notes)
          .innerJoin(NoteThreads, eq(NoteThreads.noteId, Notes.id))
          .where(and(
            eq(NoteThreads.threadId, thread.id),
            eq(Notes.userId, userId)
          ))
          .get();

        return {
          ...thread,
          count: noteCountResult?.count || 0
        };
      })
    );

    return new Response(JSON.stringify({
      notes: allNotes,
      threads: threadsWithCounts
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Error fetching items:', error);
    return new Response(JSON.stringify({ 
      error: error.message || 'Failed to fetch items' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

