import type { APIRoute } from 'astro';
import { db, Notes, Threads, UserMetadata, Tags, NoteTags, NoteThreads, ScriptureMetadata, eq, and, desc, isNotNull } from 'astro:db';
import { generateNoteId } from '@/utils/ids';
import { awardNoteCreatedXP } from '@/utils/xp-system';
import { generateAutoTags, applyAutoTags } from '@/utils/auto-tag-generator';
import { parseScriptureReference } from '@/utils/scripture-detector';

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
    const noteType = formData.get('noteType') as string;
    const scriptureReference = formData.get('scriptureReference') as string | null;
    const scriptureVersion = formData.get('scriptureVersion') as string | null;

    console.log("Creating note with userId:", userId, "title:", title, "content:", content?.substring(0, 50), "noteType:", noteType);

    if (!content || !content.trim()) {
      return new Response(JSON.stringify({ error: 'Content is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Validate noteType
    const validNoteTypes = ['default', 'scripture', 'resource'];
    const finalNoteType = noteType && validNoteTypes.includes(noteType) ? noteType : 'default';

    const capitalizedContent = content.charAt(0).toUpperCase() + content.slice(1);
    const capitalizedTitle = title ? (title.charAt(0).toUpperCase() + title.slice(1)) : title;
    
    // Pure junction table approach: Always create note in unorganized, then add to specific thread via junction table
    const { ensureUnorganizedThread } = await import('@/utils/unorganized-thread');
    await ensureUnorganizedThread(userId);
    const finalThreadId = 'thread_unorganized'; // Always use unorganized as primary
    
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
        email: null,
        firstName: null,
        lastName: null,
        profileImageUrl: null,
        clerkDataUpdatedAt: null,
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
        noteType: finalNoteType,
        userId, 
        isPublic: false,
        createdAt: new Date() 
      })
      .returning()
      .get();
      
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

    // If a specific thread was requested (not unorganized), add the note to that thread via junction table
    if (threadId && threadId !== 'thread_unorganized') {
      try {
        // Verify the target thread exists and belongs to the user
        const targetThread = await db.select()
          .from(Threads)
          .where(and(eq(Threads.id, threadId), eq(Threads.userId, userId)))
          .get();
        
        if (targetThread) {
          // Add note to the specific thread via junction table
          await db.insert(NoteThreads).values({
            id: `note-thread-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            noteId: newNote.id,
            threadId: threadId,
            createdAt: new Date()
          });
          
          // Update the target thread's timestamp
          await db.update(Threads)
            .set({ updatedAt: new Date() })
            .where(and(eq(Threads.id, threadId), eq(Threads.userId, userId)));
          
          console.log(`Note ${newNote.id} added to thread ${threadId} via junction table`);
        }
      } catch (error) {
        console.error('Error adding note to specific thread:', error);
        // Don't fail the note creation if junction table insertion fails
      }
    }

    // Award XP for note creation
    await awardNoteCreatedXP(userId, newNote.id);

    // Auto-generate and apply tags based on note content
    try {
      // Check if auto-tag functions are available
      if (!generateAutoTags || !applyAutoTags) {
        throw new Error('Auto-tag functions not available');
      }
      
      // Generate auto-tag suggestions based on note content (80% confidence threshold)
      const autoTagResult = await generateAutoTags(
        capitalizedTitle || '',
        capitalizedContent,
        userId,
        0.8 // Generate high-confidence tags
      );
      
         // Apply the auto-generated tags if any were found
         if (autoTagResult.suggestions.length > 0) {
           const applyResult = await applyAutoTags(
             newNote.id,
             autoTagResult.suggestions,
             userId
           );
         }
    } catch (error: unknown) {
      // Don't fail note creation if auto-tagging fails
      console.error('Auto-tagging failed (non-critical):', error);
    }

    // Create ScriptureMetadata record if this is a scripture note
    if (finalNoteType === 'scripture' && scriptureReference) {
      try {
        const parsed = parseScriptureReference(scriptureReference);
        if (parsed) {
          const verseStart = Array.isArray(parsed.verse) ? parsed.verse[0] : parsed.verse;
          const verseEnd = Array.isArray(parsed.verse) ? parsed.verse[1] : undefined;

          await db.insert(ScriptureMetadata).values({
            id: `scripture_${newNote.id}_${Date.now()}`,
            noteId: newNote.id,
            reference: scriptureReference,
            book: parsed.book,
            chapter: parsed.chapter,
            verse: verseStart,
            verseEnd: verseEnd || null,
            translation: scriptureVersion || 'NET',
            originalText: capitalizedContent,
            createdAt: new Date()
          });

          console.log(`ScriptureMetadata created for note ${newNote.id}: ${scriptureReference}`);
        }
      } catch (error: any) {
        // Don't fail note creation if ScriptureMetadata creation fails
        console.error('Error creating ScriptureMetadata (non-critical):', error);
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
