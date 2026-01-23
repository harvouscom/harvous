import type { APIRoute } from 'astro';
import { db, Threads, Notes, NoteThreads, UserMetadata, eq, and } from 'astro:db';
import { generateThreadId, generateNoteId } from '@/utils/ids';
import { ensureUnorganizedThread } from '@/utils/unorganized-thread';
import { loadOnboardingNotes } from '@/utils/load-onboarding-notes';
import { processScriptureReferences } from '@/utils/process-scripture-references';
import { getAuthFromRequest, unauthorizedResponse } from '@/utils/auth-helpers';

export const prerender = false;

/**
 * Test endpoint to manually create onboarding thread for current user
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

    // Check if onboarding thread already exists
    const onboardingThreadId = `thread_onboarding_${userId}`;
    const existingThread = await db.select()
      .from(Threads)
      .where(and(eq(Threads.id, onboardingThreadId), eq(Threads.userId, userId)))
      .get();

    if (existingThread) {
      return new Response(JSON.stringify({ 
        success: false,
        message: 'Onboarding thread already exists',
        threadId: onboardingThreadId
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Ensure unorganized thread exists first
    await ensureUnorganizedThread(userId);
    
    // Load onboarding notes from markdown files
    let onboardingNotes;
    try {
      onboardingNotes = loadOnboardingNotes();
    } catch (error: any) {
      console.error('Error loading onboarding notes:', error);
      return new Response(JSON.stringify({ 
        success: false,
        error: `Failed to load onboarding notes: ${error.message}`,
        stack: import.meta.env.DEV ? error.stack : undefined
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    if (onboardingNotes.length === 0) {
      return new Response(JSON.stringify({ 
        success: false,
        error: 'No onboarding notes found in markdown files'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get or create user metadata to track highest simpleNoteId
    let userMetadata = await db.select()
      .from(UserMetadata)
      .where(eq(UserMetadata.userId, userId))
      .get();

    if (!userMetadata) {
      // Create user metadata if it doesn't exist
      await db.insert(UserMetadata).values({
        id: `user_metadata_${userId}`,
        userId: userId,
        highestSimpleNoteId: 0,
        userColor: 'paper',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      userMetadata = await db.select()
        .from(UserMetadata)
        .where(eq(UserMetadata.userId, userId))
        .get();
    }

    // Create onboarding thread
    const onboardingThreadTitle = "Welcome to Harvous";
    const capitalizedThreadTitle = onboardingThreadTitle.charAt(0).toUpperCase() + onboardingThreadTitle.slice(1);
    
    const now = new Date();
    await db.insert(Threads).values({
      id: onboardingThreadId,
      title: capitalizedThreadTitle,
      subtitle: `${onboardingNotes.length} notes to get you started`,
      color: 'blue',
      spaceId: null,
      userId: userId,
      isPublic: false,
      isPinned: false,
      createdAt: now,
      updatedAt: now,
      lastVisited: now, // Set lastVisited so thread appears in "All" tab and sorts correctly
    });
    
    // Create notes from loaded markdown content
    let currentSimpleNoteId = (userMetadata?.highestSimpleNoteId || 0) + 1;
    const createdNoteIds: string[] = [];
    
    for (const noteData of onboardingNotes) {
      const noteId = generateNoteId();
      
      // Capitalize note title to match pattern used elsewhere
      const capitalizedNoteTitle = noteData.title.charAt(0).toUpperCase() + noteData.title.slice(1);
      
      // Create the note with HTML content from markdown
      await db.insert(Notes).values({
        id: noteId,
        title: capitalizedNoteTitle,
        content: noteData.content, // Already converted to HTML
        threadId: onboardingThreadId,
        spaceId: null,
        simpleNoteId: currentSimpleNoteId,
        userId: userId,
        isPublic: false,
        addedBy: 'system',
        createdAt: new Date(),
      });
      
      // Link note to thread via junction table
      const junctionId = `note-thread-${noteId}-${Date.now()}`;
      await db.insert(NoteThreads).values({
        id: junctionId,
        noteId: noteId,
        threadId: onboardingThreadId,
        createdAt: new Date()
      });
      
      // Process scripture references in the note content
      // This will detect references like "John 3:16" and create scripture pills
      try {
        await processScriptureReferences(noteId, userId, onboardingThreadId, noteData.content);
      } catch (scriptureError: any) {
        // Don't fail note creation if scripture processing fails
        console.error(`Error processing scripture references for note ${noteId}:`, scriptureError);
      }
      
      createdNoteIds.push(noteId);
      currentSimpleNoteId++;
    }
    
    // Update user metadata with highest simpleNoteId
    await db.update(UserMetadata)
      .set({ 
        highestSimpleNoteId: currentSimpleNoteId - 1,
        updatedAt: new Date()
      })
      .where(eq(UserMetadata.userId, userId));
    
    console.log(`✅ Created onboarding thread with ${onboardingNotes.length} notes for user ${userId}`);

    return new Response(JSON.stringify({ 
      success: true,
      message: `Onboarding thread created with ${onboardingNotes.length} notes`,
      threadId: onboardingThreadId,
      notesCreated: createdNoteIds.length,
      noteIds: createdNoteIds
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Error creating onboarding thread:', error);
    console.error('Error details:', {
      message: error.message,
      stack: error.stack,
      name: error.name,
      code: error.code
    });
    return new Response(JSON.stringify({ 
      error: error.message || 'Failed to create onboarding thread',
      details: import.meta.env.DEV ? {
        stack: error.stack,
        name: error.name,
        code: error.code
      } : undefined
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

