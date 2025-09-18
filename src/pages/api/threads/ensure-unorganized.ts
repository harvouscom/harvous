import type { APIRoute } from 'astro';
import { db, Threads, eq, and } from 'astro:db';

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    // Get authenticated user
    const auth = await locals.auth();
    if (!auth?.userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const userId = auth.userId;
    console.log('Ensuring unorganized thread exists for user:', userId);

    // Check if unorganized thread already exists
    const existingThread = await db.select()
      .from(Threads)
      .where(and(
        eq(Threads.userId, userId),
        eq(Threads.id, 'thread_unorganized')
      ))
      .get();

    if (existingThread) {
      console.log('Unorganized thread already exists:', existingThread);
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Unorganized thread already exists',
        thread: existingThread
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Create the unorganized thread
    const unorganizedThread = {
      id: 'thread_unorganized',
      userId: userId,
      title: 'Unorganized',
      subtitle: 'Individual notes and unassigned content',
      color: null,
      spaceId: null,
      isPublic: false,
      isPinned: false,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await db.insert(Threads).values(unorganizedThread);
    console.log('Created unorganized thread:', result);

    return new Response(JSON.stringify({ 
      success: true, 
      message: 'Unorganized thread created successfully',
      thread: unorganizedThread
    }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Error ensuring unorganized thread:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to ensure unorganized thread exists' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
