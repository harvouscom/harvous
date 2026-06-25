/**
 * Shared utility function to process scripture references in a note
 * Can be called directly from API routes or other server-side code
 */

import { db, first, Notes, UserMetadata, NoteThreads, ScriptureMetadata, NoteScriptureReferences, NoteTags, Comments, Threads, eq, and, desc, isNotNull, count, ne } from '../db';
import { getEffectiveHighestSimpleNoteId } from './highest-simple-note-id';
import { detectScriptureReferences, normalizeScriptureReference, parseScriptureReference } from '@/utils/scripture-detector';
import { highlightScriptureReferences } from '@/utils/scripture-highlighter';
import { canonicalizeNoteHtmlLineBreaks } from '@/utils/note-html-linebreaks';
import { generateNoteId, generateShareToken } from '@/utils/ids';
import { getCurrentSeason } from '@/utils/season-helpers';
import { awardNoteCreatedXP } from './xp-system';
import { generateAutoTags, applyAutoTags, AUTO_TAG_CONFIDENCE_SYSTEM_AUTOGEN } from './auto-tag-generator';
import { fetchVerseText } from './fetch-verse-text';
import { deleteSingleNoteCascadeForUser } from './delete-note-cascade';
import { recordDeletedEntities } from './sync-deletion-log';
import { broadcastInvalidation } from './realtime';

export interface ProcessingResult {
  action: 'created' | 'added' | 'unorganized' | 'skipped';
  noteId: string;
  reference: string;
}

async function resolveParentThreadIds(
  noteId: string,
  threadId: string | string[] | undefined,
  note: { threadId: string | null },
): Promise<string[]> {
  if (threadId !== undefined) {
    const arr = Array.isArray(threadId) ? threadId : [threadId];
    const out = new Set<string>();
    for (const t of arr) {
      if (t && t.trim() && t !== 'thread_unorganized' && !t.startsWith('thread_onboarding_')) {
        out.add(t);
      }
    }
    return [...out];
  }
  const ids = new Set<string>();
  const rels = await db.select({ threadId: NoteThreads.threadId }).from(NoteThreads).where(eq(NoteThreads.noteId, noteId));
  for (const r of rels) {
    if (r.threadId && r.threadId !== 'thread_unorganized' && !r.threadId.startsWith('thread_onboarding_')) {
      ids.add(r.threadId);
    }
  }
  if (note.threadId && note.threadId !== 'thread_unorganized' && !note.threadId.startsWith('thread_onboarding_')) {
    ids.add(note.threadId);
  }
  return [...ids];
}

