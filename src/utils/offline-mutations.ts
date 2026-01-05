import { 
  offlineDB, 
  type OfflineSpace, 
  type OfflineThread, 
  type OfflineNote, 
  type OfflineNoteThread, 
  type OfflineTag, 
  type OfflineNoteTag, 
  type SyncOperation, 
  ensureUserPartition 
} from './offline-db';
import { enqueueMutation } from './sync-manager';
import { generateNoteId, generateSpaceId, generateThreadId } from './ids';

/**
 * Get a preview of the next SimpleNoteId that would be allocated offline
 * This does NOT consume the ID - it's just for preview purposes
 * Returns null if no ID can be previewed (no metadata or range exhausted)
 */
export async function getNextSimpleNoteIdPreview(userId: string): Promise<number | null> {
  try {
    let userMeta = await offlineDB.userMetadata.where('userId').equals(userId).first();
    
    if (!userMeta) {
      console.log('[getNextSimpleNoteIdPreview] No user metadata found, checking local notes...');
      
      // Try to find the highest simpleNoteId from existing notes
      const notes = await offlineDB.notes.where('userId').equals(userId).toArray();
      const highestId = notes.reduce((max, note) => {
        return note.simpleNoteId && note.simpleNoteId > max ? note.simpleNoteId : max;
      }, 0);
      
      console.log('[getNextSimpleNoteIdPreview] Found highest simpleNoteId from notes:', highestId);
      
      // If we found notes, return next ID
      if (highestId > 0) {
        return highestId + 1;
      }
      
      // No notes and no metadata - return 1 as first ID
      console.log('[getNextSimpleNoteIdPreview] No notes found, returning 1 as first ID');
      return 1;
    }

    console.log('[getNextSimpleNoteIdPreview] Found user metadata:', {
      highestSimpleNoteId: userMeta.highestSimpleNoteId,
      hasReservedRange: !!userMeta.reservedSimpleNoteIdRange,
      reservedRange: userMeta.reservedSimpleNoteIdRange,
      usedReservedIds: userMeta.usedReservedIds?.length || 0
    });

    // 1. Try reserved range first (most accurate for offline preview)
    if (userMeta.reservedSimpleNoteIdRange) {
      const { start, end } = userMeta.reservedSimpleNoteIdRange;
      const usedIds = userMeta.usedReservedIds || [];
      
      // Find next available ID in range
      for (let id = start; id <= end; id++) {
        if (!usedIds.includes(id)) {
          console.log('[getNextSimpleNoteIdPreview] Found available ID in reserved range:', id);
          return id; // Return preview without consuming
        }
      }
      
      // All IDs in range are used - fall through to highestSimpleNoteId + 1
      console.log('[getNextSimpleNoteIdPreview] Reserved range exhausted, falling back to highestSimpleNoteId + 1');
    }

    // 2. Fallback to highest seen + 1 (might collide on server, but good for preview)
    // This gives a reasonable estimate when no reserved range exists or range is exhausted
    const nextId = (userMeta.highestSimpleNoteId || 0) + 1;
    console.log('[getNextSimpleNoteIdPreview] Using fallback ID:', nextId);
    return nextId;
  } catch (error) {
    console.error('[getNextSimpleNoteIdPreview] Error:', error);
    return null;
  }
}

/**
 * Get the current note count from local IndexedDB
 * This is used to check subscription limits offline
 */
export async function getLocalNoteCount(userId: string): Promise<number> {
  try {
    // Count all notes that are not deleted
    const count = await offlineDB.notes
      .where('userId')
      .equals(userId)
      .filter(note => note.syncStatus !== 'deleted')
      .count();
    return count;
  } catch (error) {
    console.error('[getLocalNoteCount] Error:', error);
    return 0;
  }
}

/**
 * Create a space offline
 */
