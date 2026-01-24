import type { APIRoute } from 'astro';
import { db, Threads, eq, and } from 'astro:db';

import { verifyToken } from '@clerk/backend';

export const prerender = false;

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    // Get authenticated user
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

    // Check if unorganized thread already exists
    const existingThread = await db.select()
      .from(Threads)
      .where(and(
        eq(Threads.userId, userId),
        eq(Threads.id, 'thread_unorganized')
      ))
      .get();

    if (existingThread) {
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

    try {
      await db.insert(Threads).values(unorganizedThread);

      return new Response(JSON.stringify({ 
        success: true, 
        message: 'Unorganized thread created',
        thread: unorganizedThread
      }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (insertError: any) {
      // If insert fails due to constraint, another request created it - re-fetch it
      if (insertError.code === 'SQLITE_CONSTRAINT' || 
          insertError.code === 'SQLITE_CONSTRAINT_PRIMARYKEY' || 
          insertError.rawCode === 1555 ||
          insertError.message?.includes('UNIQUE constraint failed')) {
        // Re-fetch the thread since another request created it
        const createdThread = await db.select()
          .from(Threads)
          .where(and(
            eq(Threads.userId, userId),
            eq(Threads.id, 'thread_unorganized')
          ))
          .get();

        if (createdThread) {
          return new Response(JSON.stringify({ 
            success: true, 
            message: 'Unorganized thread already exists',
            thread: createdThread
          }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }
      }
      // Re-throw if it's a different error
      throw insertError;
    }

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
