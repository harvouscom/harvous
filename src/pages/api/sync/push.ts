import type { APIRoute } from 'astro';
import { db, Spaces, Threads, Notes, NoteThreads, Tags, NoteTags, UserMetadata, eq, and } from 'astro:db';
import { handleAPIError } from '@/utils/error-handling';
import { serverErrorResponse, errorResponse } from '@/utils/api-responses';
import { generateNoteId, generateThreadId, generateSpaceId } from '@/utils/ids';

import { verifyToken } from '@clerk/backend';

export const prerender = false;

/**
 * Batch push endpoint for offline mutations
 * Processes queued mutations from client
 */
export const POST: APIRoute = async ({ request, locals }) => {
  try {
    let userId: string | null = null;

    // SSR Mode: Use middleware auth
    if (locals?.auth) {
      const auth = locals.auth();
      userId = auth.userId || null;
    }
    // Static/Capacitor Mode: Verify JWT from Authorization header
    else {
      const authHeader = request.headers.get('Authorization');
      if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        try {
          const verified = await verifyToken(token, {
            secretKey: import.meta.env.CLERK_SECRET_KEY
          });
          userId = verified.sub;
        } catch (error) {
          console.error('[API Auth] Token verification failed:', error);
        }
      }
    }

    if (!userId) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const body = await request.json();
    const { mutations } = body;

    if (!Array.isArray(mutations) || mutations.length === 0) {
      return errorResponse('mutations array is required', 'INVALID_REQUEST', 400);
    }

    const results: Array<{ success: boolean; operationId?: number; entityId?: string; serverId?: string; error?: string }> = [];

    // Process mutations sequentially to maintain order
    for (const mutation of mutations) {
      try {
        const { operation, entityType, entityId, data, operationId } = mutation;

        let result: any = { success: false, operationId };

        switch (entityType) {
          case 'space':
            result = await processSpaceMutation(userId, operation, entityId, data);
            break;
          case 'thread':
            result = await processThreadMutation(userId, operation, entityId, data);
            break;
          case 'note':
            result = await processNoteMutation(userId, operation, entityId, data);
            break;
          case 'noteThread':
            result = await processNoteThreadMutation(userId, operation, entityId, data);
            break;
          case 'tag':
            result = await processTagMutation(userId, operation, entityId, data);
            break;
          case 'noteTag':
            result = await processNoteTagMutation(userId, operation, entityId, data);
            break;
          default:
            result = { success: false, error: `Unknown entity type: ${entityType}` };
        }

        results.push({ ...result, operationId });
      } catch (error) {
        results.push({
          success: false,
          operationId: mutation.operationId,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return new Response(JSON.stringify({ results }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'private, no-cache',
      }
    });

  } catch (error) {
    const standardError = handleAPIError(error, {
      endpoint: '/api/sync/push',
      action: 'push_sync'
    });
    return serverErrorResponse(standardError.message, standardError.code);
  }
};

// Space mutation handlers
async function processSpaceMutation(userId: string, operation: string, entityId: string, data: any) {
  if (operation === 'create') {
    const newSpace = await db.insert(Spaces).values({
      id: entityId.startsWith('local_') ? generateSpaceId() : entityId,
      title: data.title,
      description: data.description || null,
      color: data.color || null,
      backgroundGradient: data.backgroundGradient || null,
      isPublic: data.isPublic || false,
      isActive: data.isActive !== undefined ? data.isActive : true,
      order: data.order || 0,
      userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning().get();

    return { success: true, entityId, serverId: newSpace.id };
  } else if (operation === 'update') {
    const existing = await db.select().from(Spaces).where(and(eq(Spaces.id, entityId), eq(Spaces.userId, userId))).get();
    if (!existing) {
      return { success: false, error: 'Space not found' };
    }

    await db.update(Spaces)
      .set({
        title: data.title,
        description: data.description,
        color: data.color,
        backgroundGradient: data.backgroundGradient,
        isPublic: data.isPublic,
        isActive: data.isActive,
        order: data.order,
        updatedAt: new Date(),
      })
      .where(eq(Spaces.id, entityId));

    return { success: true, entityId, serverId: entityId };
  } else if (operation === 'delete') {
    await db.update(Spaces)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(Spaces.id, entityId), eq(Spaces.userId, userId)));

    return { success: true, entityId, serverId: entityId };
  }

  return { success: false, error: `Unknown operation: ${operation}` };
}

// Thread mutation handlers
async function processThreadMutation(userId: string, operation: string, entityId: string, data: any) {
  console.log('[processThreadMutation] Processing thread mutation:', {
    operation,
    entityId,
    color: data.color,
    title: data.title
  });
  
  if (operation === 'create') {
    const threadData = {
      id: entityId.startsWith('local_') ? generateThreadId() : entityId,
      title: data.title,
      subtitle: data.subtitle || null,
      spaceId: data.spaceId || null,
      color: data.color || null,
      isPublic: data.isPublic || false,
      isPinned: data.isPinned || false,
      order: data.order || 0,
      userId,
      createdAt: new Date(),
      updatedAt: new Date(),
      // Set lastVisited so new threads appear at top (matches server-side thread creation)
      lastVisited: data.lastVisited ? new Date(data.lastVisited) : new Date(),
    };
    
    console.log('[processThreadMutation] Inserting thread with color:', {
      color: threadData.color,
      title: threadData.title
    });
    
    const newThread = await db.insert(Threads).values(threadData).returning().get();

    console.log('[processThreadMutation] Thread created on server:', {
      serverId: newThread.id,
      color: newThread.color,
      title: newThread.title
    });

    return { success: true, entityId, serverId: newThread.id, data: { color: newThread.color } };
  } else if (operation === 'update') {
    const existing = await db.select().from(Threads).where(and(eq(Threads.id, entityId), eq(Threads.userId, userId))).get();
    if (!existing) {
      return { success: false, error: 'Thread not found' };
    }

    await db.update(Threads)
      .set({
        title: data.title,
        subtitle: data.subtitle,
        spaceId: data.spaceId,
        color: data.color,
        isPublic: data.isPublic,
        isPinned: data.isPinned,
        order: data.order,
        updatedAt: new Date(),
        // Sync lastVisited if provided (preserves visit history across devices)
        ...(data.lastVisited && { lastVisited: new Date(data.lastVisited) }),
      })
      .where(eq(Threads.id, entityId));

    return { success: true, entityId, serverId: entityId, data: { color: data.color } };
  } else if (operation === 'delete') {
    // Thread deletion logic (move notes to unorganized, etc.)
    // Simplified for now - just mark as deleted conceptually
    return { success: true, entityId, serverId: entityId };
  }

  return { success: false, error: `Unknown operation: ${operation}` };
}

// Note mutation handlers
async function processNoteMutation(userId: string, operation: string, entityId: string, data: any) {
  if (operation === 'create') {
    // Get next simpleNoteId from UserMetadata
    const userMeta = await db.select().from(UserMetadata).where(eq(UserMetadata.userId, userId)).get();
    const nextSimpleNoteId = (userMeta?.highestSimpleNoteId || 0) + 1;

    let threadId = data.threadId || 'thread_unorganized';
    
    // If threadId is a local ID, try to find the synced thread
    // This shouldn't happen if mutations are sorted, but handle gracefully
    if (threadId.startsWith('local_')) {
      // Note: We can't query by old local ID directly, so this is a fallback
      // In practice, mutations should be sorted so threads sync first
      // If we can't find it, default to unorganized
      console.warn(`[processNoteMutation] Thread ${threadId} is a local ID, using unorganized as fallback`);
      threadId = 'thread_unorganized';
    }

    const newNote = await db.insert(Notes).values({
      id: entityId.startsWith('local_') ? generateNoteId() : entityId,
      title: data.title || null,
      content: data.content,
      threadId: threadId,
      spaceId: data.spaceId || null,
      simpleNoteId: data.simpleNoteId || nextSimpleNoteId,
      noteType: data.noteType || 'default',
      addedBy: data.addedBy || 'user',
      isPublic: data.isPublic || false,
      isFeatured: data.isFeatured || false,
      order: data.order || 0,
      userId,
      createdAt: new Date(),
      updatedAt: new Date(),
      // Set lastVisited so new notes appear at top (matches server-side note creation)
      lastVisited: data.lastVisited ? new Date(data.lastVisited) : new Date(),
    }).returning().get();

    // Update highestSimpleNoteId
    if (userMeta) {
      await db.update(UserMetadata)
        .set({ highestSimpleNoteId: nextSimpleNoteId, updatedAt: new Date() })
        .where(eq(UserMetadata.userId, userId));
    }

    // Create NoteThread relationship if threadId is provided
    if (threadId && threadId !== 'thread_unorganized') {
      await db.insert(NoteThreads).values({
        id: generateNoteId(),
        noteId: newNote.id,
        threadId: threadId,
        createdAt: new Date(),
      });
    }

    return { success: true, entityId, serverId: newNote.id };
  } else if (operation === 'update') {
    const existing = await db.select().from(Notes).where(and(eq(Notes.id, entityId), eq(Notes.userId, userId))).get();
    if (!existing) {
      return { success: false, error: 'Note not found' };
    }

    await db.update(Notes)
      .set({
        title: data.title,
        content: data.content,
        spaceId: data.spaceId,
        isPublic: data.isPublic,
        isFeatured: data.isFeatured,
        order: data.order,
        updatedAt: new Date(),
        // Sync lastVisited if provided (preserves visit history across devices)
        ...(data.lastVisited && { lastVisited: new Date(data.lastVisited) }),
      })
      .where(eq(Notes.id, entityId));

    return { success: true, entityId, serverId: entityId };
  } else if (operation === 'delete') {
    // Note deletion logic (move to unorganized, etc.)
    return { success: true, entityId, serverId: entityId };
  }

  return { success: false, error: `Unknown operation: ${operation}` };
}

// NoteThread mutation handlers
async function processNoteThreadMutation(userId: string, operation: string, entityId: string, data: any) {
  if (operation === 'create') {
    // Verify note belongs to user
    const note = await db.select().from(Notes).where(and(eq(Notes.id, data.noteId), eq(Notes.userId, userId))).get();
    if (!note) {
      return { success: false, error: 'Note not found' };
    }

    // Check if relationship already exists (may have been created by note mutation)
    const existing = await db.select()
      .from(NoteThreads)
      .where(and(eq(NoteThreads.noteId, data.noteId), eq(NoteThreads.threadId, data.threadId)))
      .get();
    
    if (existing) {
      // Relationship already exists, return success with existing ID
      return { success: true, entityId, serverId: existing.id };
    }

    const newNoteThread = await db.insert(NoteThreads).values({
      id: entityId.startsWith('local_') ? generateNoteId() : entityId,
      noteId: data.noteId,
      threadId: data.threadId,
      createdAt: new Date(),
    }).returning().get();

    return { success: true, entityId, serverId: newNoteThread.id };
  } else if (operation === 'delete') {
    // Verify note belongs to user before deleting relationship
    const note = await db.select().from(Notes).where(and(eq(Notes.id, data.noteId), eq(Notes.userId, userId))).get();
    if (!note) {
      return { success: false, error: 'Note not found' };
    }

    await db.delete(NoteThreads)
      .where(and(eq(NoteThreads.noteId, data.noteId), eq(NoteThreads.threadId, data.threadId)));

    return { success: true, entityId, serverId: entityId };
  }

  return { success: false, error: `Unknown operation: ${operation}` };
}

// Tag mutation handlers
async function processTagMutation(userId: string, operation: string, entityId: string, data: any) {
  if (operation === 'create') {
    const newTag = await db.insert(Tags).values({
      id: entityId.startsWith('local_') ? generateNoteId() : entityId,
      name: data.name,
      color: data.color || null,
      category: data.category || null,
      isSystem: data.isSystem || false,
      userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    }).returning().get();

    return { success: true, entityId, serverId: newTag.id };
  } else if (operation === 'update') {
    const existing = await db.select().from(Tags).where(and(eq(Tags.id, entityId), eq(Tags.userId, userId))).get();
    if (!existing) {
      return { success: false, error: 'Tag not found' };
    }

    await db.update(Tags)
      .set({
        name: data.name,
        color: data.color,
        category: data.category,
        updatedAt: new Date(),
      })
      .where(eq(Tags.id, entityId));

    return { success: true, entityId, serverId: entityId };
  } else if (operation === 'delete') {
    await db.delete(Tags)
      .where(and(eq(Tags.id, entityId), eq(Tags.userId, userId)));

    return { success: true, entityId, serverId: entityId };
  }

  return { success: false, error: `Unknown operation: ${operation}` };
}

// NoteTag mutation handlers
async function processNoteTagMutation(userId: string, operation: string, entityId: string, data: any) {
  if (operation === 'create') {
    // Verify note belongs to user
    const note = await db.select().from(Notes).where(and(eq(Notes.id, data.noteId), eq(Notes.userId, userId))).get();
    if (!note) {
      return { success: false, error: 'Note not found' };
    }

    const newNoteTag = await db.insert(NoteTags).values({
      id: entityId.startsWith('local_') ? generateNoteId() : entityId,
      noteId: data.noteId,
      tagId: data.tagId,
      isAutoGenerated: data.isAutoGenerated || false,
      confidence: data.confidence || null,
      createdAt: new Date(),
    }).returning().get();

    return { success: true, entityId, serverId: newNoteTag.id };
  } else if (operation === 'delete') {
    // Verify note belongs to user
    const note = await db.select().from(Notes).where(and(eq(Notes.id, data.noteId), eq(Notes.userId, userId))).get();
    if (!note) {
      return { success: false, error: 'Note not found' };
    }

    await db.delete(NoteTags)
      .where(and(eq(NoteTags.noteId, data.noteId), eq(NoteTags.tagId, data.tagId)));

    return { success: true, entityId, serverId: entityId };
  }

  return { success: false, error: `Unknown operation: ${operation}` };
}