export async function createSpaceOffline(userId: string, data: {
  title: string;
  description?: string | null;
  color?: string | null;
  backgroundGradient?: string | null;
  isPublic?: boolean;
  isActive?: boolean;
  order?: number;
}): Promise<string> {
  const localId = `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const now = Date.now();

  const space: OfflineSpace = ensureUserPartition<OfflineSpace>({
    id: localId,
    title: data.title,
    description: data.description || null,
    color: data.color || null,
    backgroundGradient: data.backgroundGradient || null,
    isPublic: data.isPublic || false,
    isActive: data.isActive !== undefined ? data.isActive : true,
    order: data.order || 0,
    syncStatus: 'pending',
    lastModified: now,
    createdAt: new Date(),
    updatedAt: new Date(),
  }, userId);

  await offlineDB.spaces.add(space);

  // Queue sync operation
  await enqueueMutation(userId, {
    operation: 'create',
    entityType: 'space',
    entityId: localId,
    data: {
      title: data.title,
      description: data.description,
      color: data.color,
      backgroundGradient: data.backgroundGradient,
      isPublic: data.isPublic,
      isActive: data.isActive,
      order: data.order,
    },
    timestamp: now,
    retryCount: 0,
  });

  return localId;
}

/**
 * Update a space offline
 */
export async function updateSpaceOffline(userId: string, spaceId: string, updates: Partial<{
  title: string;
  description: string | null;
  color: string | null;
  backgroundGradient: string | null;
  isPublic: boolean;
  isActive: boolean;
  order: number;
}>): Promise<void> {
  const space = await offlineDB.spaces.where('[userId+id]').equals([userId, spaceId]).first();
  if (!space) {
    throw new Error('Space not found');
  }

  const now = Date.now();
  await offlineDB.spaces.update(spaceId, {
    ...updates,
    syncStatus: 'pending',
    lastModified: now,
    updatedAt: new Date(),
  });

  // Queue sync operation
  await enqueueMutation(userId, {
    operation: 'update',
    entityType: 'space',
    entityId: spaceId,
    data: updates,
    timestamp: now,
    retryCount: 0,
  });
}

/**
 * Delete a space offline
 */
export async function deleteSpaceOffline(userId: string, spaceId: string): Promise<void> {
  const space = await offlineDB.spaces.where('[userId+id]').equals([userId, spaceId]).first();
  if (!space) {
    throw new Error('Space not found');
  }

  const now = Date.now();
  await offlineDB.spaces.update(spaceId, {
    syncStatus: 'deleted',
    lastModified: now,
    updatedAt: new Date(),
  });

  // Queue sync operation
  await enqueueMutation(userId, {
    operation: 'delete',
    entityType: 'space',
    entityId: spaceId,
    data: {},
    timestamp: now,
    retryCount: 0,
  });
}

/**
 * Create a thread offline
 */
export async function createThreadOffline(userId: string, data: {
  title: string;
  subtitle?: string | null;
  spaceId?: string | null;
  color?: string | null;
  isPublic?: boolean;
  isPinned?: boolean;
  order?: number;
}): Promise<string> {
  const localId = `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const now = Date.now();

  console.log('[createThreadOffline] Creating thread with color:', { 
    localId, 
    color: data.color, 
    title: data.title 
  });

  const thread: OfflineThread = ensureUserPartition<OfflineThread>({
    id: localId,
    title: data.title,
    subtitle: data.subtitle || null,
    spaceId: data.spaceId || null,
    color: data.color || null,
    isPublic: data.isPublic || false,
    isPinned: data.isPinned || false,
    order: data.order || 0,
    lastVisited: null,
    syncStatus: 'pending',
    lastModified: now,
    createdAt: new Date(),
    updatedAt: new Date(),
  }, userId);

  await offlineDB.threads.add(thread);
  
  // Verify color was stored correctly
  const stored = await offlineDB.threads.where('[userId+id]').equals([userId, localId]).first();
  console.log('[createThreadOffline] Thread stored in IndexedDB:', { 
    id: stored?.id, 
    color: stored?.color,
    storedCorrectly: stored?.color === data.color 
  });

  // Queue sync operation
  const mutationData = {
    title: data.title,
    subtitle: data.subtitle,
    spaceId: data.spaceId,
    color: data.color,
    isPublic: data.isPublic,
    isPinned: data.isPinned,
    order: data.order,
  };
  
  console.log('[createThreadOffline] Queuing mutation with color:', { 
    operation: 'create',
    entityType: 'thread',
    entityId: localId,
    color: mutationData.color 
  });
  
  await enqueueMutation(userId, {
    operation: 'create',
    entityType: 'thread',
    entityId: localId,
    data: mutationData,
    timestamp: now,
    retryCount: 0,
  });

  return localId;
}

/**
 * Update a thread offline
 */
export async function updateThreadOffline(userId: string, threadId: string, updates: Partial<{
  title: string;
  subtitle: string | null;
  spaceId: string | null;
  color: string | null;
  isPublic: boolean;
  isPinned: boolean;
  order: number;
}>): Promise<void> {
  const thread = await offlineDB.threads.where('[userId+id]').equals([userId, threadId]).first();
  if (!thread) {
    throw new Error('Thread not found');
  }

  const now = Date.now();
  await offlineDB.threads.update(threadId, {
    ...updates,
    syncStatus: 'pending',
    lastModified: now,
    updatedAt: new Date(),
  });

  // Queue sync operation
  await enqueueMutation(userId, {
    operation: 'update',
    entityType: 'thread',
    entityId: threadId,
    data: updates,
    timestamp: now,
    retryCount: 0,
  });
}

