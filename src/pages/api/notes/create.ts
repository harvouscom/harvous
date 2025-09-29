import type { APIRoute } from 'astro';
import { db, Notes, Threads, UserMetadata, eq, and, desc, isNotNull } from 'astro:db';
import { generateNoteId } from '@/utils/ids';
import { awardNoteCreatedXP } from '@/utils/xp-system';

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    // Get userId from authenticated context
    const { userId } = locals.auth();
    
    if (!userId) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Parse form data
    const formData = await request.formData();
    const content = formData.get('content') as string;
    const title = formData.get('title') as string;
    const threadId = formData.get('threadId') as string;

    console.log("Creating note with userId:", userId, "title:", title, "content:", content?.substring(0, 50));

    if (!content || !content.trim()) {
      return new Response(JSON.stringify({ error: 'Content is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const capitalizedContent = content.charAt(0).toUpperCase() + content.slice(1);
    const capitalizedTitle = title ? (title.charAt(0).toUpperCase() + title.slice(1)) : title;
    
    // Ensure we have a valid threadId - if it's unorganized, use the default
    let finalThreadId = threadId;
    if (!finalThreadId || finalThreadId === 'thread_unorganized') {
      // Ensure the unorganized thread exists
      const { ensureUnorganizedThread } = await import('@/utils/unorganized-thread');
      await ensureUnorganizedThread(userId);
      finalThreadId = 'thread_unorganized';
    }
    
    // Get or create user metadata to track highest simpleNoteId used
    let userMetadata = await db.select()
      .from(UserMetadata)
      .where(eq(UserMetadata.userId, userId))
      .get();
    
    if (!userMetadata) {
      // Check if user has existing notes to get the highest ID
      const existingNotes = await db.select({
        simpleNoteId: Notes.simpleNoteId
      })
      .from(Notes)
      .where(and(
        eq(Notes.userId, userId),
        isNotNull(Notes.simpleNoteId)
      ))
      .orderBy(desc(Notes.simpleNoteId))
      .limit(1);
      
      const highestExistingId = existingNotes.length > 0 ? (existingNotes[0].simpleNoteId || 0) : 0;
      
      // Create user metadata record with the highest existing ID
      await db.insert(UserMetadata).values({
        id: `user_metadata_${userId}`,
        userId: userId,
        highestSimpleNoteId: highestExistingId,
        userColor: 'paper', // Default color
        createdAt: new Date()
      });
      userMetadata = { 
        id: `user_metadata_${userId}`,
        userId: userId,
        highestSimpleNoteId: highestExistingId,
        userColor: 'paper',
        createdAt: new Date(),
        updatedAt: null
      };
    }
    
    // The next simple note ID is always the highest used + 1
    // This ensures we never reuse deleted IDs
    const nextSimpleNoteId = (userMetadata?.highestSimpleNoteId || 0) + 1;
    
    const newNote = await db.insert(Notes)
      .values({ 
        id: generateNoteId(),
        content: capitalizedContent, 
        title: capitalizedTitle, 
        threadId: finalThreadId,
        spaceId: null,
        simpleNoteId: nextSimpleNoteId,
        userId, 
        isPublic: false,
        createdAt: new Date() 
      })
      .returning()
      .get();
      
    console.log("Note created successfully:", newNote);

    // Update user metadata to track the new highest simpleNoteId
    await db.update(UserMetadata)
      .set({ 
        highestSimpleNoteId: nextSimpleNoteId,
        updatedAt: new Date()
      })
      .where(eq(UserMetadata.userId, userId));

    // Update the thread's updatedAt timestamp
    await db.update(Threads)
      .set({ updatedAt: new Date() })
      .where(and(eq(Threads.id, finalThreadId), eq(Threads.userId, userId)));

    // Award XP for note creation
    await awardNoteCreatedXP(userId, newNote.id);

    // Auto-generate and apply tags based on note content
    try {
        // Starting auto-tag generation
        console.log('Environment check:', {
          NODE_ENV: process.env.NODE_ENV,
          isProduction: process.env.NODE_ENV === 'production',
          hasClerkKey: !!process.env.CLERK_SECRET_KEY,
          clerkKeyType: process.env.CLERK_SECRET_KEY?.startsWith('sk_live_') ? 'production' : 'test'
        });
        
      const { generateAutoTags, applyAutoTags } = await import('@/utils/auto-tag-generator');
      
      // Generate auto-tag suggestions based on note content (80% confidence threshold)
      const autoTagResult = await generateAutoTags(
        capitalizedTitle || '',
        capitalizedContent,
        userId,
        0.8 // Generate high-confidence tags including spiritual themes
      );
      
        // Apply the auto-generated tags if any were found
        if (autoTagResult.suggestions.length > 0) {
          const applyResult = await applyAutoTags(
            newNote.id,
            autoTagResult.suggestions,
            userId
          );
        }
    } catch (error) {
      // Don't fail note creation if auto-tagging fails
      console.error('Auto-tagging failed (non-critical):', error);
      // In production, we should log this for debugging
      if (process.env.NODE_ENV === 'production') {
        console.error('Production auto-tag error:', {
          error: error.message,
          stack: error.stack,
          noteId: newNote.id,
          userId: userId
        });
      }
    }

    return new Response(JSON.stringify({ 
      success: "Note created successfully!",
      note: newNote
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Error creating note:', error);
    return new Response(JSON.stringify({ 
      error: error.message || 'Failed to create note' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
