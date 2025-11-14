/**
 * Shared utility function to process scripture references in a note
 * Can be called directly from API routes or other server-side code
 */

import { db, Notes, UserMetadata, NoteThreads, ScriptureMetadata, Threads, eq, and, desc, isNotNull, count } from 'astro:db';
import { detectScriptureReferences, normalizeScriptureReference } from '@/utils/scripture-detector';
import { highlightScriptureReferences } from '@/utils/scripture-highlighter';
import { parseScriptureReference } from '@/utils/scripture-detector';
import { generateNoteId } from '@/utils/ids';
import { awardNoteCreatedXP } from '@/utils/xp-system';

export interface ProcessingResult {
  action: 'created' | 'added' | 'unorganized' | 'skipped';
  noteId: string;
  reference: string;
}

export async function processScriptureReferences(
  noteId: string,
  userId: string,
  threadId?: string
): Promise<{ results: ProcessingResult[]; updatedContent: string }> {
  // Get the note from database
  const note = await db.select()
    .from(Notes)
    .where(and(eq(Notes.id, noteId), eq(Notes.userId, userId)))
    .get();

  if (!note) {
    throw new Error('Note not found');
  }

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

  // Extract plain text from HTML content for detection
  const plainText = note.content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  
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
          // Fetch verse text from Bible.org API
          let verseText = '';
          try {
            const apiUrl = `https://labs.bible.org/api/?passage=${encodeURIComponent(reference)}&formatting=plain&type=json`;
            const verseResponse = await fetch(apiUrl);
            if (verseResponse.ok) {
              const verses = await verseResponse.json();
              verseText = Array.isArray(verses) ? verses.map((v: any) => v.text).join(' ') : '';
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

          // Award XP
          await awardNoteCreatedXP(userId, scriptureNote.id);

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
  const referencesForHighlighting = Array.from(referenceMap.entries()).map(([reference, noteId]) => ({
    reference,
    noteId
  }));

  const updatedContent = highlightScriptureReferences(note.content, referencesForHighlighting);

  // Update note in database if content changed
  if (updatedContent !== note.content) {
    await db.update(Notes)
      .set({ 
        content: updatedContent,
        updatedAt: new Date()
      })
      .where(eq(Notes.id, noteId));
  }

  return {
    results,
    updatedContent
  };
}

