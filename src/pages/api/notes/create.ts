import type { APIRoute } from 'astro';
import { db, Notes, Threads, UserMetadata, Tags, NoteTags, eq, and, desc, isNotNull } from 'astro:db';
import { generateNoteId } from '@/utils/ids';
import { awardNoteCreatedXP } from '@/utils/xp-system';
import { generateAutoTags, applyAutoTags } from '@/utils/auto-tag-generator';

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

    console.log('🔥 NOTE CREATION: XP awarded, starting auto-tag process for note:', newNote.id);

    // Auto-generate and apply tags based on note content
    try {
        // Starting auto-tag generation
        console.log('🔥 AUTO-TAG: Starting auto-tag generation process');
        console.log('Environment check:', {
          NODE_ENV: process.env.NODE_ENV,
          isProduction: process.env.NODE_ENV === 'production',
          hasClerkKey: !!process.env.CLERK_SECRET_KEY,
          clerkKeyType: process.env.CLERK_SECRET_KEY?.startsWith('sk_live_') ? 'production' : 'test'
        });
        
      // Check if auto-tag functions are available
      if (!generateAutoTags || !applyAutoTags) {
        console.error('🔥 AUTO-TAG: Functions not available!', { generateAutoTags: !!generateAutoTags, applyAutoTags: !!applyAutoTags });
        throw new Error('Auto-tag functions not available');
      }
      
      console.log('🔥 AUTO-TAG: Functions loaded successfully');
      
      // Generate auto-tag suggestions based on note content (80% confidence threshold)
      console.log('🔥 AUTO-TAG: Starting generation for note:', newNote.id);
      console.log('🔥 AUTO-TAG: Content to analyze:', {
        title: capitalizedTitle || '',
        content: capitalizedContent.substring(0, 100) + '...',
        userId: userId?.substring(0, 10) + '...'
      });
      
      const autoTagResult = await generateAutoTags(
        capitalizedTitle || '',
        capitalizedContent,
        userId,
        0.8 // Generate high-confidence tags including spiritual themes
      );
      
      console.log('🔥 AUTO-TAG: Generation completed:', {
        suggestionsCount: autoTagResult.suggestions.length,
        totalFound: autoTagResult.totalFound,
        highConfidence: autoTagResult.highConfidence,
        suggestions: autoTagResult.suggestions.map(s => s.keyword)
      });
      
         // Apply the auto-generated tags if any were found
         if (autoTagResult.suggestions.length > 0) {
           console.log('Applying auto-tags in production:', {
             noteId: newNote.id,
             suggestionsCount: autoTagResult.suggestions.length,
             suggestions: autoTagResult.suggestions.map(s => s.keyword)
           });
           
           const applyResult = await applyAutoTags(
             newNote.id,
             autoTagResult.suggestions,
             userId
           );
           
           console.log('Auto-tags applied successfully:', {
             noteId: newNote.id,
             appliedCount: applyResult.applied,
             totalSuggestions: autoTagResult.suggestions.length,
             errors: applyResult.errors
           });
           
           // Verify tags were actually created in database
           try {
             const createdTags = await db
               .select()
               .from(NoteTags)
               .innerJoin(Tags, eq(NoteTags.tagId, Tags.id))
               .where(and(eq(NoteTags.noteId, newNote.id), eq(Tags.userId, userId)));
             
             console.log('Verification - tags found in database:', {
               noteId: newNote.id,
               tagCount: createdTags.length,
               tags: createdTags.map(t => ({ name: t.Tags.name, isAutoGenerated: t.NoteTags.isAutoGenerated }))
             });
           } catch (verifyError) {
             console.error('Error verifying tags in database:', verifyError);
           }
         } else {
           console.log('No auto-tag suggestions found for note:', newNote.id);
         }
    } catch (error: unknown) {
      // Don't fail note creation if auto-tagging fails
      console.error('🔥 AUTO-TAG ERROR: Auto-tagging failed (non-critical):', error);
      console.error('🔥 AUTO-TAG ERROR: Error details:', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        noteId: newNote.id,
        userId: userId?.substring(0, 10) + '...',
        isProduction: process.env.NODE_ENV === 'production'
      });
      // In production, we should log this for debugging
      if (process.env.NODE_ENV === 'production') {
        console.error('🔥 PRODUCTION AUTO-TAG ERROR:', {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
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
