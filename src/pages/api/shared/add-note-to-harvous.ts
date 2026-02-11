export const prerender = false;

import type { APIRoute } from 'astro';
import { db, Notes, UserMetadata, ScriptureMetadata, ResourceMetadata, eq, and, desc, isNotNull } from 'astro:db';
import { generateNoteId, isValidShareToken } from '@/utils/ids';
import { awardNoteCreatedXP } from '@/utils/xp-system';
import { handleAPIError } from '@/utils/error-handling';

export const POST: APIRoute = async ({ request, locals }) => {
  try {
    const { userId } = locals.auth();

    if (!userId) {
      return new Response(JSON.stringify({ error: 'Authentication required' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const body = await request.json();
    const { shareToken } = body;

    if (!shareToken) {
      return new Response(JSON.stringify({ error: 'Share token is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Validate share token format
    if (!isValidShareToken(shareToken)) {
      return new Response(JSON.stringify({ error: 'Invalid share token format' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Fetch the source note by share token (must be public)
    const sourceNote = await db
      .select({
        id: Notes.id,
        title: Notes.title,
        content: Notes.content,
        noteType: Notes.noteType,
        isPublic: Notes.isPublic,
        userId: Notes.userId
      })
      .from(Notes)
      .where(and(
        eq(Notes.shareToken, shareToken),
        eq(Notes.isPublic, true)
      ))
      .get();

    if (!sourceNote) {
      return new Response(JSON.stringify({
        error: 'Shared note not found or no longer available'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Prevent adding your own note (only in production - allow in dev for testing)
    if (import.meta.env.PROD && sourceNote.userId === userId) {
      return new Response(JSON.stringify({
        error: 'Already in your Harvous'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get or create user metadata for simpleNoteId
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
        createdAt: new Date()
      });
      userMetadata = {
        id: `user_metadata_${userId}`,
        userId: userId,
        highestSimpleNoteId: highestExistingId,
        userColor: 'paper',
        firstName: null,
        lastName: null,
        email: null,
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

    const now = new Date();
    const newNoteId = generateNoteId();
    const newSimpleNoteId = (userMetadata?.highestSimpleNoteId || 0) + 1;

    // Create the new note (goes to unorganized thread)
    await db.insert(Notes).values({
      id: newNoteId,
      title: sourceNote.title || null,
      content: sourceNote.content,
      threadId: 'thread_unorganized',
      spaceId: null,
      simpleNoteId: newSimpleNoteId,
      noteType: sourceNote.noteType || 'default',
      userId: userId,
      isPublic: false,
      addedBy: 'shared', // Track that this came from a shared note
      createdAt: now,
      lastVisited: now,
    });

    // Note: Unorganized notes should NOT have junction table entries
    // The absence of a junction entry is what makes them appear in unorganized

    // Copy scripture metadata if it's a scripture note
    if (sourceNote.noteType === 'scripture') {
      const sourceScriptureMeta = await db
        .select()
        .from(ScriptureMetadata)
        .where(eq(ScriptureMetadata.noteId, sourceNote.id))
        .get();

      if (sourceScriptureMeta) {
        const scriptureMetaId = `scripture_${newNoteId}_${Date.now()}`;
        await db.insert(ScriptureMetadata).values({
          id: scriptureMetaId,
          noteId: newNoteId,
          reference: sourceScriptureMeta.reference,
          book: sourceScriptureMeta.book,
          chapter: sourceScriptureMeta.chapter,
          verse: sourceScriptureMeta.verse,
          verseEnd: sourceScriptureMeta.verseEnd || null,
          translation: sourceScriptureMeta.translation,
          originalText: sourceScriptureMeta.originalText,
          createdAt: now
        });
      }
    }

    // Copy resource metadata if it's a resource note
    if (sourceNote.noteType === 'resource') {
      const sourceResourceMeta = await db
        .select()
        .from(ResourceMetadata)
        .where(eq(ResourceMetadata.noteId, sourceNote.id))
        .get();

      if (sourceResourceMeta) {
        const resourceMetaId = `resource_${newNoteId}_${Date.now()}`;
        await db.insert(ResourceMetadata).values({
          id: resourceMetaId,
          noteId: newNoteId,
          sourceUrl: sourceResourceMeta.sourceUrl,
          sourceDomain: sourceResourceMeta.sourceDomain || null,
          sourceName: sourceResourceMeta.sourceName || null,
          sourceTitle: sourceResourceMeta.sourceTitle || null,
          sourceDescription: sourceResourceMeta.sourceDescription || null,
          sourceImage: sourceResourceMeta.sourceImage || null,
          createdAt: now
        });
      }
    }

    // Update user metadata with highest simpleNoteId
    await db.update(UserMetadata)
      .set({
        highestSimpleNoteId: newSimpleNoteId,
        updatedAt: now
      })
      .where(eq(UserMetadata.userId, userId));

    // Process scripture references in the note content (async, fire-and-forget)
    // This will detect references like "John 3:16" in the content and either:
    // - Create new scripture notes if they don't exist
    // - Connect to existing scripture notes if they do exist
    const processScriptureReferencesAsync = async () => {
      try {
        const { processScriptureReferences } = await import('@/utils/process-scripture-references');
        await processScriptureReferences(newNoteId, userId, 'thread_unorganized', sourceNote.content);
      } catch (error: any) {
        console.error('Error processing scripture references (non-critical):', error);
      }
    };
    processScriptureReferencesAsync().catch(() => {});

    // Award XP for note creation (async, fire-and-forget)
    const isScriptureNote = sourceNote.noteType === 'scripture';
    awardNoteCreatedXP(userId, newNoteId, isScriptureNote, sourceNote.content || '').catch(() => {});

    return new Response(JSON.stringify({
      success: true,
      message: 'Note added to your Harvous!',
      createdIds: {
        noteId: newNoteId
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/shared/add-note-to-harvous',
      action: 'add_shared_note'
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
