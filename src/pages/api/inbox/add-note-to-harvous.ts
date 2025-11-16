import type { APIRoute } from 'astro';
import { db, InboxItemNotes, Notes, UserMetadata, eq, and, desc, isNotNull } from 'astro:db';
import { generateNoteId } from '@/utils/ids';
import { awardNoteCreatedXP } from '@/utils/xp-system';
import { ensureUnorganizedThread } from '@/utils/unorganized-thread';

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
    const { inboxItemNoteId, targetThreadId, targetSpaceId } = body;

    if (!inboxItemNoteId) {
      return new Response(JSON.stringify({ error: 'inboxItemNoteId is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get the inbox item note
    const inboxNote = await db
      .select()
      .from(InboxItemNotes)
      .where(eq(InboxItemNotes.id, inboxItemNoteId))
      .get();

    if (!inboxNote) {
      return new Response(JSON.stringify({ error: 'Inbox note not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Ensure unorganized thread exists
    await ensureUnorganizedThread(userId);

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
        createdAt: new Date(),
        updatedAt: null
      };
    }
    
    const nextSimpleNoteId = (userMetadata?.highestSimpleNoteId || 0) + 1;
    
    // Use targetThreadId if provided, otherwise use unorganized
    const finalThreadId = targetThreadId || 'thread_unorganized';
    
    // Create the note in user's Harvous
    const newNote = await db.insert(Notes)
      .values({
        id: generateNoteId(),
        title: inboxNote.title || null,
        content: inboxNote.content,
        threadId: finalThreadId,
        spaceId: targetSpaceId || null,
        simpleNoteId: nextSimpleNoteId,
        userId: userId,
        isPublic: false,
        createdAt: new Date(),
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

    // Award XP (check if scripture note by checking noteType)
    const isScriptureNote = newNote.noteType === 'scripture';
    await awardNoteCreatedXP(userId, newNote.id, isScriptureNote, newNote.content || '');

    return new Response(JSON.stringify({
      success: true,
      message: 'Note added to your Harvous successfully!',
      noteId: newNote.id,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Error adding inbox note to Harvous:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to add note to Harvous',
      details: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

