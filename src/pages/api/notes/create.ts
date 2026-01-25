import type { APIRoute } from 'astro';
import { db, Notes, Threads, UserMetadata, Tags, NoteTags, NoteThreads, ScriptureMetadata, ResourceMetadata, eq, and, desc, isNotNull } from 'astro:db';
import { generateNoteId, generateShareToken } from '@/utils/ids';
import { awardCreationBonusXP } from '@/utils/xp-system';
import { generateAutoTags, applyAutoTags } from '@/utils/auto-tag-generator';
import { parseScriptureReference, normalizeScriptureReference } from '@/utils/scripture-detector';
import { handleAPIError } from '@/utils/error-handling';
import { validateContent, validateNoteType, validateThreadId, validateSpaceId, normalizeUrl, extractDomain, validateResourceUrl } from '@/utils/validation';
import { rateLimitMiddleware, getClientIP } from '@/utils/rate-limit';
import { successResponse, unauthorizedResponse, errorResponse, rateLimitedResponse, jsonResponse, serverErrorResponse } from '@/utils/api-responses';
import { getNextUntitledNoteName } from '@/utils/untitled-naming';
import { extractArticleContent } from '@/utils/content-extractor';
import { debug } from '@/utils/logger';
import { canCreateNote } from '@/utils/subscription';

// Title character limits
const TITLE_HARD_LIMIT = 50;  // Maximum allowed

