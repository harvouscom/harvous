import { offlineDB, OfflineSpace, OfflineThread, OfflineNote, OfflineNoteThread, OfflineTag, OfflineNoteTag, SyncOperation, ensureUserPartition } from './offline-db';
import { enqueueMutation } from './sync-manager';
import { generateNoteId, generateSpaceId, generateThreadId } from './ids';

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

  // Queue sync operation
  await enqueueMutation(userId, {
    operation: 'create',
    entityType: 'thread',
    entityId: localId,
    data: {
      title: data.title,
      subtitle: data.subtitle,
      spaceId: data.spaceId,
      color: data.color,
      isPublic: data.isPublic,
      isPinned: data.isPinned,
      order: data.order,
    },
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

