import type { APIRoute } from 'astro';
import { db, Notes, Threads, UserMetadata, Tags, NoteTags, NoteThreads, ScriptureMetadata, ResourceMetadata, eq, and, desc, isNotNull } from 'astro:db';
import { generateNoteId } from '@/utils/ids';
import { awardCreationBonusXP } from '@/utils/xp-system';
import { generateAutoTags, applyAutoTags } from '@/utils/auto-tag-generator';
import { parseScriptureReference, normalizeScriptureReference } from '@/utils/scripture-detector';
import { handleAPIError } from '@/utils/error-handling';
import { validateContent, validateNoteType, validateThreadId, validateSpaceId, normalizeUrl } from '@/utils/validation';
import { rateLimitMiddleware, getClientIP } from '@/utils/rate-limit';
import { getNextUntitledNoteName } from '@/utils/untitled-naming';

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

    // Rate limiting for write operations
    const ip = getClientIP(request);
    const rateLimit = rateLimitMiddleware(userId, '/api/notes/create', 'write', ip);
    if (!rateLimit.allowed) {
      return new Response(JSON.stringify({ 
        error: rateLimit.error,
        code: 'RATE_LIMIT_EXCEEDED'
      }), {
        status: 429,
        headers: { 
          'Content-Type': 'application/json',
          'X-RateLimit-Remaining': String(rateLimit.remaining || 0),
          'X-RateLimit-Reset': String(rateLimit.resetTime || Date.now())
        }
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
    const resourceUrl = formData.get('resourceUrl') as string | null;
    const resourceMetadataStr = formData.get('resourceMetadata') as string | null;
    const spaceId = formData.get('spaceId') as string | null;
    
    // Parse pre-fetched resource metadata if provided
    let prefetchedResourceMetadata: { title?: string; description?: string; image?: string } | null = null;
    if (resourceMetadataStr) {
      try {
        prefetchedResourceMetadata = JSON.parse(resourceMetadataStr);
      } catch (e) {
        // Failed to parse, will fetch from URL instead
      }
    }

    // Validate noteType first (needed to determine if content is required)
    const noteTypeValidation = validateNoteType(noteType);
    if (!noteTypeValidation.isValid) {
      return new Response(JSON.stringify({ 
        error: noteTypeValidation.error,
        code: noteTypeValidation.code
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    const finalNoteType = noteType && noteTypeValidation.isValid ? noteType : 'default';

    // Validate content - resource notes don't require content
    const contentRequired = finalNoteType !== 'resource';
    const contentValidation = validateContent(content, contentRequired);
    if (!contentValidation.isValid) {
      return new Response(JSON.stringify({ 
        error: contentValidation.error,
        code: contentValidation.code
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Validate threadId
    const threadIdValidation = validateThreadId(threadId);
    if (!threadIdValidation.isValid) {
      return new Response(JSON.stringify({ 
        error: threadIdValidation.error,
        code: threadIdValidation.code
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Validate spaceId
    const spaceIdValidation = validateSpaceId(spaceId);
    if (!spaceIdValidation.isValid) {
      return new Response(JSON.stringify({ 
        error: spaceIdValidation.error,
        code: spaceIdValidation.code
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const capitalizedContent = content.charAt(0).toUpperCase() + content.slice(1);
    
    // Generate numbered untitled name if title is empty, otherwise capitalize
    let capitalizedTitle: string;
    if (!title || !title.trim()) {
      capitalizedTitle = await getNextUntitledNoteName(userId);
    } else {
      capitalizedTitle = title.charAt(0).toUpperCase() + title.slice(1);
    }
    
    // Always create note in unorganized as primary threadId
    // If a specific thread is selected, add it to that thread via junction table and update primary threadId
    const { ensureUnorganizedThread } = await import('@/utils/unorganized-thread');
    await ensureUnorganizedThread(userId);
    
    // Always start with unorganized as primary
    const finalThreadId = 'thread_unorganized';
    
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
    
    // Make spaceId optional - if not provided or is empty, set to null
    let finalSpaceId = null;
    if (spaceId && spaceId.trim() && spaceId !== 'default_space') {
      finalSpaceId = spaceId;
    }
    
    // CRITICAL OPERATIONS (must succeed for note creation to be valid)
    // These operations should be atomic, but Astro DB doesn't support explicit transactions
    // If any of these fail, the entire operation should fail
    
    const newNote = await db.insert(Notes)
      .values({ 
        id: generateNoteId(),
        content: capitalizedContent, 
        title: capitalizedTitle, 
        threadId: finalThreadId,
        spaceId: finalSpaceId,
        simpleNoteId: nextSimpleNoteId,
        noteType: finalNoteType,
        userId, 
        isPublic: false,
        createdAt: new Date() 
      })
      .returning()
      .get();
      
    // Update user metadata to track the new highest simpleNoteId
    // This is critical - if it fails, we have inconsistent state
    await db.update(UserMetadata)
      .set({ 
        highestSimpleNoteId: nextSimpleNoteId,
        updatedAt: new Date()
      })
      .where(eq(UserMetadata.userId, userId));

    // Update the thread's updatedAt timestamp (unorganized thread)
    // This is critical for maintaining thread state
    await db.update(Threads)
      .set({ updatedAt: new Date() })
      .where(and(eq(Threads.id, finalThreadId), eq(Threads.userId, userId)));
    
    // If a specific thread was requested (not unorganized), add the note to that thread via junction table
    // Note automatically removed from unorganized when junction entry is created
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
        }
      } catch (error) {
        console.error('Error adding note to specific thread:', error);
        // Don't fail the note creation if junction table insertion fails
      }
    }

    // NON-CRITICAL OPERATIONS (can fail without affecting note creation)
    // These are best-effort and won't cause the note creation to fail
    
    // Award XP for note creation (pass content and note type)
    // This is non-critical - if it fails, the note is still created
    const isScriptureNote = finalNoteType === 'scripture';
    try {
      // Award creation bonus XP
      await awardCreationBonusXP(userId, 'note');
    } catch (error) {
      // XP award failed, but note creation succeeded - log and continue
      console.error('XP award failed (non-critical):', error);
    }
    
    // Reload the note from database to ensure we return the correct threadId
    // This is important if the note was moved from unorganized to a specific thread
    const finalNote = await db.select()
      .from(Notes)
      .where(eq(Notes.id, newNote.id))
      .get();
    
    if (finalNote) {
      // Use the reloaded note for the response
      Object.assign(newNote, finalNote);
    }

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
        // Normalize the reference for consistent storage
        const normalizedReference = normalizeScriptureReference(scriptureReference);
        const parsed = parseScriptureReference(normalizedReference);
        if (parsed) {
          const verseStart = Array.isArray(parsed.verse) ? parsed.verse[0] : parsed.verse;
          const verseEnd = Array.isArray(parsed.verse) ? parsed.verse[1] : undefined;

          await db.insert(ScriptureMetadata).values({
            id: `scripture_${newNote.id}_${Date.now()}`,
            noteId: newNote.id,
            reference: normalizedReference, // Store normalized reference
            book: parsed.book,
            chapter: parsed.chapter,
            verse: verseStart,
            verseEnd: verseEnd || null,
            translation: scriptureVersion || 'NET',
            originalText: capitalizedContent,
            createdAt: new Date()
          });
        }
      } catch (error: any) {
        // Don't fail note creation if ScriptureMetadata creation fails
        console.error('Error creating ScriptureMetadata (non-critical):', error);
      }
    }

    // Create ResourceMetadata record if this is a resource note
    // IMPORTANT: Use pre-fetched metadata from frontend if available to avoid timing issues
    if (finalNoteType === 'resource' && resourceUrl) {
      try {
        // Normalize URL by adding https:// if missing
        const normalizedResourceUrl = normalizeUrl(resourceUrl);
        
        // Use pre-fetched metadata if available, otherwise fetch it
        let resourceMetadata: { title?: string; description?: string; image?: string } | null = prefetchedResourceMetadata;
        
        // Only fetch if no pre-fetched metadata was provided
        if (!resourceMetadata) {
          try {
            const metadataFetchPromise = fetch(`${new URL(request.url).origin}/api/resource/metadata`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ url: normalizedResourceUrl }),
            });
            
            const timeoutPromise = new Promise((_, reject) => 
              setTimeout(() => reject(new Error('Metadata fetch timeout')), 10000)
            );
            
            const metadataResponse = await Promise.race([metadataFetchPromise, timeoutPromise]) as Response;
            
            if (metadataResponse.ok) {
              const metadataData = await metadataResponse.json();
              if (metadataData.success && metadataData.metadata) {
                resourceMetadata = metadataData.metadata;
              }
            }
          } catch (error) {
            // Non-critical - note will still be created without metadata
          }
        }

        // Create ResourceMetadata record
        const resourceMetadataRecord = {
          id: `resource_${newNote.id}_${Date.now()}`,
          noteId: newNote.id,
          sourceUrl: normalizedResourceUrl,
          sourceTitle: resourceMetadata?.title || null,
          sourceDescription: resourceMetadata?.description || null,
          sourceImage: resourceMetadata?.image || null,
          createdAt: new Date()
        };
        
        await db.insert(ResourceMetadata).values(resourceMetadataRecord);

        // Update note with metadata if available
        // For resource notes, always use metadata title if available (not the URL)
        if (resourceMetadata && resourceMetadata.title) {
          const metadataTitle = resourceMetadata.title.charAt(0).toUpperCase() + resourceMetadata.title.slice(1);
          
          await db.update(Notes)
            .set({
              title: metadataTitle,
              updatedAt: new Date()
            })
            .where(eq(Notes.id, newNote.id));

          // Reload note to get updated values
          const updatedNote = await db.select()
            .from(Notes)
            .where(eq(Notes.id, newNote.id))
            .get();
          
          if (updatedNote) {
            Object.assign(newNote, updatedNote);
            capitalizedTitle = metadataTitle; // Update local variable too
          }
        }
      } catch (error: any) {
        // Don't fail note creation if ResourceMetadata creation fails
        console.error('Error creating ResourceMetadata (non-critical):', error);
      }
    }

    // Process scripture references in the note content (background processing)
    let scriptureResults: any[] = [];
    try {
      // Determine the actual thread ID (the thread the note was created in)
      const actualThreadId = threadId && threadId !== 'thread_unorganized' ? threadId : 'thread_unorganized';
      
      // Call processing function directly
      const { processScriptureReferences } = await import('@/utils/process-scripture-references');
      const processResult = await processScriptureReferences(newNote.id, userId, actualThreadId);
      scriptureResults = processResult.results || [];
    } catch (error: any) {
      // Don't fail note creation if scripture processing fails
      console.error('Error processing scripture references (non-critical):', error);
    }

    return new Response(JSON.stringify({ 
      success: "Note created!",
      note: newNote,
      scriptureResults
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/notes/create',
      action: 'create_note'
    });
    return new Response(JSON.stringify({ 
      error: standardError.message,
      code: standardError.code
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