/** Adds a scripture note to every parent thread (NoteThreads + Notes.threadId when leaving unorganized). */
async function addScriptureNoteToParentThreads(scriptureNoteId: string, parentThreadIds: string[], userId: string): Promise<void> {
  const filtered = parentThreadIds.filter((t) => t && t !== 'thread_unorganized' && !t.startsWith('thread_onboarding_'));
  if (filtered.length === 0) return;

  const scriptureNote = first(await db.select().from(Notes).where(eq(Notes.id, scriptureNoteId)).limit(1));
  if (!scriptureNote) return;

  const existingRels = await db.select({ threadId: NoteThreads.threadId }).from(NoteThreads).where(eq(NoteThreads.noteId, scriptureNoteId));
  const existingSet = new Set(existingRels.map((r) => r.threadId));
  const needsPrimary = existingRels.length === 0 || scriptureNote.threadId === 'thread_unorganized';
  let primaryUpdated = false;

  for (const tid of filtered) {
    if (existingSet.has(tid)) continue;
    try {
      await db.insert(NoteThreads).values({
        id: `note-thread-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        noteId: scriptureNoteId,
        threadId: tid,
        createdAt: new Date(),
      });
      existingSet.add(tid);
      if (needsPrimary && !primaryUpdated) {
        await db.update(Notes).set({ threadId: tid }).where(eq(Notes.id, scriptureNoteId));
        primaryUpdated = true;
      }
      await db.update(Threads).set({ updatedAt: new Date() }).where(and(eq(Threads.id, tid), eq(Threads.userId, userId)));
    } catch {
      // ignore duplicate / race
    }
  }
}

// Per-user mutex: serializes concurrent processScriptureReferences calls for the same user
// to prevent race conditions where two calls both see "no existing scripture" and create duplicates.
const userProcessingQueue = new Map<string, Promise<any>>();

export interface ProcessScriptureOptions {
  // When true, skip re-running auto-tag on the parent note. Set on the load/backfill
  // path (opening a note) so merely viewing a note never appends new tags.
  skipParentAutoTag?: boolean;
  // When true, do not bump the parent note's updatedAt when persisting highlighted content.
  // Set on the load/backfill path (opening a note) so merely viewing a note — which materializes
  // legacy pills — never changes the note's "last updated" sort order.
  skipUpdatedAt?: boolean;
}

export async function processScriptureReferences(
  noteId: string,
  userId: string,
  threadId?: string | string[],
  contentOverride?: string,
  translation: string = 'NET',
  options?: ProcessScriptureOptions
): Promise<{ results: ProcessingResult[]; updatedContent: string }> {
  const prev = userProcessingQueue.get(userId) ?? Promise.resolve();
  const current = prev
    .catch(() => {}) // Don't let a previous failure block the queue
    .then(() => processScriptureReferencesInternal(noteId, userId, threadId, contentOverride, translation, options));
  userProcessingQueue.set(userId, current);
  try {
    return await current;
  } finally {
    // Clean up if this was the last in the chain
    if (userProcessingQueue.get(userId) === current) {
      userProcessingQueue.delete(userId);
    }
  }
}

async function processScriptureReferencesInternal(
  noteId: string,
  userId: string,
  threadId?: string | string[],
  contentOverride?: string, // Optional: use this content instead of reading from DB
  translation: string = 'NET',
  options?: ProcessScriptureOptions
): Promise<{ results: ProcessingResult[]; updatedContent: string }> {
  // Get the note from database
  const note = first(await db.select()
    .from(Notes)
    .where(and(eq(Notes.id, noteId), eq(Notes.userId, userId)))
    .limit(1));

  if (!note) {
    throw new Error('Note not found');
  }

  // Use provided content or note content
  // Use let instead of const so we can update it when fixing pasted pill noteIds
  let noteContent = contentOverride || note.content;

  // All threads the parent note belongs to (explicit param, or every NoteThreads row + Notes.threadId)
  const parentThreadIds = await resolveParentThreadIds(noteId, threadId, note);

  // Extract existing scripture references from the content (already processed)
  // This helps us track which references were already in the note
  // Use two patterns to handle different attribute orders (Tiptap may serialize attributes in varying order)
  const existingReferences = new Map<string, string>(); // normalizedReference -> noteId
  const pendingPills = new Map<string, { reference: string; fullMatch: string; startIndex: number; pillTranslation?: string; pillAccent?: string }>(); // normalizedReference -> pill info

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
      // Extract per-pill translation override from data-scripture-translation attribute
      const translationMatch = fullMatch.match(/data-scripture-translation\s*=\s*["']([^"']+)["']/);
      const pillTranslation = translationMatch ? translationMatch[1] : undefined;
      // Extract per-pill accent override from data-pill-accent attribute (set by web UI or native bridge)
      const accentMatch = fullMatch.match(/data-pill-accent\s*=\s*["']([^"']+)["']/);
      const pillAccent = accentMatch ? accentMatch[1] : undefined;
      pendingPills.set(normalizedRef, {
        reference: match[1],
        fullMatch: match[0],
        startIndex: match.index || 0,
        pillTranslation,
        pillAccent,
      });
    }
  }

  // Per-pill translation from any scripture span (pending or resolved) for re-highlighting
  const existingPillTranslations = new Map<string, string>();
  const existingPillAccents = new Map<string, string>();
  const allPillTranslationPattern = /<span[^>]*data-scripture-reference\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let pillTransMatch;
  while ((pillTransMatch = allPillTranslationPattern.exec(noteContent)) !== null) {
    const fullMatch = pillTransMatch[0];
    const reference = pillTransMatch[1];
    const translationMatch = fullMatch.match(/data-scripture-translation\s*=\s*["']([^"']+)["']/);
    const pillTranslation = translationMatch ? translationMatch[1] : undefined;
    if (pillTranslation) {
      const normalizedRef = normalizeScriptureReference(reference);
      if (!existingPillTranslations.has(normalizedRef)) {
        existingPillTranslations.set(normalizedRef, pillTranslation);
      }
    }
    const accentMatch = fullMatch.match(/data-pill-accent\s*=\s*["']([^"']+)["']/);
    const pillAccent = accentMatch ? accentMatch[1] : undefined;
    if (pillAccent) {
      const normalizedRef = normalizeScriptureReference(reference);
      if (!existingPillAccents.has(normalizedRef)) {
        existingPillAccents.set(normalizedRef, pillAccent);
      }
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

  const normalizedScriptureMap = new Map<string, { noteId: string; reference: string }>();
  let scriptureMapLoaded = false;

  /** Full user scripture index + duplicate consolidation — expensive; skip when save only touches existing pills. */
  async function loadScriptureMapFromDb(): Promise<void> {
    if (scriptureMapLoaded) return;
    scriptureMapLoaded = true;

    const allUserScripture = await db.select({
      noteId: ScriptureMetadata.noteId,
      reference: ScriptureMetadata.reference
    })
      .from(ScriptureMetadata)
      .innerJoin(Notes, eq(ScriptureMetadata.noteId, Notes.id))
      .where(eq(Notes.userId, userId));

    const duplicatesByNormalized = new Map<string, string[]>();

    for (const scripture of allUserScripture) {
      const normalizedStored = normalizeScriptureReference(scripture.reference);
      if (!normalizedScriptureMap.has(normalizedStored)) {
        normalizedScriptureMap.set(normalizedStored, {
          noteId: scripture.noteId,
          reference: scripture.reference
        });
      } else {
        const existing = normalizedScriptureMap.get(normalizedStored)!;
        if (existing.noteId !== scripture.noteId) {
          if (!duplicatesByNormalized.has(normalizedStored)) {
            duplicatesByNormalized.set(normalizedStored, [existing.noteId]);
          }
          duplicatesByNormalized.get(normalizedStored)!.push(scripture.noteId);
        }
      }
    }

  // Consolidate any duplicate scripture notes (safety net for past race conditions)
  if (duplicatesByNormalized.size > 0) {
    try {
      console.log(`[processScriptureReferences] Found ${duplicatesByNormalized.size} duplicate scripture reference(s) for user ${userId}, consolidating...`);

      for (const [normalizedRef, dupeNoteIds] of duplicatesByNormalized.entries()) {
        // Fetch all duplicate notes to determine the keeper (oldest by createdAt)
        const dupeNotes = await db.select({ id: Notes.id, createdAt: Notes.createdAt })
          .from(Notes)
          .where(and(eq(Notes.userId, userId), eq(Notes.noteType, 'scripture')))
          ;

        const relevantNotes = dupeNotes
          .filter(n => dupeNoteIds.includes(n.id))
          .sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));

        if (relevantNotes.length < 2) continue;

        const keeperId = relevantNotes[0].id;
        const duplicateIds = relevantNotes.slice(1).map(n => n.id);

        for (const dupeId of duplicateIds) {
          // Repoint junction rows from duplicate to keeper
          const junctionsToMove = await db.select()
            .from(NoteScriptureReferences)
            .where(eq(NoteScriptureReferences.scriptureNoteId, dupeId))
            ;

          for (const junction of junctionsToMove) {
            // Check if keeper junction already exists for this parent note
            const existingKeeperJunction = first(await db.select()
              .from(NoteScriptureReferences)
              .where(and(
                eq(NoteScriptureReferences.noteId, junction.noteId),
                eq(NoteScriptureReferences.scriptureNoteId, keeperId)
              ))
              .limit(1));

            if (existingKeeperJunction) {
              // Keeper junction exists — just delete the duplicate junction
              await db.delete(NoteScriptureReferences).where(eq(NoteScriptureReferences.id, junction.id));
            } else {
              // Repoint to keeper
              await db.update(NoteScriptureReferences)
                .set({ scriptureNoteId: keeperId })
                .where(eq(NoteScriptureReferences.id, junction.id));
            }
          }

          // Update data-note-id in all notes that reference the duplicate
          const affectedNotes = await db.select({ id: Notes.id, content: Notes.content })
            .from(Notes)
            .where(eq(Notes.userId, userId))
            ;

          for (const affectedNote of affectedNotes) {
            if (affectedNote.content && affectedNote.content.includes(dupeId)) {
              const updatedContent = affectedNote.content.replace(
                new RegExp(`data-note-id=["']${dupeId}["']`, 'g'),
                `data-note-id="${keeperId}"`
              );
              if (updatedContent !== affectedNote.content) {
                await db.update(Notes).set({ content: updatedContent }).where(eq(Notes.id, affectedNote.id));
              }
            }
          }

          // Delete duplicate note and emit sync tombstones so all clients stay consistent.
          const deleted = await deleteSingleNoteCascadeForUser(userId, dupeId);
          if (deleted.deletedNoteIds.length > 0) {
            await recordDeletedEntities(userId, 'note', deleted.deletedNoteIds);
            if (deleted.deletedStudyThreadIds.length > 0) {
              await recordDeletedEntities(userId, 'studyThread', deleted.deletedStudyThreadIds);
            }
            for (const removedId of deleted.deletedNoteIds) {
              broadcastInvalidation(userId, { type: 'note:deleted', id: removedId });
            }
          }
        }

        // Update the map to point to the keeper
        normalizedScriptureMap.set(normalizedRef, { noteId: keeperId, reference: normalizedRef });
        console.log(`[processScriptureReferences] Consolidated "${normalizedRef}": kept ${keeperId}, removed ${duplicateIds.join(', ')}`);
      }
    } catch (dedupError: any) {
      // Never block main processing if dedup cleanup fails
      console.error('[processScriptureReferences] Dedup cleanup failed (non-critical):', dedupError?.message ?? dedupError);
    }
  }
  }

  const skipBulkScriptureLoad =
    pendingPills.size === 0 &&
    detectedReferences.every((d) => existingReferences.has(normalizeScriptureReference(d.reference)));

  if (!skipBulkScriptureLoad) {
    await loadScriptureMapFromDb();
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
          ;
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
          // Use per-pill translation override if available, otherwise fall back to user's default
          const pendingPillInfo = pendingPills.get(normalizedReference);
          const effectiveTranslation = pendingPillInfo?.pillTranslation || translation;

          // Fetch verse text via shared helper (normalized reference for consistent results)
          const verseText = await fetchVerseText(normalizedReference, effectiveTranslation);

          // Get user metadata for simpleNoteId
          let userMetadata = first(await db.select()
            .from(UserMetadata)
            .where(eq(UserMetadata.userId, userId))
            .limit(1));

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
              createdAt: new Date()
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
              defaultTranslation: 'NET',
              appearanceSettings: null,
              onboardingPackVersionApplied: 0,
              tier: 'free',
              createdAt: new Date(),
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
          const now = new Date();
          const shareToken = generateShareToken();

          // Do not set lastVisited on creation: scripture notes are excluded from the dashboard
          // list until the user visits them; they still appear inside the parent note card (refs/pills).
          const scriptureNote = first(await db.insert(Notes)
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
            .returning())!;

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
              chapterEnd: parsed.endChapter ?? null, // cross-chapter range end (verseEnd lives in chapterEnd)
              translation: effectiveTranslation,
              originalText: capitalizedContent,
              createdAt: new Date()
            });
          }

          // Award XP (scripture notes get 3 XP and are exempt from rate/content checks)
          await awardNoteCreatedXP(userId, scriptureNote.id, true, capitalizedContent);

          // Auto-tag fire-and-forget (non-critical)
          (async () => {
            try {
              const autoTagResult = await generateAutoTags(
                capitalizedTitle || '',
                capitalizedContent,
                userId,
                AUTO_TAG_CONFIDENCE_SYSTEM_AUTOGEN
              );
              if (autoTagResult.suggestions.length > 0) {
                await applyAutoTags(scriptureNote.id, autoTagResult.suggestions, userId);
              }
            } catch (err) {
              console.error('Auto-tagging failed for scripture note (non-critical):', err);
            }
          })().catch(() => {});

          // Add new scripture note to every parent thread
          await addScriptureNoteToParentThreads(scriptureNote.id, parentThreadIds, userId);

          referenceMap.set(reference, scriptureNote.id);
          normalizedScriptureMap.set(normalizedReference, { noteId: scriptureNote.id, reference: normalizedReference });

          // Create junction entry linking this note to the new scripture note
          try {
            await db.insert(NoteScriptureReferences).values({
              id: `note-scripture-${noteId}-${scriptureNote.id}-${Date.now()}`,
              noteId: noteId, // The note containing the reference
              scriptureNoteId: scriptureNote.id, // The scripture note being referenced
              createdAt: new Date()
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
          const existingJunction = first(await db.select()
            .from(NoteScriptureReferences)
            .where(
              and(
                eq(NoteScriptureReferences.noteId, noteId),
                eq(NoteScriptureReferences.scriptureNoteId, existingNoteId)
              )
            )
            .limit(1));

          if (!existingJunction) {
            await db.insert(NoteScriptureReferences).values({
              id: `note-scripture-${noteId}-${existingNoteId}-${Date.now()}`,
              noteId: noteId, // The note containing the reference
              scriptureNoteId: existingNoteId, // The scripture note being referenced
              createdAt: new Date()
            });
          }
        } catch (junctionError: any) {
          if (!junctionError?.message?.includes('UNIQUE constraint failed')) {
            console.error(`[processScriptureReferences] Failed to create junction for existing scripture (noteId=${noteId}, scriptureNoteId=${existingNoteId}, reference=${reference}):`, junctionError?.message ?? junctionError);
          }
        }

        const threadCount = first(await db.select({ count: count() })
          .from(NoteThreads)
          .where(eq(NoteThreads.noteId, existingNoteId))
          .limit(1));

        const inUnorganized = !threadCount || threadCount.count === 0;

        if (parentThreadIds.length === 0) {
          results.push({
            action: 'unorganized',
            noteId: existingNoteId,
            reference
          });
        } else {
          const existingRels = await db.select({ threadId: NoteThreads.threadId })
            .from(NoteThreads)
            .where(eq(NoteThreads.noteId, existingNoteId));
          const existingSet = new Set(existingRels.map((r) => r.threadId));

          let addedAny = false;
          for (const tid of parentThreadIds) {
            if (existingSet.has(tid)) continue;
            try {
              await db.insert(NoteThreads).values({
                id: `note-thread-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                noteId: existingNoteId,
                threadId: tid,
                createdAt: new Date()
              });
              existingSet.add(tid);
              addedAny = true;
              await db.update(Threads)
                .set({ updatedAt: new Date() })
                .where(and(eq(Threads.id, tid), eq(Threads.userId, userId)));
            } catch {
              // duplicate — ignore
            }
          }

          if (addedAny && inUnorganized) {
            await db.update(Notes)
              .set({ threadId: parentThreadIds[0] })
              .where(eq(Notes.id, existingNoteId));
          }

          results.push({
            action: addedAny ? 'added' : 'skipped',
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
  const referencesForHighlighting = Array.from(referenceMap.entries()).map(([reference, noteId]) => {
    // Use per-pill translation if available, otherwise fall back to user's default
    const normalizedRef = normalizeScriptureReference(reference);
    const pillInfo = pendingPills.get(normalizedRef);
    return {
      reference,
      noteId,
      translation: pillInfo?.pillTranslation || existingPillTranslations.get(normalizedRef) || translation,
      accent: pillInfo?.pillAccent || existingPillAccents.get(normalizedRef),
    };
  });

  // Also add existing references to the map so they're preserved (including pills-only case when no plain text refs detected)
  for (const [normalizedRef, existingScriptureNoteId] of existingReferences.entries()) {
    // Find the original reference format from detected references, or use normalized ref for pills-only
    const matchingRef = detectedReferences.find(d => normalizeScriptureReference(d.reference) === normalizedRef);
    const referenceForHighlight = matchingRef?.reference ?? normalizedRef;
    if (!referenceMap.has(referenceForHighlight)) {
      referenceMap.set(referenceForHighlight, existingScriptureNoteId);
      const pillInfo = pendingPills.get(normalizedRef);
      referencesForHighlighting.push({ reference: referenceForHighlight, noteId: existingScriptureNoteId, translation: pillInfo?.pillTranslation || existingPillTranslations.get(normalizedRef) || translation, accent: pillInfo?.pillAccent || existingPillAccents.get(normalizedRef) });
    }

    // Ensure junction entry exists for existing references (critical for collapsible list)
    try {
      const existingJunction = first(await db.select()
        .from(NoteScriptureReferences)
        .where(
          and(
            eq(NoteScriptureReferences.noteId, noteId),
            eq(NoteScriptureReferences.scriptureNoteId, existingScriptureNoteId)
          )
        )
        .limit(1));

      if (!existingJunction) {
        await db.insert(NoteScriptureReferences).values({
          id: `note-scripture-${noteId}-${existingScriptureNoteId}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          noteId: noteId,
          scriptureNoteId: existingScriptureNoteId,
          createdAt: new Date()
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
      const scriptureNote = first(await db.select()
        .from(Notes)
        .where(
          and(
            eq(Notes.id, scriptureNoteId),
            eq(Notes.userId, userId),
            eq(Notes.noteType, 'scripture')
          )
        )
        .limit(1));

      if (!scriptureNote) {
        // Scripture note doesn't exist or doesn't belong to user
        // This can happen when pasting pills with noteIds from deleted notes or other users
        // In this case, we should create a new scripture note for this reference
        console.log(`Scripture note ${scriptureNoteId} not found for reference ${reference}, creating new one`);

        // Normalize the reference
        const normalizedRef = normalizeScriptureReference(reference);

        await loadScriptureMapFromDb();

        // Check if a scripture note already exists for this reference using the normalized map
        // (handles legacy non-normalized stored references that an exact DB match would miss)
        const existingEntry = normalizedScriptureMap.get(normalizedRef);
        const existingScriptureByRef = existingEntry
          ? { noteId: existingEntry.noteId, reference: existingEntry.reference }
          : null;

        if (existingScriptureByRef) {
          // Use the existing scripture note
          const actualNoteId = existingScriptureByRef.noteId;

          // Create junction entry with the correct noteId
          const existingJunction = first(await db.select()
            .from(NoteScriptureReferences)
            .where(
              and(
                eq(NoteScriptureReferences.noteId, noteId),
                eq(NoteScriptureReferences.scriptureNoteId, actualNoteId)
              )
            )
            .limit(1));

          if (!existingJunction) {
            await db.insert(NoteScriptureReferences).values({
              id: `note-scripture-${noteId}-${actualNoteId}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
              noteId: noteId,
              scriptureNoteId: actualNoteId,
              createdAt: new Date()
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
            const verseText = await fetchVerseText(normalizedRef, translation);

            // Get user metadata
            let userMetadata = first(await db.select()
              .from(UserMetadata)
              .where(eq(UserMetadata.userId, userId))
              .limit(1));

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
                createdAt: new Date()
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
                defaultTranslation: 'NET',
                appearanceSettings: null,
                onboardingPackVersionApplied: 0,
                tier: 'free',
                createdAt: new Date(),
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

            const now = new Date();
            const shareToken = generateShareToken();

            // Do not set lastVisited: scripture notes only appear in the organized content list when visited.
            const newScriptureNote = first(await db.insert(Notes)
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
              .returning())!;

            // Update user metadata
            await db.update(UserMetadata)
              .set({
                highestSimpleNoteId: nextSimpleNoteId,
                updatedAt: new Date()
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
                chapterEnd: parsed.endChapter ?? null, // cross-chapter range end (verseEnd lives in chapterEnd)
                translation,
                originalText: capitalizedContent,
                createdAt: new Date()
              });
            }

            // Award XP
            await awardNoteCreatedXP(userId, newScriptureNote.id, true, capitalizedContent);

            // Auto-generate and apply tags
            try {
              const autoTagResult = await generateAutoTags(capitalizedTitle || '', capitalizedContent, userId, AUTO_TAG_CONFIDENCE_SYSTEM_AUTOGEN);
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
              createdAt: new Date()
            });

            // Update content to use the new noteId
            noteContent = noteContent.replace(
              new RegExp(`data-note-id=["']${scriptureNoteId}["']`, 'g'),
              `data-note-id="${newScriptureNote.id}"`
            );

            await addScriptureNoteToParentThreads(newScriptureNote.id, parentThreadIds, userId);

            // Add to normalizedScriptureMap so subsequent pasted pills reuse this note
            normalizedScriptureMap.set(normalizedRef, { noteId: newScriptureNote.id, reference: normalizedRef });

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
      const existingJunction = first(await db.select()
        .from(NoteScriptureReferences)
        .where(
          and(
            eq(NoteScriptureReferences.noteId, noteId),
            eq(NoteScriptureReferences.scriptureNoteId, scriptureNoteId)
          )
        )
        .limit(1));

      if (!existingJunction) {
        await db.insert(NoteScriptureReferences).values({
          id: `note-scripture-${noteId}-${scriptureNoteId}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          noteId: noteId,
          scriptureNoteId: scriptureNoteId,
          createdAt: new Date()
        });
      }
    } catch (junctionError: any) {
      if (!junctionError?.message?.includes('UNIQUE constraint failed')) {
        console.error(`[processScriptureReferences] Failed to create junction for pill (noteId=${noteId}, scriptureNoteId=${scriptureNoteId}, reference=${reference}):`, junctionError?.message ?? junctionError);
      }
    }
  }

  // Prune stale NoteScriptureReferences (pills removed from content)
  // Collect all scripture note IDs that are still present in the final content
  const presentScriptureNoteIds = new Set<string>();
  for (const noteId of referenceMap.values()) {
    if (noteId) presentScriptureNoteIds.add(noteId);
  }
  for (const noteId of existingReferences.values()) {
    if (noteId) presentScriptureNoteIds.add(noteId);
  }
  for (const noteId of allExistingPills.keys()) {
    if (noteId) presentScriptureNoteIds.add(noteId);
  }

  // Query existing junctions and delete any whose scriptureNoteId is not present
  try {
    const existingJunctions = await db.select({ id: NoteScriptureReferences.id, scriptureNoteId: NoteScriptureReferences.scriptureNoteId })
      .from(NoteScriptureReferences)
      .where(eq(NoteScriptureReferences.noteId, noteId));
    
    for (const junction of existingJunctions) {
      if (!presentScriptureNoteIds.has(junction.scriptureNoteId)) {
        await db.delete(NoteScriptureReferences).where(eq(NoteScriptureReferences.id, junction.id));
      }
    }
  } catch (pruneError: any) {
    console.error('[processScriptureReferences] Failed to prune stale references (non-critical):', pruneError?.message ?? pruneError);
  }

  const updatedContent = canonicalizeNoteHtmlLineBreaks(
    highlightScriptureReferences(noteContent, referencesForHighlighting),
  );

  // Update note in database with properly highlighted content. This ensures scripture pills always
  // have correct class and data attributes even if Tiptap's getHTML output was missing some.
  // Skip the write entirely when the highlighted content is byte-identical to what's stored — the
  // pills are already correct, so there is nothing to persist (and nothing to re-stamp).
  const contentChanged = updatedContent !== note.content;
  if (contentChanged) {
    console.log('[processScriptureReferences] Updating note with highlighted content', {
      noteId,
      referencesForHighlightingCount: referencesForHighlighting.length,
      skipUpdatedAt: options?.skipUpdatedAt === true,
    });
    // On the load/backfill path (skipUpdatedAt) we still persist the materialized pills but must not
    // bump updatedAt — opening a note must never change its "last updated" sort order.
    await db.update(Notes)
      .set({
        content: updatedContent,
        ...(options?.skipUpdatedAt ? {} : { updatedAt: new Date() }),
      })
      .where(eq(Notes.id, noteId));
  }

  if (!options?.skipParentAutoTag) {
    try {
      const tagTitle = note.title ?? '';
      let systemUserId: string | null = null;
      try {
        const { getHarvousSystemUserId } = await import('./harvous-admin');
        systemUserId = getHarvousSystemUserId();
      } catch {
        systemUserId = null;
      }
      const isSystemNote = systemUserId != null && userId === systemUserId;
      const confidenceThreshold = isSystemNote ? AUTO_TAG_CONFIDENCE_SYSTEM_AUTOGEN : 0.7;
      const { folderLabelsForTagExclusion } = await import('@/utils/bible-study-concept-overlaps');
      const { parseNoteSecondaryCollections } = await import('./note-secondary-collections');
      const { dismissedAutoTagsForNote, autoTagExcludeNames } = await import('./tag-helpers');
      const folderLabels = folderLabelsForTagExclusion(
        note.primaryCollection,
        parseNoteSecondaryCollections(note.secondaryCollections),
      );
      const dismissed = dismissedAutoTagsForNote(note);
      const tagResult = await generateAutoTags(tagTitle, updatedContent, userId, confidenceThreshold, {
        excludeLabels: folderLabels,
        excludeTagNames: autoTagExcludeNames(folderLabels, dismissed),
      });
      // Phase 2: enrich with the note's passage signals (corroborate prose tags; add referenced
      // people/places). Non-throwing — falls back to the prose suggestions on any failure.
      const { enrichAutoTagsWithPassages, enrichCollectionWithPassages } = await import('./passage-aware-tags');
      const enrichedSuggestions = await enrichAutoTagsWithPassages(noteId, tagResult.suggestions, {
        threshold: confidenceThreshold,
        excludeLabels: folderLabels,
        dismissed,
      });
      if (enrichedSuggestions.length > 0) {
        await applyAutoTags(noteId, enrichedSuggestions, userId);
      }
      // Phase 2 (folder): gap-fill an empty primary collection from the dominant cited book.
      await enrichCollectionWithPassages(noteId);
    } catch (tagErr: unknown) {
      console.error(
        '[processScriptureReferences] Auto-tag parent note failed (non-critical):',
        tagErr instanceof Error ? tagErr.message : tagErr
      );
    }
  }

  return {
    results,
    updatedContent
  };
}