// Helper function to truncate and capitalize title
const truncateAndCapitalizeTitle = (title: string): string => {
  const truncated = title.slice(0, TITLE_HARD_LIMIT);
  return truncated.charAt(0).toUpperCase() + truncated.slice(1);
};

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    // Get userId from authenticated context
    const { userId } = locals.auth();
    
    if (!userId) {
      return unauthorizedResponse();
    }

        // Check note limit before allowing creation
        const auth = locals.auth();
        const noteLimitCheck = await canCreateNote(userId, auth);
    if (!noteLimitCheck.allowed) {
      return jsonResponse({
        error: noteLimitCheck.reason || 'Note limit reached',
        code: 'NOTE_LIMIT_EXCEEDED',
        currentCount: noteLimitCheck.currentCount,
        limit: noteLimitCheck.limit,
        upgradeUrl: noteLimitCheck.upgradeUrl
      }, 403);
    }

    // Rate limiting for write operations
    const ip = getClientIP(request);
    const rateLimit = rateLimitMiddleware(userId, '/api/notes/create', 'write', ip);
    if (!rateLimit.allowed) {
      return rateLimitedResponse(
        rateLimit.resetTime || Date.now(),
        rateLimit.error || 'Rate limit exceeded'
      );
    }

    // Parse form data
    const formData = await request.formData();
    const content = formData.get('content') as string;
    const title = formData.get('title') as string;
    const threadId = formData.get('threadId') as string;
    const noteType = formData.get('noteType') as string;
    
    // Debug logging (development only)
    debug('[api/notes/create] Received request', { threadId, noteType });
    const scriptureReference = formData.get('scriptureReference') as string | null;
    const scriptureVersion = formData.get('scriptureVersion') as string | null;
    const resourceUrl = formData.get('resourceUrl') as string | null;
    const resourceMetadataStr = formData.get('resourceMetadata') as string | null;
    const spaceId = formData.get('spaceId') as string | null;
    
    // Parse pre-fetched resource metadata if provided
    let prefetchedResourceMetadata: { title?: string; description?: string; image?: string; articleContent?: string; siteName?: string } | null = null;
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
      return errorResponse(noteTypeValidation.error || 'Invalid note type', noteTypeValidation.code);
    }
    const finalNoteType = noteType && noteTypeValidation.isValid ? noteType : 'default';

    // Validate content - resource notes don't require content
    const contentRequired = finalNoteType !== 'resource';
    const contentValidation = validateContent(content, contentRequired);
    if (!contentValidation.isValid) {
      return errorResponse(contentValidation.error || 'Invalid content', contentValidation.code);
    }

    // Validate threadId
    const threadIdValidation = validateThreadId(threadId);
    if (!threadIdValidation.isValid) {
      return errorResponse(threadIdValidation.error || 'Invalid thread ID', threadIdValidation.code);
    }

    // Validate spaceId
    const spaceIdValidation = validateSpaceId(spaceId);
    if (!spaceIdValidation.isValid) {
      return errorResponse(spaceIdValidation.error || 'Invalid space ID', spaceIdValidation.code);
    }

    // Validate resourceUrl if this is a resource note
    let validatedResourceUrl: string | null = null;
    let isPDF = false;
    if (finalNoteType === 'resource') {
      if (!resourceUrl || !resourceUrl.trim()) {
        return errorResponse('Resource URL is required', 'URL_REQUIRED');
      }
      
      const urlValidation = validateResourceUrl(resourceUrl);
      if (!urlValidation.isValid) {
        return errorResponse(urlValidation.error || 'Invalid URL', urlValidation.code || 'INVALID_URL');
      }
      
      // Use validated normalized URL and store PDF flag
      validatedResourceUrl = urlValidation.normalizedUrl!;
      isPDF = urlValidation.isPDF || false;
    }

    // Capitalize content, handling empty/null content safely
    const capitalizedContent = content && content.length > 0 
      ? content.charAt(0).toUpperCase() + content.slice(1)
      : content || '';
    
    // Generate numbered untitled name if title is empty, otherwise truncate and capitalize
    let capitalizedTitle: string;
    if (!title || !title.trim()) {
      capitalizedTitle = await getNextUntitledNoteName(userId);
    } else {
      capitalizedTitle = truncateAndCapitalizeTitle(title);
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
        churchName: null,
        churchCity: null,
        churchState: null,
        churchCountry: null,
        currentSeason: null,
        lastMonthlyVisit: null,
        churchAddedAt: null,
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
    
    const now = new Date();
    
    // Scripture notes are automatically shared
    const isScriptureNote = finalNoteType === 'scripture';
    const shouldAutoShare = isScriptureNote;
    const shareToken = shouldAutoShare ? generateShareToken() : null;
    
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
        isPublic: shouldAutoShare,
        shareToken: shareToken,
        shareTokenCreatedAt: shouldAutoShare ? now : null,
        createdAt: now,
        lastVisited: now // Set lastVisited so newly created notes appear above unvisited items
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
    
    // If a specific thread was requested (not unorganized), add the note to that thread via junction table
    // Note automatically removed from unorganized when junction entry is created
    let noteStaysInUnorganized = true; // Track if note will stay in unorganized
    
    if (threadId && threadId.trim() !== '' && threadId !== 'thread_unorganized') {
      debug('[api/notes/create] Adding note to thread', { threadId });
      try {
        // Verify the target thread exists and belongs to the user
        const targetThread = await db.select()
          .from(Threads)
          .where(and(eq(Threads.id, threadId), eq(Threads.userId, userId)))
          .get();
        
        if (targetThread) {
          debug('[api/notes/create] Target thread found', { threadId: targetThread.id, title: targetThread.title });
          // Add note to the specific thread via junction table
          const junctionId = `note-thread-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          
          await db.insert(NoteThreads).values({
            id: junctionId,
            noteId: newNote.id,
            threadId: threadId,
            createdAt: new Date()
          });
          debug('[api/notes/create] Junction table entry created', { noteId: newNote.id, threadId });
          
          // Update the note's threadId field to the target thread
          // This ensures the note is properly associated with the thread in both the junction table AND the note's primary threadId field
          await db.update(Notes)
            .set({ threadId: threadId })
            .where(eq(Notes.id, newNote.id));
          debug('[api/notes/create] Note threadId field updated', { threadId });
          
          // Update the target thread's timestamp
          await db.update(Threads)
            .set({ updatedAt: new Date() })
            .where(and(eq(Threads.id, threadId), eq(Threads.userId, userId)));
          debug('[api/notes/create] Thread timestamp updated');
          
          // Note is being moved to specific thread, so it won't stay in unorganized
          noteStaysInUnorganized = false;
        } else {
          console.error('[api/notes/create] Target thread not found or does not belong to user', { threadId, userId: userId?.substring(0, 10) + '...' });
          // Try to find any thread with this ID to debug
          const anyThread = await db.select()
            .from(Threads)
            .where(eq(Threads.id, threadId))
            .get();
          console.error('[api/notes/create] Thread exists in DB but userId mismatch', { exists: !!anyThread });
          // Target thread not found, note stays in unorganized
          noteStaysInUnorganized = true;
        }
      } catch (error) {
        console.error('[api/notes/create] Error adding note to specific thread:', error);
        // Don't fail the note creation if junction table insertion fails
      }
    } else {
      debug('[api/notes/create] Note will be created in unorganized', { threadId });
      // Note stays in unorganized (no specific thread provided)
      noteStaysInUnorganized = true;
    }

    // Update the unorganized thread's updatedAt timestamp ONLY if the note is actually staying in unorganized
    // This prevents the unorganized thread from being updated when a note is created with a suggested thread
    // which would trigger navigation refresh logic that incorrectly counts the note as unorganized
    if (noteStaysInUnorganized) {
      debug('[api/notes/create] Updating unorganized thread timestamp');
      await db.update(Threads)
        .set({ updatedAt: new Date() })
        .where(and(eq(Threads.id, finalThreadId), eq(Threads.userId, userId)));
    }

    // NON-CRITICAL OPERATIONS (can fail without affecting note creation)
    // These are best-effort and won't cause the note creation to fail
    
    // Award XP for note creation (pass content and note type)
    // This is non-critical - if it fails, the note is still created
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

    // Auto-generate and apply tags (async, fire-and-forget)
    // For resource notes, this runs after content extraction below
    if (finalNoteType !== 'resource') {
      const autoTagAsync = async () => {
        try {
          if (!generateAutoTags || !applyAutoTags) return;
          const autoTagResult = await generateAutoTags(
            capitalizedTitle || '',
            capitalizedContent,
            userId,
            0.8
          );
          if (autoTagResult.suggestions.length > 0) {
            await applyAutoTags(newNote.id, autoTagResult.suggestions, userId);
          }
        } catch (error: unknown) {
          console.error('Auto-tagging failed (non-critical):', error);
        }
      };
      autoTagAsync().catch(() => {});
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
    if (finalNoteType === 'resource' && validatedResourceUrl) {
      try {
        // Use validated normalized URL (already validated above)
        const normalizedResourceUrl = validatedResourceUrl;
        
        // Use pre-fetched metadata for title/description/image/siteName
        let resourceMetadata: { title?: string; description?: string; image?: string; articleContent?: string; siteName?: string } | null = {
          ...prefetchedResourceMetadata
        };
        
        // Extract full article content directly (avoid internal HTTP call which has auth issues)
        // Skip extraction for PDFs to prevent garbled OCR-like content from being saved
        if (!isPDF) {
          try {
            const htmlResponse = await fetch(normalizedResourceUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; HarvousBot/1.0; +https://harvous.com)',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
              },
              signal: AbortSignal.timeout(15000) // 15 second timeout
            });
            
            if (htmlResponse.ok) {
              const html = await htmlResponse.text();
              
              // Extract article content using @extractus/article-extractor (with Readability fallback)
              const articleContent = await extractArticleContent(html, normalizedResourceUrl);
              
              if (articleContent) {
                resourceMetadata = {
                  ...resourceMetadata,
                  articleContent
                };
              }
            }
          } catch (error) {
            // Non-critical - note will still be created with description
            console.error('Error extracting article content:', error);
          }
        }

        // Create ResourceMetadata record
        const resourceMetadataRecord = {
          id: `resource_${newNote.id}_${Date.now()}`,
          noteId: newNote.id,
          sourceUrl: normalizedResourceUrl,
          sourceDomain: extractDomain(normalizedResourceUrl),
          sourceName: resourceMetadata?.siteName || null,
          sourceTitle: resourceMetadata?.title || null,
          sourceDescription: resourceMetadata?.description || null,
          sourceImage: resourceMetadata?.image || null,
          createdAt: new Date()
        };
        
        await db.insert(ResourceMetadata).values(resourceMetadataRecord);

        // Update note with metadata if available
        // For resource notes, use metadata title and extracted article content (or fallback to description)
        if (resourceMetadata) {
          const updateData: { title?: string; content?: string; updatedAt: Date } = {
            updatedAt: new Date()
          };
          
          // Set title from metadata (truncate auto-generated titles)
          if (resourceMetadata.title) {
            updateData.title = truncateAndCapitalizeTitle(resourceMetadata.title);
          }
          
          // Prefer extracted article content, fallback to description for scripture detection
          if (resourceMetadata.articleContent) {
            updateData.content = resourceMetadata.articleContent;
          } else if (resourceMetadata.description) {
            updateData.content = resourceMetadata.description;
          }
          
          if (updateData.title || updateData.content) {
            await db.update(Notes)
              .set(updateData)
              .where(eq(Notes.id, newNote.id));

            // Reload note to get updated values
            const updatedNote = await db.select()
              .from(Notes)
              .where(eq(Notes.id, newNote.id))
              .get();
            
            if (updatedNote) {
              Object.assign(newNote, updatedNote);
              if (updateData.title) {
                capitalizedTitle = updateData.title;
              }
            }
          }
          
          // Auto-generate and apply tags based on extracted content
          // This runs after content is extracted so tags are based on the full article content
          try {
            // Check if auto-tag functions are available
            if (!generateAutoTags || !applyAutoTags) {
              throw new Error('Auto-tag functions not available');
            }
            
            // Use the updated content for tag generation
            const contentForTagging = updateData.content || newNote.content || '';
            const titleForTagging = updateData.title || capitalizedTitle || '';
            
            // Generate auto-tag suggestions based on extracted content (80% confidence threshold)
            const autoTagResult = await generateAutoTags(
              titleForTagging,
              contentForTagging,
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
            console.error('Auto-tagging failed for resource note (non-critical):', error);
          }
        }
      } catch (error: any) {
        // Don't fail note creation if ResourceMetadata creation fails
        console.error('Error creating ResourceMetadata (non-critical):', error);
      }
    }

    // Process scripture references in the note content (async, fire-and-forget for all note types)
    // This allows the frontend to redirect immediately while scripture notes are created in the background
    const processScriptureReferencesAsync = async () => {
      try {
        const actualThreadId = threadId && threadId !== 'thread_unorganized' ? threadId : 'thread_unorganized';

        // For resource notes, get latest content (may have been updated with articleContent)
        const latestNote = finalNoteType === 'resource'
          ? await db.select().from(Notes).where(eq(Notes.id, newNote.id)).get()
          : null;
        const contentToProcess = latestNote?.content || newNote.content;

        const { processScriptureReferences } = await import('@/utils/process-scripture-references');
        await processScriptureReferences(newNote.id, userId, actualThreadId, contentToProcess);
      } catch (error: any) {
        console.error('Error processing scripture references (non-critical):', error);
      }
    };

    // Start async processing (fire-and-forget)
    processScriptureReferencesAsync().catch(() => {});

    // Return response immediately
    return successResponse({
      success: "Note created!",
      note: newNote,
      scriptureResults: []
    });

  } catch (error: any) {
    // Log the actual error for debugging
    console.error('[api/notes/create] Error creating note:', error);
    console.error('[api/notes/create] Error stack:', error?.stack);
    console.error('[api/notes/create] Error details:', {
      message: error?.message,
      name: error?.name,
      code: error?.code
    });
    
    return serverErrorResponse(error, {
      endpoint: '/api/notes/create',
      action: 'create_note'
    });
  }
};
