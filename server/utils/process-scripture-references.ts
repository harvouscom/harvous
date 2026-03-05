/**
 * Shared utility function to process scripture references in a note
 * Can be called directly from API routes or other server-side code
 */

import { db, Notes, UserMetadata, NoteThreads, ScriptureMetadata, NoteScriptureReferences, Threads, eq, and, desc, isNotNull, count, ne } from '../db';
import { getEffectiveHighestSimpleNoteId } from './highest-simple-note-id';
import { detectScriptureReferences, normalizeScriptureReference, parseScriptureReference } from '@/utils/scripture-detector';
import { highlightScriptureReferences } from '@/utils/scripture-highlighter';
import { generateNoteId, generateShareToken } from '@/utils/ids';
import { getCurrentSeason } from '@/utils/season-helpers';
import { awardNoteCreatedXP } from './xp-system';
import { generateAutoTags, applyAutoTags } from './auto-tag-generator';
import { fetchVerseText } from './fetch-verse-text';

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
  // Use let instead of const so we can update it when fixing pasted pill noteIds
  let noteContent = contentOverride || note.content;

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
  const pendingPills = new Map<string, { reference: string; fullMatch: string; startIndex: number }>(); // normalizedReference -> pill info

  // Pattern 1: data-scripture-reference comes before data-note-id
  const pillPattern1 = /<span[^>]*data-scripture-reference\s*=\s*["']([^"']+)["'][^>]*data-note-id\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let match;
  while ((match = pillPattern1.exec(noteContent)) !== null) {
    const reference = match[1];
    const pillNoteId = match[2];

    // Only treat as an existing reference if it has a real note ID (not "pending")
    if (pillNoteId && pillNoteId !== 'pending' && pillNoteId !== 'null' && pillNoteId !== '') {
      const normalizedRef = normalizeScriptureReference(reference);
      existingReferences.set(normalizedRef, pillNoteId);
    }
  }

  // Pattern 2: data-note-id comes before data-scripture-reference
  const pillPattern2 = /<span[^>]*data-note-id\s*=\s*["']([^"']+)["'][^>]*data-scripture-reference\s*=\s*["']([^"']+)["'][^>]*>/gi;
  while ((match = pillPattern2.exec(noteContent)) !== null) {
    const pillNoteId = match[1];
    const reference = match[2];

    // Only treat as an existing reference if it has a real note ID (not "pending")
    if (pillNoteId && pillNoteId !== 'pending' && pillNoteId !== 'null' && pillNoteId !== '') {
      const normalizedRef = normalizeScriptureReference(reference);
      // Only add if not already found by pattern 1
      if (!existingReferences.has(normalizedRef)) {
        existingReferences.set(normalizedRef, pillNoteId);
      }
    }
  }

  // Pattern for pending pills: pills with data-scripture-reference and either:
  // 1. NO data-note-id attribute at all, OR
  // 2. data-note-id="pending" (created during real-time detection)
  // These are pills that haven't been saved yet and need scripture notes created
  const pendingPillPattern = /<span[^>]*data-scripture-reference\s*=\s*["']([^"']+)["'][^>]*>/gi;
  while ((match = pendingPillPattern.exec(noteContent)) !== null) {
    const fullMatch = match[0];
    const reference = match[1];

    // Check if this span has a REAL data-note-id attribute (not "pending")
    // Pills with data-note-id="pending" should be treated as pending pills
    const noteIdMatch = fullMatch.match(/data-note-id\s*=\s*["']([^"']+)["']/);
    if (noteIdMatch) {
      const noteIdValue = noteIdMatch[1];
      // Skip if it has a real noteId (not "pending", not empty, not null)
      if (noteIdValue && noteIdValue !== 'pending' && noteIdValue !== 'null' && noteIdValue !== '') {
        continue; // Skip - this pill already has a real noteId
      }
    }

    const normalizedRef = normalizeScriptureReference(reference);
    // Only track if not already in existingReferences (has noteId) and not already in pendingPills
    if (!existingReferences.has(normalizedRef) && !pendingPills.has(normalizedRef)) {
      pendingPills.set(normalizedRef, {
        reference: match[1],
        fullMatch: match[0],
        startIndex: match.index || 0
      });
    }
  }

  // Pattern 3: Also match spans with scripture-pill class (alternative format)
  const pillPattern3 = /<span[^>]*class\s*=\s*["'][^"']*scripture-pill[^"']*["'][^>]*data-scripture-reference\s*=\s*["']([^"']+)["'][^>]*data-note-id\s*=\s*["']([^"']+)["'][^>]*>/gi;
  while ((match = pillPattern3.exec(noteContent)) !== null) {
    const reference = match[1];
    const pillNoteId = match[2];

    // Only treat as an existing reference if it has a real note ID (not "pending")
    if (pillNoteId && pillNoteId !== 'pending' && pillNoteId !== 'null' && pillNoteId !== '') {
      const normalizedRef = normalizeScriptureReference(reference);
      if (!existingReferences.has(normalizedRef)) {
        existingReferences.set(normalizedRef, pillNoteId);
      }
    }
  }

  // Pattern 4: Match note-link spans that contain scripture references (legacy format)
  // These have data-note-id but are missing data-scripture-reference
  // Format: <span data-note-id="..." class="note-link" ...>SCRIPTURE TEXT</span>
  const noteLinkPattern = /<span[^>]*data-note-id\s*=\s*["']([^"']+)["'][^>]*class\s*=\s*["'][^"']*note-link[^"']*["'][^>]*>([\s\S]*?)<\/span>/gi;
  while ((match = noteLinkPattern.exec(noteContent)) !== null) {
    const pillNoteId = match[1];

    // Only treat as an existing reference if it has a real note ID (not "pending")
    if (pillNoteId && pillNoteId !== 'pending' && pillNoteId !== 'null' && pillNoteId !== '') {
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
  }

  // Pattern 5: Also match note-link with reversed attribute order
  const noteLinkPattern2 = /<span[^>]*class\s*=\s*["'][^"']*note-link[^"']*["'][^>]*data-note-id\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/span>/gi;
  while ((match = noteLinkPattern2.exec(noteContent)) !== null) {
    const pillNoteId = match[1];

    // Only treat as an existing reference if it has a real note ID (not "pending")
    if (pillNoteId && pillNoteId !== 'pending' && pillNoteId !== 'null' && pillNoteId !== '') {
      const innerContent = match[2].replace(/<[^>]*>/g, '').trim();
      const innerRefs = detectScriptureReferences(innerContent);
      if (innerRefs.length > 0) {
        const normalizedRef = normalizeScriptureReference(innerRefs[0].reference);
        if (!existingReferences.has(normalizedRef)) {
          existingReferences.set(normalizedRef, pillNoteId);
        }
      }
    }
  }

  // Pattern 6: Tiptap may output class/style first - span with class then data-scripture-reference then data-note-id
  const pillPattern6 = /<span[^>]*class\s*=\s*["'][^"']*["'][^>]*data-scripture-reference\s*=\s*["']([^"']+)["'][^>]*data-note-id\s*=\s*["']([^"']+)["'][^>]*>/gi;
  while ((match = pillPattern6.exec(noteContent)) !== null) {
    const reference = match[1];
    const pillNoteId = match[2];
    if (pillNoteId && pillNoteId !== 'pending' && pillNoteId !== 'null' && pillNoteId !== '') {
      const normalizedRef = normalizeScriptureReference(reference);
      if (!existingReferences.has(normalizedRef)) {
        existingReferences.set(normalizedRef, pillNoteId);
      }
    }
  }

  // Pattern 7: Same as 6 but data-note-id before data-scripture-reference (class first)
  const pillPattern7 = /<span[^>]*class\s*=\s*["'][^"']*["'][^>]*data-note-id\s*=\s*["']([^"']+)["'][^>]*data-scripture-reference\s*=\s*["']([^"']+)["'][^>]*>/gi;
  while ((match = pillPattern7.exec(noteContent)) !== null) {
    const pillNoteId = match[1];
    const reference = match[2];
    if (pillNoteId && pillNoteId !== 'pending' && pillNoteId !== 'null' && pillNoteId !== '') {
      const normalizedRef = normalizeScriptureReference(reference);
      if (!existingReferences.has(normalizedRef)) {
        existingReferences.set(normalizedRef, pillNoteId);
      }
    }
  }

  // Pattern 8: Pills with style attribute (no class) - data attrs in either order
  const pillPattern8 = /<span[^>]*style\s*=\s*["'][^"']*["'][^>]*data-scripture-reference\s*=\s*["']([^"']+)["'][^>]*data-note-id\s*=\s*["']([^"']+)["'][^>]*>/gi;
  while ((match = pillPattern8.exec(noteContent)) !== null) {
    const reference = match[1];
    const pillNoteId = match[2];
    if (pillNoteId && pillNoteId !== 'pending' && pillNoteId !== 'null' && pillNoteId !== '') {
      const normalizedRef = normalizeScriptureReference(reference);
      if (!existingReferences.has(normalizedRef)) {
        existingReferences.set(normalizedRef, pillNoteId);
      }
    }
  }

  const pillPattern9 = /<span[^>]*style\s*=\s*["'][^"']*["'][^>]*data-note-id\s*=\s*["']([^"']+)["'][^>]*data-scripture-reference\s*=\s*["']([^"']+)["'][^>]*>/gi;
  while ((match = pillPattern9.exec(noteContent)) !== null) {
    const pillNoteId = match[1];
    const reference = match[2];
    if (pillNoteId && pillNoteId !== 'pending' && pillNoteId !== 'null' && pillNoteId !== '') {
      const normalizedRef = normalizeScriptureReference(reference);
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
  console.log('[processScriptureReferences] Detection', {
    noteId,
    plainTextLength: plainText.length,
    detectedCount: detectedReferences.length,
    firstRef: detectedReferences[0]?.reference ?? null
  });

  const results: ProcessingResult[] = [];
  const referenceMap: Map<string, string> = new Map(); // reference -> noteId

  // OPTIMIZATION: Batch fetch all user scripture notes once at the start
  // This prevents N+1 query problem when processing multiple references
  // Duplicate detection: we match by normalized reference so the same verse (e.g. "John 3:16" / "Jn 3:16") links to one scripture note.
  const normalizedScriptureMap = new Map<string, { noteId: string; reference: string }>();

  // Fetch all user scripture notes once (before the loop)
  const allUserScripture = await db.select({
    noteId: ScriptureMetadata.noteId,
    reference: ScriptureMetadata.reference
  })
    .from(ScriptureMetadata)
    .innerJoin(Notes, eq(ScriptureMetadata.noteId, Notes.id))
    .where(eq(Notes.userId, userId))
    .all();

  // Build normalized lookup map: normalizedReference -> { noteId, reference }
  for (const scripture of allUserScripture) {
    const normalizedStored = normalizeScriptureReference(scripture.reference);
    // Store both the normalized reference and the original reference
    // This allows us to match by normalized reference but preserve original format
    if (!normalizedScriptureMap.has(normalizedStored)) {
      normalizedScriptureMap.set(normalizedStored, {
        noteId: scripture.noteId,
        reference: scripture.reference
      });
    }
  }

  // Track references processed in this run to prevent duplicates
  const processedReferences = new Set<string>();

  // Process each detected reference (skip when content has only pills - junction creation happens below)
  for (const detectedRef of detectedReferences) {
    const reference = detectedRef.reference;
    // Normalize the reference for consistent storage and comparison
    const normalizedReference = normalizeScriptureReference(reference);

    // Skip if already processed in this run
    if (processedReferences.has(normalizedReference)) {
      continue;
    }
    processedReferences.add(normalizedReference);

    // Check if this reference was already in the note (skip if it was)
    if (existingReferences.has(normalizedReference)) {
      // Already exists - skip processing but add to referenceMap for highlighting
      const existingNoteId = existingReferences.get(normalizedReference)!;
      referenceMap.set(reference, existingNoteId);
      continue; // Skip processing, don't add to results
    }

    try {
      // Check if scripture note exists: use normalized map (handles exact and legacy format variants)
      let existingScripture = normalizedScriptureMap.get(normalizedReference)
        ? { noteId: normalizedScriptureMap.get(normalizedReference)!.noteId, reference: normalizedScriptureMap.get(normalizedReference)!.reference }
        : null;

      // Double-check right before create to avoid duplicate from concurrent requests (e.g. reprocess-on-view firing twice)
      if (!existingScripture) {
        const freshCheck = await db.select({
          noteId: ScriptureMetadata.noteId,
          reference: ScriptureMetadata.reference
        })
          .from(ScriptureMetadata)
          .innerJoin(Notes, eq(ScriptureMetadata.noteId, Notes.id))
          .where(eq(Notes.userId, userId))
          .all();
        for (const row of freshCheck) {
          if (normalizeScriptureReference(row.reference) === normalizedReference) {
            existingScripture = { noteId: row.noteId, reference: row.reference };
            normalizedScriptureMap.set(normalizedReference, { noteId: row.noteId, reference: row.reference });
            break;
          }
        }
      }

      if (!existingScripture) {
        // New scripture - create it
        try {
          // Fetch verse text via shared helper (normalized reference for consistent results)
          const verseText = await fetchVerseText(normalizedReference);

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

            const season = getCurrentSeason();
            await db.insert(UserMetadata).values({
              id: `user_metadata_${userId}`,
              userId: userId,
              highestSimpleNoteId: highestExistingId,
              userColor: 'blue',
              currentSeason: season,
              createdAt: new Date().toISOString()
            });
            userMetadata = {
              id: `user_metadata_${userId}`,
              userId: userId,
              highestSimpleNoteId: highestExistingId,
              userColor: 'blue',
              email: null,
              firstName: null,
              lastName: null,
              profileImageUrl: null,
              clerkDataUpdatedAt: null,
              churchName: null,
              churchCity: null,
              churchState: null,
              churchCountry: null,
              currentSeason: season,
              lastMonthlyVisit: null,
              churchAddedAt: null,
              referralBonusNotes: 0,
              referralCode: null,
              lockPinSalt: null,
              lockPinHash: null,
              createdAt: new Date().toISOString(),
              updatedAt: null
            };
          }

          const effectiveHighest = await getEffectiveHighestSimpleNoteId(userId);
          const nextSimpleNoteId = effectiveHighest + 1;
          const capitalizedContent = (verseText || reference).charAt(0).toUpperCase() + (verseText || reference).slice(1);
          const capitalizedTitle = reference.charAt(0).toUpperCase() + reference.slice(1);

          // Create scripture note
          const { ensureUnorganizedThread } = await import('./unorganized-thread');
          await ensureUnorganizedThread(userId);

          // Scripture notes are automatically shared
          const now = new Date().toISOString();
          const shareToken = generateShareToken();

          // Do not set lastVisited on creation: scripture notes are excluded from the dashboard
          // list until the user visits them; they still appear inside the parent note card (refs/pills).
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
              isPublic: true,
              shareToken: shareToken,
              shareTokenCreatedAt: now,
              addedBy: 'harvous',
              createdAt: now,
            })
            .returning()
            .get();

          // Update user metadata
          await db.update(UserMetadata)
            .set({
              highestSimpleNoteId: nextSimpleNoteId,
              updatedAt: new Date().toISOString()
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
              createdAt: new Date().toISOString()
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
                createdAt: new Date().toISOString()
              });
              await db.update(Notes).set({ threadId: actualThreadId }).where(eq(Notes.id, scriptureNote.id));
            } catch (error) {
              // Ignore if already exists
            }
          }

          referenceMap.set(reference, scriptureNote.id);
          normalizedScriptureMap.set(normalizedReference, { noteId: scriptureNote.id, reference: normalizedReference });

          // Create junction entry linking this note to the new scripture note
          try {
            await db.insert(NoteScriptureReferences).values({
              id: `note-scripture-${noteId}-${scriptureNote.id}-${Date.now()}`,
              noteId: noteId, // The note containing the reference
              scriptureNoteId: scriptureNote.id, // The scripture note being referenced
              createdAt: new Date().toISOString()
            });
          } catch (junctionError: any) {
            if (!junctionError?.message?.includes('UNIQUE constraint failed')) {
              console.error(`[processScriptureReferences] Failed to create junction for new scripture (noteId=${noteId}, scriptureNoteId=${scriptureNote.id}, reference=${reference}):`, junctionError?.message ?? junctionError);
            }
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
              createdAt: new Date().toISOString()
            });
          }
        } catch (junctionError: any) {
          if (!junctionError?.message?.includes('UNIQUE constraint failed')) {
            console.error(`[processScriptureReferences] Failed to create junction for existing scripture (noteId=${noteId}, scriptureNoteId=${existingNoteId}, reference=${reference}):`, junctionError?.message ?? junctionError);
          }
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
              createdAt: new Date().toISOString()
            });

            // If note was in unorganized, update the legacy threadId field to remove it from unorganized
            if (inUnorganized) {
              await db.update(Notes)
                .set({ threadId: actualThreadId })
                .where(eq(Notes.id, existingNoteId));
            }

            // Update the target thread's timestamp
            await db.update(Threads)
              .set({ updatedAt: new Date().toISOString() })
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

  // Also add existing references to the map so they're preserved (including pills-only case when no plain text refs detected)
  for (const [normalizedRef, existingScriptureNoteId] of existingReferences.entries()) {
    // Find the original reference format from detected references, or use normalized ref for pills-only
    const matchingRef = detectedReferences.find(d => normalizeScriptureReference(d.reference) === normalizedRef);
    const referenceForHighlight = matchingRef?.reference ?? normalizedRef;
    if (!referenceMap.has(referenceForHighlight)) {
      referenceMap.set(referenceForHighlight, existingScriptureNoteId);
      referencesForHighlighting.push({ reference: referenceForHighlight, noteId: existingScriptureNoteId });
    }

    // Ensure junction entry exists for existing references (critical for collapsible list)
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
          createdAt: new Date().toISOString()
        });
      }
    } catch (junctionError: any) {
      if (!junctionError?.message?.includes('UNIQUE constraint failed')) {
        console.error(`[processScriptureReferences] Failed to create junction for existing ref (noteId=${noteId}, scriptureNoteId=${existingScriptureNoteId}):`, junctionError?.message ?? junctionError);
      }
    }
  }

  // ADDITIONAL FIX: Extract ALL scripture pills with real noteIds from content
  // and ensure junction entries exist (handles manually linked scripture notes, paste, etc.)
  const allExistingPills = new Map<string, string>(); // scriptureNoteId -> reference

  function collectPill(scriptureNoteId: string, reference: string) {
    if (scriptureNoteId && scriptureNoteId !== 'pending' && scriptureNoteId !== 'null' && scriptureNoteId !== '' && !allExistingPills.has(scriptureNoteId)) {
      allExistingPills.set(scriptureNoteId, reference);
    }
  }

  const allPillPatterns: Array<{ re: RegExp; refIdx: number; noteIdIdx: number }> = [
    { re: /<span[^>]*data-scripture-reference\s*=\s*["']([^"']+)["'][^>]*data-note-id\s*=\s*["']([^"']+)["'][^>]*>/gi, refIdx: 1, noteIdIdx: 2 },
    { re: /<span[^>]*data-note-id\s*=\s*["']([^"']+)["'][^>]*data-scripture-reference\s*=\s*["']([^"']+)["'][^>]*>/gi, refIdx: 2, noteIdIdx: 1 },
    { re: /<span[^>]*class\s*=\s*["'][^"']*scripture-pill[^"']*["'][^>]*data-scripture-reference\s*=\s*["']([^"']+)["'][^>]*data-note-id\s*=\s*["']([^"']+)["'][^>]*>/gi, refIdx: 1, noteIdIdx: 2 },
    { re: /<span[^>]*class\s*=\s*["'][^"']*["'][^>]*data-scripture-reference\s*=\s*["']([^"']+)["'][^>]*data-note-id\s*=\s*["']([^"']+)["'][^>]*>/gi, refIdx: 1, noteIdIdx: 2 },
    { re: /<span[^>]*class\s*=\s*["'][^"']*["'][^>]*data-note-id\s*=\s*["']([^"']+)["'][^>]*data-scripture-reference\s*=\s*["']([^"']+)["'][^>]*>/gi, refIdx: 2, noteIdIdx: 1 },
    { re: /<span[^>]*style\s*=\s*["'][^"']*["'][^>]*data-scripture-reference\s*=\s*["']([^"']+)["'][^>]*data-note-id\s*=\s*["']([^"']+)["'][^>]*>/gi, refIdx: 1, noteIdIdx: 2 },
    { re: /<span[^>]*style\s*=\s*["'][^"']*["'][^>]*data-note-id\s*=\s*["']([^"']+)["'][^>]*data-scripture-reference\s*=\s*["']([^"']+)["'][^>]*>/gi, refIdx: 2, noteIdIdx: 1 },
  ];

  let pillMatch;
  for (const { re, refIdx, noteIdIdx } of allPillPatterns) {
    re.lastIndex = 0;
    while ((pillMatch = re.exec(noteContent)) !== null) {
      collectPill(pillMatch[noteIdIdx], pillMatch[refIdx]);
    }
  }

  // After processing all detected references, ensure junction entries exist for ALL pills
  // This handles pills that were pasted with noteIds from other notes
  for (const [scriptureNoteId, reference] of allExistingPills.entries()) {
    try {
      // First, verify that the scripture note exists and belongs to this user
      // This handles cases where pills were pasted with noteIds that don't exist or belong to other users
      const scriptureNote = await db.select()
        .from(Notes)
        .where(
          and(
            eq(Notes.id, scriptureNoteId),
            eq(Notes.userId, userId),
            eq(Notes.noteType, 'scripture')
          )
        )
        .limit(1)
        .get();

      if (!scriptureNote) {
        // Scripture note doesn't exist or doesn't belong to user
        // This can happen when pasting pills with noteIds from deleted notes or other users
        // In this case, we should create a new scripture note for this reference
        console.log(`Scripture note ${scriptureNoteId} not found for reference ${reference}, creating new one`);

        // Normalize the reference
        const normalizedRef = normalizeScriptureReference(reference);

        // Check if a scripture note already exists for this reference (by reference, not noteId)
        const existingScriptureByRef = await db.select({
          noteId: ScriptureMetadata.noteId,
          reference: ScriptureMetadata.reference
        })
          .from(ScriptureMetadata)
          .innerJoin(Notes, eq(ScriptureMetadata.noteId, Notes.id))
          .where(
            and(
              eq(ScriptureMetadata.reference, normalizedRef),
              eq(Notes.userId, userId)
            )
          )
          .limit(1)
          .get();

        if (existingScriptureByRef) {
          // Use the existing scripture note
          const actualNoteId = existingScriptureByRef.noteId;

          // Create junction entry with the correct noteId
          const existingJunction = await db.select()
            .from(NoteScriptureReferences)
            .where(
              and(
                eq(NoteScriptureReferences.noteId, noteId),
                eq(NoteScriptureReferences.scriptureNoteId, actualNoteId)
              )
            )
            .limit(1)
            .get();

          if (!existingJunction) {
            await db.insert(NoteScriptureReferences).values({
              id: `note-scripture-${noteId}-${actualNoteId}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
              noteId: noteId,
              scriptureNoteId: actualNoteId,
              createdAt: new Date().toISOString()
            });
          }

          // Update the content to use the correct noteId in the pill
          noteContent = noteContent.replace(
            new RegExp(`data-note-id=["']${scriptureNoteId}["']`, 'g'),
            `data-note-id="${actualNoteId}"`
          );
        } else {
          // Create a new scripture note for this reference
          // This follows the same logic as the main processing loop
          try {
            // Fetch verse text via shared helper (normalized reference for consistent results)
            const verseText = await fetchVerseText(normalizedRef);

            // Get user metadata
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

              const season = getCurrentSeason();
              await db.insert(UserMetadata).values({
                id: `user_metadata_${userId}`,
                userId: userId,
                highestSimpleNoteId: highestExistingId,
                userColor: 'blue',
                currentSeason: season,
                createdAt: new Date().toISOString()
              });
              userMetadata = {
                id: `user_metadata_${userId}`,
                userId: userId,
                highestSimpleNoteId: highestExistingId,
                userColor: 'blue',
                email: null,
                firstName: null,
                lastName: null,
                profileImageUrl: null,
                clerkDataUpdatedAt: null,
                churchName: null,
                churchCity: null,
                churchState: null,
                churchCountry: null,
                currentSeason: season,
                lastMonthlyVisit: null,
                churchAddedAt: null,
                referralBonusNotes: 0,
                referralCode: null,
                lockPinSalt: null,
                lockPinHash: null,
                createdAt: new Date().toISOString(),
                updatedAt: null
              };
            }

            const effectiveHighest = await getEffectiveHighestSimpleNoteId(userId);
            const nextSimpleNoteId = effectiveHighest + 1;
            const capitalizedContent = (verseText || reference).charAt(0).toUpperCase() + (verseText || reference).slice(1);
            const capitalizedTitle = reference.charAt(0).toUpperCase() + reference.slice(1);

            // Create scripture note
            const { ensureUnorganizedThread } = await import('./unorganized-thread');
            await ensureUnorganizedThread(userId);

            const now = new Date().toISOString();
            const shareToken = generateShareToken();

            // Do not set lastVisited: scripture notes only appear in the organized content list when visited.
            const newScriptureNote = await db.insert(Notes)
              .values({
                id: generateNoteId(),
                content: capitalizedContent,
                title: capitalizedTitle,
                threadId: 'thread_unorganized',
                spaceId: null,
                simpleNoteId: nextSimpleNoteId,
                noteType: 'scripture',
                userId,
                isPublic: true,
                shareToken: shareToken,
                shareTokenCreatedAt: now,
                addedBy: 'harvous',
                createdAt: now,
              })
              .returning()
              .get();

            // Update user metadata
            await db.update(UserMetadata)
              .set({
                highestSimpleNoteId: nextSimpleNoteId,
                updatedAt: new Date().toISOString()
              })
              .where(eq(UserMetadata.userId, userId));

            // Create ScriptureMetadata
            const parsed = parseScriptureReference(normalizedRef);
            if (parsed) {
              const verseStart = Array.isArray(parsed.verse) ? parsed.verse[0] : parsed.verse;
              const verseEnd = Array.isArray(parsed.verse) ? parsed.verse[1] : undefined;

              await db.insert(ScriptureMetadata).values({
                id: `scripture_${newScriptureNote.id}_${Date.now()}`,
                noteId: newScriptureNote.id,
                reference: normalizedRef,
                book: parsed.book,
                chapter: parsed.chapter,
                verse: verseStart,
                verseEnd: verseEnd || null,
                translation: 'NET',
                originalText: capitalizedContent,
                createdAt: new Date().toISOString()
              });
            }

            // Award XP
            await awardNoteCreatedXP(userId, newScriptureNote.id, true, capitalizedContent);

            // Auto-generate and apply tags
            try {
              const autoTagResult = await generateAutoTags(capitalizedTitle || '', capitalizedContent, userId, 0.8);
              if (autoTagResult.suggestions.length > 0) {
                await applyAutoTags(newScriptureNote.id, autoTagResult.suggestions, userId);
              }
            } catch (tagError: any) {
              console.error(`Error auto-generating tags for scripture note ${newScriptureNote.id}:`, tagError);
            }

            // Create junction entry
            await db.insert(NoteScriptureReferences).values({
              id: `note-scripture-${noteId}-${newScriptureNote.id}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
              noteId: noteId,
              scriptureNoteId: newScriptureNote.id,
              createdAt: new Date().toISOString()
            });

            // Update content to use the new noteId
            noteContent = noteContent.replace(
              new RegExp(`data-note-id=["']${scriptureNoteId}["']`, 'g'),
              `data-note-id="${newScriptureNote.id}"`
            );

            // Add new scripture note to parent's thread (same as main creation path)
            if (actualThreadId !== 'thread_unorganized') {
              try {
                await db.insert(NoteThreads).values({
                  id: `note-thread-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                  noteId: newScriptureNote.id,
                  threadId: actualThreadId,
                  createdAt: new Date().toISOString()
                });
                await db.update(Notes).set({ threadId: actualThreadId }).where(eq(Notes.id, newScriptureNote.id));
              } catch (error) {
                // Ignore if already exists
              }
            }

            results.push({
              action: 'created',
              noteId: newScriptureNote.id,
              reference
            });
          } catch (createError: any) {
            console.error(`Error creating scripture note for pasted pill ${reference}:`, createError);
          }
        }
        continue; // Skip junction entry creation since we handled it above
      }

      // Scripture note exists - create junction entry if it doesn't exist
      const existingJunction = await db.select()
        .from(NoteScriptureReferences)
        .where(
          and(
            eq(NoteScriptureReferences.noteId, noteId),
            eq(NoteScriptureReferences.scriptureNoteId, scriptureNoteId)
          )
        )
        .limit(1)
        .get();

      if (!existingJunction) {
        await db.insert(NoteScriptureReferences).values({
          id: `note-scripture-${noteId}-${scriptureNoteId}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          noteId: noteId,
          scriptureNoteId: scriptureNoteId,
          createdAt: new Date().toISOString()
        });
      }
    } catch (junctionError: any) {
      if (!junctionError?.message?.includes('UNIQUE constraint failed')) {
        console.error(`[processScriptureReferences] Failed to create junction for pill (noteId=${noteId}, scriptureNoteId=${scriptureNoteId}, reference=${reference}):`, junctionError?.message ?? junctionError);
      }
    }
  }

  const updatedContent = highlightScriptureReferences(noteContent, referencesForHighlighting);

  // Always update note in database with properly highlighted content
  // This ensures scripture pills always have correct class and data attributes
  // even if Tiptap's getHTML output was missing some attributes
  console.log('[processScriptureReferences] Updating note with highlighted content', {
    noteId,
    referencesForHighlightingCount: referencesForHighlighting.length
  });
  await db.update(Notes)
    .set({
      content: updatedContent,
      updatedAt: new Date().toISOString()
    })
    .where(eq(Notes.id, noteId));

  return {
    results,
    updatedContent
  };
}
