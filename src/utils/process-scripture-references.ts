/**
 * Shared utility function to process scripture references in a note
 * Can be called directly from API routes or other server-side code
 */

import { db, Notes, UserMetadata, NoteThreads, ScriptureMetadata, NoteScriptureReferences, Threads, eq, and, desc, isNotNull, count, ne } from 'astro:db';
import { detectScriptureReferences, normalizeScriptureReference } from '@/utils/scripture-detector';
import { highlightScriptureReferences } from '@/utils/scripture-highlighter';
import { parseScriptureReference } from '@/utils/scripture-detector';
import { generateNoteId } from '@/utils/ids';
import { awardNoteCreatedXP } from '@/utils/xp-system';
import { generateAutoTags, applyAutoTags } from '@/utils/auto-tag-generator';

export interface ProcessingResult {
  action: 'created' | 'added' | 'unorganized' | 'skipped';
  noteId: string;
  reference: string;
}

export async function processScriptureReferences(
  noteId: string,
  userId: string,
  threadId?: string,
  contentOverride?: string // Optional: use this content instead of reading from DB
): Promise<{ results: ProcessingResult[]; updatedContent: string }> {
  // Get the note from database
  const note = await db.select()
    .from(Notes)
    .where(and(eq(Notes.id, noteId), eq(Notes.userId, userId)))
    .get();

  if (!note) {
    throw new Error('Note not found');
  }

  // Use provided content or note content
  const noteContent = contentOverride || note.content;

  // Determine the actual thread ID (use provided threadId or check NoteThreads)
  let actualThreadId = threadId || 'thread_unorganized';
  
  if (!threadId) {
    // Check if note is in a specific thread via junction table
    const threadRelation = await db.select()
      .from(NoteThreads)
      .where(eq(NoteThreads.noteId, noteId))
      .limit(1)
      .get();
    
    if (threadRelation) {
      actualThreadId = threadRelation.threadId;
    }
  }

  // Extract existing scripture references from the content (already processed)
  // This helps us track which references were already in the note
  // Use two patterns to handle different attribute orders (Tiptap may serialize attributes in varying order)
  const existingReferences = new Map<string, string>(); // normalizedReference -> noteId
  
  // Pattern 1: data-scripture-reference comes before data-note-id
  const pillPattern1 = /<span[^>]*data-scripture-reference\s*=\s*["']([^"']+)["'][^>]*data-note-id\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let match;
  while ((match = pillPattern1.exec(noteContent)) !== null) {
    const reference = match[1];
    const pillNoteId = match[2];
    const normalizedRef = normalizeScriptureReference(reference);
    existingReferences.set(normalizedRef, pillNoteId);
  }
  
  // Pattern 2: data-note-id comes before data-scripture-reference
  const pillPattern2 = /<span[^>]*data-note-id\s*=\s*["']([^"']+)["'][^>]*data-scripture-reference\s*=\s*["']([^"']+)["'][^>]*>/gi;
  while ((match = pillPattern2.exec(noteContent)) !== null) {
    const pillNoteId = match[1];
    const reference = match[2];
    const normalizedRef = normalizeScriptureReference(reference);
    // Only add if not already found by pattern 1
    if (!existingReferences.has(normalizedRef)) {
      existingReferences.set(normalizedRef, pillNoteId);
    }
  }
  
  // Pattern 3: Also match spans with scripture-pill class (alternative format)
  const pillPattern3 = /<span[^>]*class\s*=\s*["'][^"']*scripture-pill[^"']*["'][^>]*data-scripture-reference\s*=\s*["']([^"']+)["'][^>]*data-note-id\s*=\s*["']([^"']+)["'][^>]*>/gi;
  while ((match = pillPattern3.exec(noteContent)) !== null) {
    const reference = match[1];
    const pillNoteId = match[2];
    const normalizedRef = normalizeScriptureReference(reference);
    if (!existingReferences.has(normalizedRef)) {
      existingReferences.set(normalizedRef, pillNoteId);
    }
  }
  
  // Pattern 4: Match note-link spans that contain scripture references (legacy format)
  // These have data-note-id but are missing data-scripture-reference
  // Format: <span data-note-id="..." class="note-link" ...>SCRIPTURE TEXT</span>
  const noteLinkPattern = /<span[^>]*data-note-id\s*=\s*["']([^"']+)["'][^>]*class\s*=\s*["'][^"']*note-link[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi;
  while ((match = noteLinkPattern.exec(noteContent)) !== null) {
    const pillNoteId = match[1];
    // Extract plain text from the inner content (remove any nested HTML like <strong>)
    const innerContent = match[2].replace(/<[^>]*>/g, '').trim();
    // Check if this inner text looks like a scripture reference
    const innerRefs = detectScriptureReferences(innerContent);
    if (innerRefs.length > 0) {
      const normalizedRef = normalizeScriptureReference(innerRefs[0].reference);
      if (!existingReferences.has(normalizedRef)) {
        existingReferences.set(normalizedRef, pillNoteId);
      }
    }
  }
  
  // Pattern 5: Also match note-link with reversed attribute order
  const noteLinkPattern2 = /<span[^>]*class\s*=\s*["'][^"']*note-link[^"']*["'][^>]*data-note-id\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/span>/gi;
  while ((match = noteLinkPattern2.exec(noteContent)) !== null) {
    const pillNoteId = match[1];
    const innerContent = match[2].replace(/<[^>]*>/g, '').trim();
    const innerRefs = detectScriptureReferences(innerContent);
    if (innerRefs.length > 0) {
      const normalizedRef = normalizeScriptureReference(innerRefs[0].reference);
      if (!existingReferences.has(normalizedRef)) {
        existingReferences.set(normalizedRef, pillNoteId);
      }
    }
  }

  // Extract plain text from HTML content for detection
  // Preserve existing scripture pills by extracting their text content
  // This regex removes HTML tags but keeps text inside scripture pills
  const plainText = noteContent
    .replace(/<span[^>]*data-scripture-reference[^>]*>([\s\S]*?)<\/span>/gi, '$1') // Extract text from existing pills (handles nested HTML)
    .replace(/<[^>]*>/g, ' ') // Remove remaining HTML tags
    .replace(/\s+/g, ' ')
    .trim();
  
  // Detect all scripture references in the content
  const detectedReferences = detectScriptureReferences(plainText);

  if (detectedReferences.length === 0) {
    return {
      results: [],
      updatedContent: note.content
    };
  }

  const results: ProcessingResult[] = [];
  const referenceMap: Map<string, string> = new Map(); // reference -> noteId

  // Process each detected reference
  for (const detectedRef of detectedReferences) {
    const reference = detectedRef.reference;
    // Normalize the reference for consistent storage and comparison
    const normalizedReference = normalizeScriptureReference(reference);
    
    // Check if this reference was already in the note (skip if it was)
    if (existingReferences.has(normalizedReference)) {
      // Already exists - skip processing but add to referenceMap for highlighting
      const existingNoteId = existingReferences.get(normalizedReference)!;
      referenceMap.set(reference, existingNoteId);
      continue; // Skip processing, don't add to results
    }
    
    try {
      // Check if scripture note exists (direct database query)
      // Try exact match first with normalized reference
      let existingScripture = await db.select({
        noteId: ScriptureMetadata.noteId,
        reference: ScriptureMetadata.reference
      })
        .from(ScriptureMetadata)
        .innerJoin(Notes, eq(ScriptureMetadata.noteId, Notes.id))
        .where(
          and(
            eq(ScriptureMetadata.reference, normalizedReference),
            eq(Notes.userId, userId)
          )
        )
        .limit(1)
        .get();

      // If no exact match, try to find by normalizing stored references
      // This handles legacy references that might not be normalized
      if (!existingScripture) {
        const allUserScripture = await db.select({
          noteId: ScriptureMetadata.noteId,
          reference: ScriptureMetadata.reference
        })
          .from(ScriptureMetadata)
          .innerJoin(Notes, eq(ScriptureMetadata.noteId, Notes.id))
          .where(eq(Notes.userId, userId))
          .all();

        // Find matching reference by normalizing each stored reference
        for (const scripture of allUserScripture) {
          const normalizedStored = normalizeScriptureReference(scripture.reference);
          if (normalizedStored === normalizedReference) {
            existingScripture = scripture;
            break;
          }
        }
      }

      if (!existingScripture) {
        // New scripture - create it
        try {
          // Fetch verse text from Bible.org API with superscript formatting
          let verseText = '';
          try {
            const apiUrl = `https://labs.bible.org/api/?passage=${encodeURIComponent(reference)}&formatting=plain&type=json`;
            const verseResponse = await fetch(apiUrl);
            if (verseResponse.ok) {
              const verses = await verseResponse.json();
              // Format verse text with superscript verse numbers
              if (Array.isArray(verses) && verses.length > 0) {
                verseText = verses.map((v: any) => `<sup>${v.verse}</sup>${v.text}`).join(' ');
              }
            }
          } catch (verseError) {
            console.error(`Error fetching verse for ${reference}:`, verseError);
          }

          // Get user metadata for simpleNoteId
          let userMetadata = await db.select()
            .from(UserMetadata)
            .where(eq(UserMetadata.userId, userId))
            .get();
          
          if (!userMetadata) {
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
            
            await db.insert(UserMetadata).values({
              id: `user_metadata_${userId}`,
              userId: userId,
              highestSimpleNoteId: highestExistingId,
              userColor: 'paper',
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
          
          const nextSimpleNoteId = (userMetadata?.highestSimpleNoteId || 0) + 1;
          const capitalizedContent = (verseText || reference).charAt(0).toUpperCase() + (verseText || reference).slice(1);
          const capitalizedTitle = reference.charAt(0).toUpperCase() + reference.slice(1);

          // Create scripture note
          const { ensureUnorganizedThread } = await import('@/utils/unorganized-thread');
          await ensureUnorganizedThread(userId);
          
          const scriptureNote = await db.insert(Notes)
            .values({ 
              id: generateNoteId(),
              content: capitalizedContent, 
              title: capitalizedTitle, 
              threadId: 'thread_unorganized',
              spaceId: null,
              simpleNoteId: nextSimpleNoteId,
              noteType: 'scripture',
              userId, 
              isPublic: false,
              addedBy: 'harvous',
              createdAt: new Date() 
            })
            .returning()
            .get();

          // Update user metadata
          await db.update(UserMetadata)
            .set({ 
              highestSimpleNoteId: nextSimpleNoteId,
              updatedAt: new Date()
            })
            .where(eq(UserMetadata.userId, userId));

          // Create ScriptureMetadata
          const parsed = parseScriptureReference(normalizedReference);
          if (parsed) {
            const verseStart = Array.isArray(parsed.verse) ? parsed.verse[0] : parsed.verse;
            const verseEnd = Array.isArray(parsed.verse) ? parsed.verse[1] : undefined;

            await db.insert(ScriptureMetadata).values({
              id: `scripture_${scriptureNote.id}_${Date.now()}`,
              noteId: scriptureNote.id,
              reference: normalizedReference, // Store normalized reference
              book: parsed.book,
              chapter: parsed.chapter,
              verse: verseStart,
              verseEnd: verseEnd || null,
              translation: 'NET',
              originalText: capitalizedContent,
              createdAt: new Date()
            });
          }

          // Award XP (scripture notes get 3 XP and are exempt from rate/content checks)
          await awardNoteCreatedXP(userId, scriptureNote.id, true, capitalizedContent);

          // Auto-generate and apply tags based on note content
          try {
            // Generate auto-tag suggestions based on note content (80% confidence threshold)
            const autoTagResult = await generateAutoTags(
              capitalizedTitle || '',
              capitalizedContent,
              userId,
              0.8 // Generate high-confidence tags
            );
            
            // Apply the auto-generated tags if any were found
            if (autoTagResult.suggestions.length > 0) {
              await applyAutoTags(
                scriptureNote.id,
                autoTagResult.suggestions,
                userId
              );
            }
          } catch (error: unknown) {
            // Don't fail note creation if auto-tagging fails
            console.error('Auto-tagging failed for scripture note (non-critical):', error);
          }

          // If not unorganized, add to thread
          if (actualThreadId !== 'thread_unorganized') {
            try {
              await db.insert(NoteThreads).values({
                id: `note-thread-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                noteId: scriptureNote.id,
                threadId: actualThreadId,
                createdAt: new Date()
              });
            } catch (error) {
              // Ignore if already exists
            }
          }

          referenceMap.set(reference, scriptureNote.id);
          
          // Create junction entry linking this note to the new scripture note
          try {
            await db.insert(NoteScriptureReferences).values({
              id: `note-scripture-${noteId}-${scriptureNote.id}-${Date.now()}`,
              noteId: noteId, // The note containing the reference
              scriptureNoteId: scriptureNote.id, // The scripture note being referenced
              createdAt: new Date()
            });
          } catch (junctionError) {
            // Ignore if already exists
          }
          
          results.push({
            action: 'created',
            noteId: scriptureNote.id,
            reference
          });
        } catch (error) {
          console.error(`Error creating scripture note for ${reference}:`, error);
        }
      } else {
        // Scripture exists
        const existingNoteId = existingScripture.noteId;
        referenceMap.set(reference, existingNoteId);

        // Create junction entry linking this note to the scripture note (if not already exists)
        try {
          const existingJunction = await db.select()
            .from(NoteScriptureReferences)
            .where(
              and(
                eq(NoteScriptureReferences.noteId, noteId),
                eq(NoteScriptureReferences.scriptureNoteId, existingNoteId)
              )
            )
            .limit(1)
            .get();
          
          if (!existingJunction) {
            await db.insert(NoteScriptureReferences).values({
              id: `note-scripture-${noteId}-${existingNoteId}-${Date.now()}`,
              noteId: noteId, // The note containing the reference
              scriptureNoteId: existingNoteId, // The scripture note being referenced
              createdAt: new Date()
            });
          }
        } catch (junctionError) {
          // Ignore junction entry errors - non-critical
        }

        // Check if in thread
        let inThread = false;
        if (actualThreadId) {
          const threadRelation = await db.select()
            .from(NoteThreads)
            .where(
              and(
                eq(NoteThreads.noteId, existingNoteId),
                eq(NoteThreads.threadId, actualThreadId)
              )
            )
            .limit(1)
            .get();
          
          inThread = !!threadRelation;
        }

        // Check if in unorganized
        const threadCount = await db.select({ count: count() })
          .from(NoteThreads)
          .where(eq(NoteThreads.noteId, existingNoteId))
          .get();
        
        const inUnorganized = !threadCount || threadCount.count === 0;

        if (inThread) {
          // Already in thread - skip
          results.push({
            action: 'skipped',
            noteId: existingNoteId,
            reference
          });
        } else if (actualThreadId !== 'thread_unorganized') {
          // Target is a specific thread - add the scripture note to it
          // This handles both: notes in unorganized and notes in other threads
          try {
            await db.insert(NoteThreads).values({
              id: `note-thread-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              noteId: existingNoteId,
              threadId: actualThreadId,
              createdAt: new Date()
            });

            // If note was in unorganized, update the legacy threadId field to remove it from unorganized
            if (inUnorganized) {
              await db.update(Notes)
                .set({ threadId: actualThreadId })
                .where(eq(Notes.id, existingNoteId));
            }

            // Update the target thread's timestamp
            await db.update(Threads)
              .set({ updatedAt: new Date() })
              .where(and(eq(Threads.id, actualThreadId), eq(Threads.userId, userId)));

            results.push({
              action: 'added',
              noteId: existingNoteId,
              reference
            });
          } catch (error) {
            // Already exists - skip
            results.push({
              action: 'skipped',
              noteId: existingNoteId,
              reference
            });
          }
        } else {
          // Target thread is unorganized - don't add, just mark as unorganized
          results.push({
            action: 'unorganized',
            noteId: existingNoteId,
            reference
          });
        }
      }
    } catch (error) {
      console.error(`Error processing scripture reference ${reference}:`, error);
    }
  }

  // Update note content with highlighted references
  // Use the provided content (which may already have pills) as the base
  // Include both new references and existing ones for highlighting
  const referencesForHighlighting = Array.from(referenceMap.entries()).map(([reference, noteId]) => ({
    reference,
    noteId
  }));
  
  // Also add existing references to the map so they're preserved
  for (const [normalizedRef, existingScriptureNoteId] of existingReferences.entries()) {
    // Find the original reference format from detected references
    const matchingRef = detectedReferences.find(d => normalizeScriptureReference(d.reference) === normalizedRef);
    if (matchingRef && !referenceMap.has(matchingRef.reference)) {
      referenceMap.set(matchingRef.reference, existingScriptureNoteId);
      referencesForHighlighting.push({ reference: matchingRef.reference, noteId: existingScriptureNoteId });
    }
    
    // Ensure junction entry exists for existing references too
    try {
      const existingJunction = await db.select()
        .from(NoteScriptureReferences)
        .where(
          and(
            eq(NoteScriptureReferences.noteId, noteId),
            eq(NoteScriptureReferences.scriptureNoteId, existingScriptureNoteId)
          )
        )
        .limit(1)
        .get();
      
      if (!existingJunction) {
        await db.insert(NoteScriptureReferences).values({
          id: `note-scripture-${noteId}-${existingScriptureNoteId}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          noteId: noteId,
          scriptureNoteId: existingScriptureNoteId,
          createdAt: new Date()
        });
      }
    } catch (junctionError) {
      // Ignore junction entry errors - non-critical
    }
  }

  const updatedContent = highlightScriptureReferences(noteContent, referencesForHighlighting);

  // Always update note in database with properly highlighted content
  // This ensures scripture pills always have correct class and data attributes
  // even if Tiptap's getHTML output was missing some attributes
  await db.update(Notes)
    .set({ 
      content: updatedContent,
      updatedAt: new Date()
    })
    .where(eq(Notes.id, noteId));

  return {
    results,
    updatedContent
  };
}

