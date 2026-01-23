import type { APIRoute } from 'astro';
import { db, UserMetadata, Threads, Notes, NoteThreads, eq, and } from 'astro:db';
import { getAuthFromRequest, unauthorizedResponse } from '@/utils/auth-helpers';

export const prerender = false;

/**
 * Test endpoint to reset current user to "new user" state
 * This deletes UserMetadata and onboarding thread so the user will be treated as new
 * Only available in development
 */
export const POST: APIRoute = async ({ request, locals  }) => {
  // Only allow in development
  if (import.meta.env.PROD) {
    return new Response(JSON.stringify({ error: 'Test endpoint not available in production' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  try {
    const userId = await getAuthFromRequest(request);
    
    if (!userId) {
      return unauthorizedResponse();
    }

    // 1. Delete onboarding thread if it exists
    const onboardingThreadId = `thread_onboarding_${userId}`;
    const onboardingThread = await db.select()
      .from(Threads)
      .where(and(eq(Threads.id, onboardingThreadId), eq(Threads.userId, userId)))
      .get();

    if (onboardingThread) {
      // Get all notes in the onboarding thread
      const onboardingNotes = await db.select({ noteId: NoteThreads.noteId })
        .from(NoteThreads)
        .where(eq(NoteThreads.threadId, onboardingThreadId))
        .all();

      // Delete NoteThreads relationships
      await db.delete(NoteThreads)
        .where(eq(NoteThreads.threadId, onboardingThreadId));

      // Delete the notes
      for (const note of onboardingNotes) {
        await db.delete(Notes)
          .where(and(eq(Notes.id, note.noteId), eq(Notes.userId, userId)));
      }

      // Delete the thread
      await db.delete(Threads)
        .where(and(eq(Threads.id, onboardingThreadId), eq(Threads.userId, userId)));

      console.log(`✅ Deleted onboarding thread and ${onboardingNotes.length} notes`);
    }

    // 2. Delete UserMetadata to make user appear as "new"
    const existingMetadata = await db.select()
      .from(UserMetadata)
      .where(eq(UserMetadata.userId, userId))
      .get();

    if (existingMetadata) {
      await db.delete(UserMetadata)
        .where(eq(UserMetadata.userId, userId));
      console.log('✅ Deleted UserMetadata - user will be treated as new on next login');
    }

    return new Response(JSON.stringify({ 
      success: true,
      message: 'User reset to new user state. Refresh the page to see onboarding thread created.',
      deletedOnboardingThread: !!onboardingThread,
      deletedUserMetadata: !!existingMetadata
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Reset to new user error:', error);
    return new Response(JSON.stringify({ 
      error: error.message || 'Failed to reset user' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};


