import type { APIRoute } from 'astro';
import { db, InboxItems, InboxItemNotes, UserInboxItems, Notes, Threads, UserMetadata, NoteThreads, eq, and, desc, isNotNull } from 'astro:db';
import { generateNoteId, generateThreadId } from '@/utils/ids';
import { awardNoteCreatedXP, awardThreadCreatedXP } from '@/utils/xp-system';
import { getInboxItemWithNotes } from '@/utils/inbox-data';
import { THREAD_COLORS, getRandomThreadColor } from '@/utils/colors';

// Reverse color mapping: convert long color names (from Webflow) to short names (for Threads)
const REVERSE_COLOR_MAP: Record<string, string> = {
  'blessed-blue': 'blue',
  'graceful-gold': 'yellow',
  'mindful-mint': 'green',
  'pleasant-peach': 'orange',
  'peaceful-pink': 'pink',
  'lovely-lavender': 'purple',
  'paper': 'paper',
  // Also handle short names directly
  'blue': 'blue',
  'yellow': 'yellow',
  'green': 'green',
  'orange': 'orange',
  'pink': 'pink',
  'purple': 'purple',
};

// Convert inbox color to thread color format
function convertInboxColorToThreadColor(inboxColor: string | null | undefined): string | null {
  if (!inboxColor) return null;
  
  // Check if it's already a valid thread color
  if (THREAD_COLORS.includes(inboxColor as any)) {
    return inboxColor;
  }
  
  // Try to map from long format to short format
  const mappedColor = REVERSE_COLOR_MAP[inboxColor.toLowerCase()];
  if (mappedColor && THREAD_COLORS.includes(mappedColor as any)) {
    return mappedColor;
  }
  
  // If no valid mapping found, return null (will use default/random)
  return null;
}

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
    const { inboxItemId, targetThreadId, targetSpaceId } = body;

    if (!inboxItemId) {
      return new Response(JSON.stringify({ error: 'inboxItemId is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get inbox item with notes
    const inboxItem = await getInboxItemWithNotes(inboxItemId);
    
    if (!inboxItem) {
      return new Response(JSON.stringify({ error: 'Inbox item not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Check if user has access to this inbox item
    const userInboxItem = await db
      .select()
      .from(UserInboxItems)
      .where(
        and(
          eq(UserInboxItems.userId, userId),
          eq(UserInboxItems.inboxItemId, inboxItemId)
        )
      )
      .get();

    if (!userInboxItem) {
      return new Response(JSON.stringify({ error: 'Inbox item not found in your inbox' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Ensure unorganized thread exists
    const { ensureUnorganizedThread } = await import('@/utils/unorganized-thread');
    await ensureUnorganizedThread(userId);

    const createdIds: { threadId?: string; noteIds: string[] } = { noteIds: [] };

    if (inboxItem.contentType === 'note') {
      // Create a copy of the note
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
      
      const newNote = await db.insert(Notes)
        .values({
          id: generateNoteId(),
          title: inboxItem.title || null,
          content: inboxItem.content || '',
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

      createdIds.noteIds.push(newNote.id);

    } else if (inboxItem.contentType === 'thread') {
      // Create a copy of the thread and all its notes
      const newThreadId = generateThreadId();
      
      // Convert inbox color format to thread color format
      const threadColor = convertInboxColorToThreadColor(inboxItem.color) || getRandomThreadColor();
      
      const newThread = await db.insert(Threads)
        .values({
          id: newThreadId,
          title: inboxItem.title,
          subtitle: inboxItem.subtitle || null,
          spaceId: targetSpaceId || null,
          userId: userId,
          isPublic: false,
          color: threadColor,
          createdAt: new Date(),
        })
        .returning()
        .get();

      // Award XP for thread creation (pass title for validation)
      await awardThreadCreatedXP(userId, newThreadId, newThread.title, newThread.subtitle || null);

      createdIds.threadId = newThreadId;

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

      // Create copies of all notes in the thread
      const notes = inboxItem.notes || [];
      let currentSimpleNoteId = (userMetadata?.highestSimpleNoteId || 0) + 1;

      for (const note of notes) {
        const newNote = await db.insert(Notes)
          .values({
            id: generateNoteId(),
            title: note.title || null,
            content: note.content,
            threadId: newThreadId,
            spaceId: targetSpaceId || null,
            simpleNoteId: currentSimpleNoteId,
            userId: userId,
            isPublic: false,
            createdAt: new Date(),
          })
          .returning()
          .get();

        // Add note to thread via junction table (required for notes to appear in thread)
        // Use unique ID based on note ID and timestamp to avoid collisions
        const junctionId = `note-thread-${newNote.id}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        try {
          await db.insert(NoteThreads).values({
            id: junctionId,
            noteId: newNote.id,
            threadId: newThreadId,
            createdAt: new Date()
          });
          console.log(`✅ Created junction entry: note ${newNote.id} -> thread ${newThreadId}`);
          
          // Verify the junction entry was created
          const verifyJunction = await db
            .select()
            .from(NoteThreads)
            .where(and(
              eq(NoteThreads.noteId, newNote.id),
              eq(NoteThreads.threadId, newThreadId)
            ))
            .get();
          
          if (!verifyJunction) {
            console.error(`❌ Junction entry verification failed: note ${newNote.id} -> thread ${newThreadId}`);
          }
        } catch (junctionError: any) {
          console.error(`❌ Error creating junction entry for note ${newNote.id}:`, junctionError);
          // Re-throw the error to fail the operation - notes must be properly linked
          throw new Error(`Failed to link note to thread: ${junctionError.message}`);
        }

        // Award XP for each note (check if scripture note by checking noteType)
        const isScriptureNote = newNote.noteType === 'scripture';
        await awardNoteCreatedXP(userId, newNote.id, isScriptureNote, newNote.content || '');

        createdIds.noteIds.push(newNote.id);
        currentSimpleNoteId++;
      }

      // Update user metadata with highest simpleNoteId
      await db.update(UserMetadata)
        .set({ 
          highestSimpleNoteId: currentSimpleNoteId - 1,
          updatedAt: new Date()
        })
        .where(eq(UserMetadata.userId, userId));

      // Update thread's updatedAt timestamp after adding all notes
      await db.update(Threads)
        .set({ updatedAt: new Date() })
        .where(and(eq(Threads.id, newThreadId), eq(Threads.userId, userId)));
    }

    // Update UserInboxItems status to 'added'
    await db.update(UserInboxItems)
      .set({
        status: 'added',
        addedAt: new Date(),
      })
      .where(
        and(
          eq(UserInboxItems.userId, userId),
          eq(UserInboxItems.inboxItemId, inboxItemId)
        )
      );

    return new Response(JSON.stringify({
      success: true,
      message: inboxItem.contentType === 'thread' 
        ? 'Thread added to your Harvous successfully!' 
        : 'Note added to your Harvous successfully!',
      createdIds,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (error: any) {
    console.error('Error adding inbox item to Harvous:', error);
    return new Response(JSON.stringify({ 
      error: 'Failed to add inbox item to Harvous',
      details: error.message 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};