/**
 * Delete a thread offline
 */
export async function deleteThreadOffline(userId: string, threadId: string): Promise<void> {
  const thread = await offlineDB.threads.where('[userId+id]').equals([userId, threadId]).first();
  if (!thread) {
    throw new Error('Thread not found');
  }

  const now = Date.now();
  await offlineDB.threads.update(threadId, {
    syncStatus: 'deleted',
    lastModified: now,
    updatedAt: new Date(),
  });

  // Queue sync operation
  await enqueueMutation(userId, {
    operation: 'delete',
    entityType: 'thread',
    entityId: threadId,
    data: {},
    timestamp: now,
    retryCount: 0,
  });
}

/**
 * Create a note offline
 */
export async function createNoteOffline(userId: string, data: {
  title?: string | null;
  content: string;
  threadId?: string;
  spaceId?: string | null;
  simpleNoteId?: number | null; // Will be allocated from reserved range if available
  noteType?: 'default' | 'scripture' | 'resource';
  addedBy?: string;
  isPublic?: boolean;
  isFeatured?: boolean;
  order?: number;
}): Promise<string> {
  const localId = `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const now = Date.now();

  // Get user metadata to check reserved ID range
  const userMeta = await offlineDB.userMetadata.where('userId').equals(userId).first();
  let simpleNoteId: number | null = data.simpleNoteId || null;

  // If no simpleNoteId provided, try to allocate from reserved range
  if (!simpleNoteId && userMeta?.reservedSimpleNoteIdRange) {
    const { start, end } = userMeta.reservedSimpleNoteIdRange;
    const usedIds = userMeta.usedReservedIds || [];
    
    // Find next available ID in range
    for (let id = start; id <= end; id++) {
      if (!usedIds.includes(id)) {
        simpleNoteId = id;
        // Mark as used
        await offlineDB.userMetadata.update(userMeta.id, {
          usedReservedIds: [...usedIds, id],
        });
        break;
      }
    }
    
    // If all IDs in range are used, simpleNoteId remains null
    // Server will assign one on sync
  } else if (!simpleNoteId && userMeta) {
    // No reserved range - use highestSimpleNoteId + 1 for preview
    // This is just for preview - server will assign actual ID on sync
    const currentHighest = userMeta.highestSimpleNoteId || 0;
    simpleNoteId = currentHighest + 1;
    console.log('[createNoteOffline] No reserved range, using preview ID:', simpleNoteId);
  }

  const note: OfflineNote = ensureUserPartition<OfflineNote>({
    id: localId,
    title: data.title || null,
    content: data.content,
    threadId: data.threadId || 'thread_unorganized',
    spaceId: data.spaceId || null,
    simpleNoteId,
    noteType: data.noteType || 'default',
    addedBy: data.addedBy || 'user',
    isPublic: data.isPublic || false,
    isFeatured: data.isFeatured || false,
    order: data.order || 0,
    lastVisited: null,
    syncStatus: 'pending',
    lastModified: now,
    createdAt: new Date(),
    updatedAt: new Date(),
  }, userId);

  await offlineDB.notes.add(note);

  // Update highestSimpleNoteId if we allocated an ID (for preview purposes)
  // Note: This is just for local preview - server will assign actual ID on sync
  if (simpleNoteId && userMeta) {
    const currentHighest = userMeta.highestSimpleNoteId || 0;
    if (simpleNoteId > currentHighest) {
      await offlineDB.userMetadata.update(userMeta.id, {
        highestSimpleNoteId: simpleNoteId,
      });
      console.log('[createNoteOffline] Updated highestSimpleNoteId for preview:', { old: currentHighest, new: simpleNoteId });
    }
  }

  // Create NoteThread relationship if threadId is provided
  if (data.threadId && data.threadId !== 'thread_unorganized') {
    const noteThreadId = `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const noteThread: OfflineNoteThread = ensureUserPartition<OfflineNoteThread>({
      id: noteThreadId,
      noteId: localId,
      threadId: data.threadId,
      syncStatus: 'pending',
      lastModified: now,
      createdAt: new Date(),
      updatedAt: null,
    }, userId);

    await offlineDB.noteThreads.add(noteThread);

    // Queue sync operation for NoteThread
    await enqueueMutation(userId, {
      operation: 'create',
      entityType: 'noteThread',
      entityId: noteThreadId,
      data: {
        noteId: localId,
        threadId: data.threadId,
      },
      timestamp: now,
      retryCount: 0,
    });
  }

  // Queue sync operation for note
  await enqueueMutation(userId, {
    operation: 'create',
    entityType: 'note',
    entityId: localId,
    data: {
      title: data.title,
      content: data.content,
      threadId: data.threadId || 'thread_unorganized',
      spaceId: data.spaceId,
      simpleNoteId,
      noteType: data.noteType || 'default',
      addedBy: data.addedBy || 'user',
      isPublic: data.isPublic,
      isFeatured: data.isFeatured,
      order: data.order,
    },
    timestamp: now,
    retryCount: 0,
  });

  return localId;
}

