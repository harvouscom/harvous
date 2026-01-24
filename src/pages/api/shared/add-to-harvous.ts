import type { APIRoute } from 'astro';
import { db, Threads, Notes, NoteThreads, UserMetadata, eq, and, desc, asc, isNotNull } from 'astro:db';
import { sql } from 'astro:db';
import { generateNoteId, generateThreadId, isValidShareToken } from '@/utils/ids';
import { awardNoteCreatedXP, awardThreadCreatedXP } from '@/utils/xp-system';
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

    // Fetch the source thread by share token (must be public)
    const sourceThread = await db
      .select({
        id: Threads.id,
        title: Threads.title,
        subtitle: Threads.subtitle,
        color: Threads.color,
        isPublic: Threads.isPublic,
        userId: Threads.userId
      })
      .from(Threads)
      .where(and(
        eq(Threads.shareToken, shareToken),
        eq(Threads.isPublic, true)
      ))
      .get();

    if (!sourceThread) {
      return new Response(JSON.stringify({
        error: 'Shared thread not found or no longer available'
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Prevent adding your own thread
    if (sourceThread.userId === userId) {
      return new Response(JSON.stringify({
        error: 'You cannot add your own thread to your Harvous'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Fetch notes from the source thread via junction table
    const sourceNotes = await db.select({
      id: Notes.id,
      title: Notes.title,
      content: Notes.content,
      noteType: Notes.noteType,
      createdAt: Notes.createdAt,
    })
    .from(Notes)
    .innerJoin(NoteThreads, eq(NoteThreads.noteId, Notes.id))
    .where(eq(NoteThreads.threadId, sourceThread.id))
    .orderBy(
      asc(sql`CASE WHEN ${Notes.lastVisited} IS NOT NULL THEN 0 ELSE 1 END`),
      desc(Notes.lastVisited),
      desc(Notes.updatedAt),
      desc(Notes.createdAt),
      asc(Notes.id)
    )
    .all();

    // Create new thread for the user
    const newThreadId = generateThreadId();
    const threadNow = new Date();

    await db.insert(Threads).values({
      id: newThreadId,
      title: sourceThread.title,
      subtitle: sourceThread.subtitle || null,
      spaceId: null,
      userId: userId,
      isPublic: false, // New copy is private by default
      color: sourceThread.color || 'paper',
      createdAt: threadNow,
      updatedAt: threadNow,
      lastVisited: threadNow,
    });

    // Award XP for thread creation (async, fire-and-forget)
    awardThreadCreatedXP(userId, newThreadId, sourceThread.title, sourceThread.subtitle || null).catch(() => {});

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

    // Create copies of all notes
    const createdNoteIds: string[] = [];
    let currentSimpleNoteId = (userMetadata?.highestSimpleNoteId || 0) + 1;

    // Capture base timestamp for staggered note creation (ensures unique lastVisited values)
    const baseTimestamp = Date.now();

    for (let noteIndex = 0; noteIndex < sourceNotes.length; noteIndex++) {
      const note = sourceNotes[noteIndex];
      // Stagger timestamps by 1ms per note to ensure unique ordering
      const noteTimestamp = new Date(baseTimestamp + noteIndex);

      const newNoteId = generateNoteId();

      await db.insert(Notes).values({
        id: newNoteId,
        title: note.title || null,
        content: note.content,
        threadId: newThreadId,
        spaceId: null,
        simpleNoteId: currentSimpleNoteId,
        noteType: note.noteType || 'default',
        userId: userId,
        isPublic: false,
        addedBy: 'shared', // Track that this came from a shared thread
        createdAt: noteTimestamp,
        lastVisited: noteTimestamp,
      });

      // Add note to thread via junction table
      const junctionId = `note-thread-${newNoteId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      try {
        await db.insert(NoteThreads).values({
          id: junctionId,
          noteId: newNoteId,
          threadId: newThreadId,
          createdAt: new Date()
        });
      } catch (junctionError: any) {
        console.error(`Error creating junction entry for note ${newNoteId}:`, junctionError);
        throw new Error(`Failed to link note to thread: ${junctionError.message}`);
      }

      // Award XP for each note (async, fire-and-forget)
      const isScriptureNote = note.noteType === 'scripture';
      awardNoteCreatedXP(userId, newNoteId, isScriptureNote, note.content || '').catch(() => {});

      createdNoteIds.push(newNoteId);
      currentSimpleNoteId++;
    }

    // Update user metadata with highest simpleNoteId
    if (sourceNotes.length > 0) {
      await db.update(UserMetadata)
        .set({
          highestSimpleNoteId: currentSimpleNoteId - 1,
          updatedAt: new Date()
        })
        .where(eq(UserMetadata.userId, userId));
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Thread added to your Harvous!',
      createdIds: {
        threadId: newThreadId,
        noteIds: createdNoteIds
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/shared/add-to-harvous',
      action: 'add_shared_thread'
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