/**
 * Update a note offline
 */
export async function updateNoteOffline(userId: string, noteId: string, updates: Partial<{
  title: string | null;
  content: string;
  spaceId: string | null;
  isPublic: boolean;
  isFeatured: boolean;
  order: number;
}>): Promise<void> {
  const note = await offlineDB.notes.where('[userId+id]').equals([userId, noteId]).first();
  if (!note) {
    throw new Error('Note not found');
  }

  const now = Date.now();
  await offlineDB.notes.update(noteId, {
    ...updates,
    syncStatus: 'pending',
    lastModified: now,
    updatedAt: new Date(),
  });

  // Queue sync operation
  await enqueueMutation(userId, {
    operation: 'update',
    entityType: 'note',
    entityId: noteId,
    data: updates,
    timestamp: now,
    retryCount: 0,
  });
}

/**
 * Delete a note offline
 */
export async function deleteNoteOffline(userId: string, noteId: string): Promise<void> {
  const note = await offlineDB.notes.where('[userId+id]').equals([userId, noteId]).first();
  if (!note) {
    throw new Error('Note not found');
  }

  const now = Date.now();
  await offlineDB.notes.update(noteId, {
    syncStatus: 'deleted',
    lastModified: now,
    updatedAt: new Date(),
  });

  // Queue sync operation
  await enqueueMutation(userId, {
    operation: 'delete',
    entityType: 'note',
    entityId: noteId,
    data: {},
    timestamp: now,
    retryCount: 0,
  });
}

/**
 * Link a note to a thread offline
 */
export async function linkNoteToThreadOffline(userId: string, noteId: string, threadId: string): Promise<string> {
  // Check if relationship already exists
  const existing = await offlineDB.noteThreads
    .where('[userId+noteId+threadId]')
    .equals([userId, noteId, threadId])
    .first();

  if (existing) {
    return existing.id; // Already linked
  }

  const localId = `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const now = Date.now();

  const noteThread: OfflineNoteThread = ensureUserPartition<OfflineNoteThread>({
    id: localId,
    noteId,
    threadId,
    syncStatus: 'pending',
    lastModified: now,
    createdAt: new Date(),
    updatedAt: null,
  }, userId);

  await offlineDB.noteThreads.add(noteThread);

  // Queue sync operation
  await enqueueMutation(userId, {
    operation: 'create',
    entityType: 'noteThread',
    entityId: localId,
    data: {
      noteId,
      threadId,
    },
    timestamp: now,
    retryCount: 0,
  });

  return localId;
}

/**
 * Unlink a note from a thread offline
 */
export async function unlinkNoteFromThreadOffline(userId: string, noteId: string, threadId: string): Promise<void> {
  const noteThread = await offlineDB.noteThreads
    .where('[userId+noteId+threadId]')
    .equals([userId, noteId, threadId])
    .first();

  if (!noteThread) {
    throw new Error('Note-thread relationship not found');
  }

  const now = Date.now();

  // If synced, queue delete operation; if pending, just delete locally
  if (noteThread.syncStatus === 'synced') {
    await offlineDB.noteThreads.update(noteThread.id, {
      syncStatus: 'deleted',
      lastModified: now,
    });

    // Queue sync operation
    await enqueueMutation(userId, {
      operation: 'delete',
      entityType: 'noteThread',
      entityId: noteThread.id,
      data: {
        noteId,
        threadId,
      },
      timestamp: now,
      retryCount: 0,
    });
  } else {
    // Pending operation - just delete locally
    await offlineDB.noteThreads.delete(noteThread.id);
  }
}

