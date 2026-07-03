import { 
  offlineDB, 
  type OfflineSpace, 
  type OfflineThread, 
  type OfflineNote, 
  type OfflineNoteThread, 
  type OfflineTag, 
  type OfflineNoteTag, 
  type OfflineUserMetadata,
  type SyncOperation, 
  ensureUserPartition 
} from './offline-db';
import { enqueueMutation } from './sync-manager';
import { filterThreadClusterEdgesForRemoval } from './thread-cluster-bulk-actions';
import { cacheHighestSimpleNoteId, getCachedHighestSimpleNoteId } from './offline-db';
import { getCurrentSeason } from './season-helpers';
import { generateNoteId, generateSpaceId, generateThreadId } from './ids';
import { isOfflineModeEnabled } from './offline-mode';

// Re-export from offline-db so existing consumers don't need to change imports
export { cacheHighestSimpleNoteId, getCachedHighestSimpleNoteId };

/**
 * Get a preview of the next SimpleNoteId that would be allocated offline
 * This does NOT consume the ID - it's just for preview purposes
 * Returns null if no ID can be previewed (no metadata or range exhausted)
 */
export async function getNextSimpleNoteIdPreview(userId: string): Promise<number | null> {
  try {
    let userMeta = await offlineDB.userMetadata.where('userId').equals(userId).first();
    
    if (!userMeta) {
      
      // Try to find the highest simpleNoteId from existing notes
      const notes = await offlineDB.notes.where('userId').equals(userId).toArray();
      const highestId = notes.reduce((max, note) => {
        return note.simpleNoteId && note.simpleNoteId > max ? note.simpleNoteId : max;
      }, 0);
      
      
      // If we found notes, return next ID
      if (highestId > 0) {
        return highestId + 1;
      }
      
      // No notes and no metadata - return 1 as first ID
      return 1;
    }

    // 1. Try reserved range first (most accurate for offline preview)
    if (userMeta.reservedSimpleNoteIdRange) {
      const { start, end } = userMeta.reservedSimpleNoteIdRange;
      const usedIds = userMeta.usedReservedIds || [];
      
      // Find next available ID in range
      for (let id = start; id <= end; id++) {
        if (!usedIds.includes(id)) {
          return id; // Return preview without consuming
        }
      }
      
      // All IDs in range are used - fall through to highestSimpleNoteId + 1
    }

    // 2. Fallback to highest seen + 1 (might collide on server, but good for preview)
    // This gives a reasonable estimate when no reserved range exists or range is exhausted
    const nextId = (userMeta.highestSimpleNoteId || 0) + 1;
    return nextId;
  } catch (error) {
    console.error('[getNextSimpleNoteIdPreview] Error:', error);
    return null;
  }
}

/**
 * Get the current note count from local IndexedDB (e.g. ID preview fallbacks).
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
  if (!isOfflineModeEnabled()) {
    throw new Error('Offline mode is disabled. Please enable the offline-mode-enabled feature flag.');
  }

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
  if (!isOfflineModeEnabled()) {
    throw new Error('Offline mode is disabled. Please enable the offline-mode-enabled feature flag.');
  }

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
  });
}

/**
 * Delete a space offline
 */
export async function deleteSpaceOffline(userId: string, spaceId: string): Promise<void> {
  if (!isOfflineModeEnabled()) {
    throw new Error('Offline mode is disabled. Please enable the offline-mode-enabled feature flag.');
  }

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
  if (!isOfflineModeEnabled()) {
    throw new Error('Offline mode is disabled. Please enable the offline-mode-enabled feature flag.');
  }

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
    lastVisited: new Date(), // Set so new offline items appear at top (matches server-side behavior)
    syncStatus: 'pending',
    lastModified: now,
    createdAt: new Date(),
    updatedAt: new Date(),
  }, userId);

  await offlineDB.threads.add(thread);

  // Queue sync operation
  const mutationData = {
    title: data.title,
    subtitle: data.subtitle,
    spaceId: data.spaceId,
    color: data.color,
    isPublic: data.isPublic,
    isPinned: data.isPinned,
    order: data.order,
    // Include lastVisited so server stores it (fixes order reset on sync)
    lastVisited: new Date().toISOString(),
  };

  await enqueueMutation(userId, {
    operation: 'create',
    entityType: 'thread',
    entityId: localId,
    data: mutationData,
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
  if (!isOfflineModeEnabled()) {
    throw new Error('Offline mode is disabled. Please enable the offline-mode-enabled feature flag.');
  }

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
  });
}

/**
 * Delete a thread offline
 */
export async function deleteThreadOffline(userId: string, threadId: string): Promise<void> {
  if (!isOfflineModeEnabled()) {
    throw new Error('Offline mode is disabled. Please enable the offline-mode-enabled feature flag.');
  }

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
  });
}

/**
 * Create a note offline
 */
export async function createNoteOffline(userId: string, data: {
  /** Force the local id (e.g. to match an optimistic React Query cache id). Defaults to a fresh `local_*`. */
  id?: string;
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
  linkedFromNoteId?: string | null;
}): Promise<string> {
  if (!isOfflineModeEnabled()) {
    throw new Error('Offline mode is disabled. Please enable the offline-mode-enabled feature flag.');
  }

  const localId = data.id ?? `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const now = Date.now();

  // Get or create user metadata for ID allocation
  let userMeta = await offlineDB.userMetadata.where('userId').equals(userId).first();
  let simpleNoteId: number | null = data.simpleNoteId || null;

  // Create user metadata if it doesn't exist
  if (!userMeta) {
    // First, check existing notes for highest simpleNoteId
    const existingNotes = await offlineDB.notes.where('userId').equals(userId).toArray();
    const highestExisting = existingNotes.reduce((max, note) => {
      return note.simpleNoteId && note.simpleNoteId > max ? note.simpleNoteId : max;
    }, 0);

    userMeta = ensureUserPartition<OfflineUserMetadata>({
      id: `meta_${userId}`,
      highestSimpleNoteId: highestExisting,
      reservedSimpleNoteIdRange: null,
      usedReservedIds: [],
      userColor: 'blue',
      firstName: null,
      lastName: null,
      email: null,
      profileImageUrl: null,
      clerkDataUpdatedAt: null,
      churchName: null,
      churchCity: null,
      churchState: null,
      churchCountry: null,
      currentSeason: getCurrentSeason(),
      lastMonthlyVisit: null,
      churchAddedAt: null,
      appearanceSettings: null,
      syncStatus: 'pending',
      lastModified: Date.now(),
      createdAt: new Date(),
      updatedAt: null,
    }, userId);
    await offlineDB.userMetadata.add(userMeta);
  }

  // If no simpleNoteId provided, try to allocate from reserved range
  if (!simpleNoteId && userMeta.reservedSimpleNoteIdRange) {
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
  
  // If still no simpleNoteId, leave as null — server will assign one during sync.
  // Using highestSimpleNoteId + 1 risks ID collisions between offline clients.

  const effectiveThreadId = data.threadId?.startsWith('thread_onboarding_')
    ? 'thread_unorganized'
    : (data.threadId || 'thread_unorganized');

  const note: OfflineNote = ensureUserPartition<OfflineNote>({
    id: localId,
    title: data.title || null,
    content: data.content,
    threadId: effectiveThreadId,
    spaceId: data.spaceId || null,
    simpleNoteId,
    noteType: data.noteType || 'default',
    addedBy: data.addedBy || 'user',
    isPublic: data.isPublic || false,
    isFeatured: data.isFeatured || false,
    order: data.order || 0,
    lastVisited: new Date(), // Set so new offline items appear at top (matches server-side behavior)
    linkedFromNoteId: data.linkedFromNoteId ?? null,
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
      // Also update localStorage cache for instant offline access
      cacheHighestSimpleNoteId(userId, simpleNoteId);
    }
  }

  // Create NoteThread relationship if threadId is provided (never for onboarding thread)
  if (effectiveThreadId && effectiveThreadId !== 'thread_unorganized') {
    const noteThreadId = `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const noteThread: OfflineNoteThread = ensureUserPartition<OfflineNoteThread>({
      id: noteThreadId,
      noteId: localId,
      threadId: effectiveThreadId,
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
        threadId: effectiveThreadId,
      },
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
      threadId: effectiveThreadId,
      spaceId: data.spaceId,
      simpleNoteId,
      noteType: data.noteType || 'default',
      addedBy: data.addedBy || 'user',
      isPublic: data.isPublic,
      isFeatured: data.isFeatured,
      order: data.order,
      // Include lastVisited so server stores it (fixes order reset on sync)
      lastVisited: new Date().toISOString(),
      ...(data.linkedFromNoteId ? { linkedFromNoteId: data.linkedFromNoteId } : {}),
    },
  });

  return localId;
}

/** First queued note op of a given operation for this note (skips permanently-failed ops). */
async function pendingNoteOp(
  userId: string,
  noteId: string,
  operation: 'create' | 'update' | 'delete',
) {
  return offlineDB.syncQueue
    .where('userId')
    .equals(userId)
    .filter(
      (op) =>
        op.entityType === 'note' &&
        op.entityId === noteId &&
        op.operation === operation &&
        op.retryCount < 5,
    )
    .first();
}

/**
 * Seed used to materialize a server-origin note into IndexedDB on its first offline edit.
 * The prototype reads from the server (it never bootstraps the local mirror), so an existing
 * note has no local row; this lets the edit be queued anyway.
 */
export interface OfflineNoteSeed {
  content: string;
  title?: string | null;
  spaceId?: string | null;
  threadId?: string;
  noteType?: 'default' | 'scripture' | 'resource';
}

/**
 * Update a note offline.
 *
 * Coalescing keeps the queue consistent with how `pushQueue` reconciles ids on reconnect:
 * - If the note still has a pending `create` op (offline-authored, not yet synced), the edit is
 *   folded into that create payload — never a separate `update`, which would reference the
 *   soon-to-be-replaced `local_*` id and fail permanently ("Note not found") on the server.
 * - If a pending `update` op already exists, the new fields merge into it.
 * - Otherwise an `update` op is enqueued.
 *
 * `seed` materializes a row for a pre-existing server note the prototype never mirrored, so its
 * edit can still be queued; without `seed`, a missing row throws (legacy / Classic behavior).
 */
export async function updateNoteOffline(
  userId: string,
  noteId: string,
  updates: Partial<{
    title: string | null;
    content: string;
    spaceId: string | null;
    isPublic: boolean;
    isFeatured: boolean;
    order: number;
    primaryCollection: string | null;
    secondaryCollections: string[];
    collectionPinned: boolean;
    collectionUserOverride: boolean;
    isPinned: boolean;
  }>,
  seed?: OfflineNoteSeed,
): Promise<void> {
  if (!isOfflineModeEnabled()) {
    throw new Error('Offline mode is disabled. Please enable the offline-mode-enabled feature flag.');
  }

  const now = Date.now();
  const note = await offlineDB.notes.where('[userId+id]').equals([userId, noteId]).first();

  if (!note) {
    if (!seed) {
      throw new Error('Note not found');
    }
    // Materialize a pending row for a server note we never bootstrapped. No `create` op is
    // queued — the note already exists server-side, so only the `update` below is sent.
    const effectiveThreadId =
      seed.threadId && !seed.threadId.startsWith('thread_onboarding_') ? seed.threadId : 'thread_unorganized';
    const materialized: OfflineNote = ensureUserPartition<OfflineNote>({
      id: noteId,
      title: updates.title ?? seed.title ?? null,
      content: updates.content ?? seed.content,
      threadId: effectiveThreadId,
      spaceId: updates.spaceId ?? seed.spaceId ?? null,
      simpleNoteId: null,
      noteType: seed.noteType ?? 'default',
      addedBy: 'user',
      isPublic: updates.isPublic ?? false,
      isFeatured: updates.isFeatured ?? false,
      order: updates.order ?? 0,
      lastVisited: new Date(),
      linkedFromNoteId: null,
      syncStatus: 'pending',
      lastModified: now,
      createdAt: new Date(),
      updatedAt: new Date(),
    }, userId);
    await offlineDB.notes.add(materialized);
  } else {
    await offlineDB.notes.update(noteId, {
      ...updates,
      syncStatus: 'pending',
      lastModified: now,
      updatedAt: new Date(),
    });
  }

  // Fold the edit into a still-pending create so it uploads the latest content as one op.
  const createOp = await pendingNoteOp(userId, noteId, 'create');
  if (createOp) {
    await offlineDB.syncQueue.update(createOp.id!, { data: { ...createOp.data, ...updates } });
    return;
  }

  // Merge into an existing pending update rather than stacking duplicate ops.
  const updateOp = await pendingNoteOp(userId, noteId, 'update');
  if (updateOp) {
    await offlineDB.syncQueue.update(updateOp.id!, { data: { ...updateOp.data, ...updates } });
    return;
  }

  await enqueueMutation(userId, {
    operation: 'update',
    entityType: 'note',
    entityId: noteId,
    data: updates,
  });
}

/**
 * Update a note offline only when it already exists in IndexedDB (online-only notes no-op).
 * Returns true when a local row was updated.
 */
export async function updateNoteOfflineIfPresent(
  userId: string,
  noteId: string,
  updates: Partial<{
    title: string | null;
    content: string;
    spaceId: string | null;
    isPublic: boolean;
    isFeatured: boolean;
    order: number;
    primaryCollection: string | null;
    secondaryCollections: string[];
    collectionPinned: boolean;
    collectionUserOverride: boolean;
    isPinned: boolean;
  }>,
): Promise<boolean> {
  if (!isOfflineModeEnabled()) return false;
  const note = await offlineDB.notes.where('[userId+id]').equals([userId, noteId]).first();
  if (!note) return false;
  await updateNoteOffline(userId, noteId, updates);
  return true;
}

/**
 * Delete a note offline.
 *
 * If the note still has a pending `create` op (offline-authored, never synced), the delete
 * cancels it: every queued op for the note and its local row are dropped and nothing is
 * enqueued — the note never existed on the server. Otherwise a `delete` op is enqueued (and the
 * local row marked deleted when present), which also covers pre-existing server notes that were
 * never mirrored locally.
 */
export async function deleteNoteOffline(userId: string, noteId: string): Promise<void> {
  if (!isOfflineModeEnabled()) {
    throw new Error('Offline mode is disabled. Please enable the offline-mode-enabled feature flag.');
  }

  const now = Date.now();
  const note = await offlineDB.notes.where('[userId+id]').equals([userId, noteId]).first();

  const createOp = await pendingNoteOp(userId, noteId, 'create');
  if (createOp) {
    const queuedForNote = await offlineDB.syncQueue
      .where('userId')
      .equals(userId)
      .filter((op) => op.entityType === 'note' && op.entityId === noteId)
      .toArray();
    for (const op of queuedForNote) {
      await offlineDB.syncQueue.delete(op.id!);
    }

    // Cancel bundled noteThread creates for offline-only notes (createNoteOffline enqueues both).
    const linkRows = await offlineDB.noteThreads.where('[userId+noteId]').equals([userId, noteId]).toArray();
    for (const link of linkRows) {
      const linkOps = await offlineDB.syncQueue
        .where('userId')
        .equals(userId)
        .filter((op) => op.entityType === 'noteThread' && op.entityId === link.id)
        .toArray();
      for (const op of linkOps) {
        await offlineDB.syncQueue.delete(op.id!);
      }
      await offlineDB.noteThreads.delete(link.id);
    }

    if (note) await offlineDB.notes.delete(noteId);
    return;
  }

  if (note) {
    await offlineDB.notes.update(noteId, {
      syncStatus: 'deleted',
      lastModified: now,
      updatedAt: new Date(),
    });
  }

  await enqueueMutation(userId, {
    operation: 'delete',
    entityType: 'note',
    entityId: noteId,
    data: {},
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
    });
  } else {
    // Pending link — drop local row and cancel the queued create so reconnect won't orphan a link.
    const pendingCreate = await offlineDB.syncQueue
      .where('userId')
      .equals(userId)
      .filter(
        (op) =>
          op.entityType === 'noteThread' &&
          op.entityId === noteThread.id &&
          op.operation === 'create',
      )
      .first();
    if (pendingCreate?.id) {
      await offlineDB.syncQueue.delete(pendingCreate.id);
    }
    await offlineDB.noteThreads.delete(noteThread.id);
  }
}

/**
 * Assign a tag to a note offline.
 *
 * When `tagId` is omitted (a brand-new tag typed offline) a local tag row is created and its
 * `create` op enqueued first, so the queue pushes tag → noteTag in dependency order. The tag's
 * local id is rewritten to the server id on sync by `updateEntityId` ('tag' case), which also
 * rewrites this noteTag op's `data.tagId`. When `tagId` is an existing server id, only the
 * noteTag link is queued. Returns the local noteTag id. Mirrors `processNoteTagMutation`.
 */
export async function addTagToNoteOffline(userId: string, data: {
  noteId: string;
  /** Existing tag id (server or local). Omit to create a new local tag. */
  tagId?: string | null;
  tagName: string;
  color?: string | null;
  category?: string | null;
  isAutoGenerated?: boolean;
  confidence?: number | null;
}): Promise<string> {
  if (!isOfflineModeEnabled()) {
    throw new Error('Offline mode is disabled. Please enable the offline-mode-enabled feature flag.');
  }

  const now = Date.now();
  let tagId = data.tagId ?? null;

  if (!tagId) {
    const localTagId = `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const tag: OfflineTag = ensureUserPartition<OfflineTag>({
      id: localTagId,
      name: data.tagName,
      color: data.color ?? null,
      category: data.category ?? null,
      isSystem: false,
      syncStatus: 'pending',
      lastModified: now,
      createdAt: new Date(),
      updatedAt: null,
    }, userId);
    await offlineDB.tags.add(tag);
    await enqueueMutation(userId, {
      operation: 'create',
      entityType: 'tag',
      entityId: localTagId,
      data: { name: data.tagName, color: data.color ?? null, category: data.category ?? null, isSystem: false },
    });
    tagId = localTagId;
  }

  const noteTagId = `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const noteTag: OfflineNoteTag = ensureUserPartition<OfflineNoteTag>({
    id: noteTagId,
    noteId: data.noteId,
    tagId,
    isAutoGenerated: data.isAutoGenerated ?? false,
    confidence: data.confidence ?? null,
    syncStatus: 'pending',
    lastModified: now,
    createdAt: new Date(),
    updatedAt: null,
  }, userId);
  await offlineDB.noteTags.add(noteTag);
  await enqueueMutation(userId, {
    operation: 'create',
    entityType: 'noteTag',
    entityId: noteTagId,
    data: {
      noteId: data.noteId,
      tagId,
      isAutoGenerated: data.isAutoGenerated ?? false,
      confidence: data.confidence ?? null,
    },
  });

  return noteTagId;
}

/**
 * Remove a tag from a note offline. Enqueues a `noteTag` delete keyed by `noteId` + `tagId`
 * (the shape `processNoteTagMutation`'s delete branch expects). `tagId` must be a real/server
 * tag id. Also marks any locally-mirrored noteTag rows deleted so the UI stays consistent.
 */
export async function removeTagFromNoteOffline(userId: string, data: { noteId: string; tagId: string }): Promise<void> {
  if (!isOfflineModeEnabled()) {
    throw new Error('Offline mode is disabled. Please enable the offline-mode-enabled feature flag.');
  }

  const now = Date.now();
  const rows = await offlineDB.noteTags
    .where('userId')
    .equals(userId)
    .filter((nt) => nt.noteId === data.noteId && nt.tagId === data.tagId)
    .toArray();
  for (const row of rows) {
    await offlineDB.noteTags.update(row.id, { syncStatus: 'deleted', lastModified: now, updatedAt: new Date() });
  }

  await enqueueMutation(userId, {
    operation: 'delete',
    entityType: 'noteTag',
    entityId: rows[0]?.id ?? `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    data: { noteId: data.noteId, tagId: data.tagId },
  });
}

/**
 * Error types for offline operations
 */
export type OfflineErrorType =
  | 'indexeddb_unavailable'
  | 'quota_exceeded'
  | 'database_error'
  | 'unknown';

export interface OfflineOperationResult {
  success: boolean;
  noteId?: string;
  error?: string;
  errorType?: OfflineErrorType;
}

/**
 * Classify an error into an OfflineErrorType
 */
function classifyOfflineError(error: any): OfflineErrorType {
  if (!error) return 'unknown';
  
  const message = error.message?.toLowerCase() || error.toString().toLowerCase();
  const name = error.name?.toLowerCase() || '';
  
  // IndexedDB unavailable
  if (
    message.includes('indexeddb') && (message.includes('unavailable') || message.includes('not available')) ||
    name === 'dexie.noidberror' ||
    message.includes('no indexeddb')
  ) {
    return 'indexeddb_unavailable';
  }
  
  // Quota exceeded
  if (
    name === 'quotaexceedederror' ||
    message.includes('quota') ||
    message.includes('storage') && message.includes('full')
  ) {
    return 'quota_exceeded';
  }
  
  // Database errors
  if (
    message.includes('database') ||
    message.includes('dexie') ||
    message.includes('transaction')
  ) {
    return 'database_error';
  }
  
  return 'unknown';
}

/**
 * Get user-friendly error message based on error type
 */
export function getOfflineErrorMessage(errorType: OfflineErrorType): string {
  switch (errorType) {
    case 'indexeddb_unavailable':
      return 'Offline storage is unavailable. Please try again when online.';
    case 'quota_exceeded':
      return 'Device storage is full. Free up space and try again.';
    case 'database_error':
      return 'Unable to save offline. Please try again.';
    default:
      return 'Unable to save offline. Please try again when online.';
  }
}

/**
 * Create a note offline with retry logic and better error reporting
 * This is a wrapper around createNoteOffline that adds resilience
 */
export async function createNoteOfflineWithRetry(
  userId: string, 
  data: {
    title?: string | null;
    content: string;
    threadId?: string;
    spaceId?: string | null;
    simpleNoteId?: number | null;
    noteType?: 'default' | 'scripture' | 'resource';
    addedBy?: string;
    isPublic?: boolean;
    isFeatured?: boolean;
    order?: number;
    scriptureReference?: string;
    scriptureVersion?: string;
    resourceUrl?: string;
    resourceMetadata?: any;
    linkedFromNoteId?: string | null;
  },
  options: { retries?: number; retryDelay?: number } = {}
): Promise<OfflineOperationResult> {
  const { retries = 2, retryDelay = 100 } = options;
  let lastError: any = null;
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const noteId = await createNoteOffline(userId, data);
      return { success: true, noteId };
    } catch (error: any) {
      lastError = error;
      const errorType = classifyOfflineError(error);
      
      console.error(`[createNoteOfflineWithRetry] Attempt ${attempt + 1} failed:`, {
        error: error.message || error,
        errorType,
        attempt: attempt + 1,
        maxAttempts: retries + 1
      });
      
      // Don't retry for certain error types
      if (errorType === 'quota_exceeded' || errorType === 'indexeddb_unavailable') {
        return {
          success: false,
          error: getOfflineErrorMessage(errorType),
          errorType
        };
      }
      
      // Wait before retrying
      if (attempt < retries) {
        const delay = retryDelay * Math.pow(2, attempt); // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  // All retries exhausted
  const errorType = classifyOfflineError(lastError);
  console.error('[createNoteOfflineWithRetry] All retries exhausted', {
    error: lastError?.message || lastError,
    errorType
  });
  
  return {
    success: false,
    error: getOfflineErrorMessage(errorType),
    errorType
  };
}

/** Pending study-thread entry op (skips permanently-failed ops). */
async function pendingStudyThreadEntryOp(
  userId: string,
  entryId: string,
  operation: 'create' | 'update' | 'delete',
) {
  return offlineDB.syncQueue
    .where('userId')
    .equals(userId)
    .filter(
      (op) =>
        op.entityType === 'studyThreadEntry' &&
        op.entityId === entryId &&
        op.operation === operation &&
        op.retryCount < 5,
    )
    .first();
}

export type StudyThreadEntryOfflineKind =
  | 'workspace'
  | 'miniNote'
  | 'linkedNote'
  | 'scriptureLink'
  | 'reference';

/** Create a study-thread highlight entry offline (queue-only; prototype reads from server). */
export async function createStudyThreadEntryOffline(
  userId: string,
  data: {
    parentNoteId: string;
    entryKind?: StudyThreadEntryOfflineKind;
    highlightAccentRaw?: string;
    sourceSnippet?: string;
    focusTitle?: string;
    notesBody?: string;
    miniNoteBody?: string;
    linkedNoteId?: string | null;
    linkedNoteTitle?: string | null;
    anchorLocation?: number | null;
    anchorLength?: number | null;
    anchorTextSnapshot?: string | null;
    scriptureReference?: string | null;
    scripturePassageTranslation?: string | null;
    scripturePassageExcerpt?: string | null;
  },
): Promise<string> {
  if (!isOfflineModeEnabled()) {
    throw new Error('Offline mode is disabled. Please enable the offline-mode-enabled feature flag.');
  }

  const localId = `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  await enqueueMutation(userId, {
    operation: 'create',
    entityType: 'studyThreadEntry',
    entityId: localId,
    data: {
      parentNoteId: data.parentNoteId,
      entryKind: data.entryKind ?? 'miniNote',
      highlightAccentRaw: data.highlightAccentRaw ?? 'warmAmber',
      sourceSnippet: data.sourceSnippet ?? '',
      focusTitle: data.focusTitle ?? '',
      notesBody: data.notesBody ?? '',
      miniNoteBody: data.miniNoteBody ?? '',
      linkedNoteId: data.linkedNoteId ?? null,
      linkedNoteTitle: data.linkedNoteTitle ?? null,
      anchorLocation: data.anchorLocation ?? null,
      anchorLength: data.anchorLength ?? null,
      anchorTextSnapshot: data.anchorTextSnapshot ?? null,
      scriptureReference: data.scriptureReference ?? null,
      scripturePassageTranslation: data.scripturePassageTranslation ?? null,
      scripturePassageExcerpt: data.scripturePassageExcerpt ?? null,
    },
  });
  return localId;
}

/** Update a study-thread highlight entry offline. */
export async function updateStudyThreadEntryOffline(
  userId: string,
  entryId: string,
  updates: Partial<{
    entryKind: StudyThreadEntryOfflineKind;
    highlightAccentRaw: string;
    sourceSnippet: string;
    focusTitle: string;
    notesBody: string;
    miniNoteBody: string;
    linkedNoteId: string | null;
    linkedNoteTitle: string | null;
    anchorLocation: number | null;
    anchorLength: number | null;
    anchorTextSnapshot: string | null;
    scriptureReference: string;
    scripturePassageTranslation: string;
    scripturePassageExcerpt: string;
    isArchived: boolean;
  }>,
): Promise<void> {
  if (!isOfflineModeEnabled()) {
    throw new Error('Offline mode is disabled. Please enable the offline-mode-enabled feature flag.');
  }

  const createOp = await pendingStudyThreadEntryOp(userId, entryId, 'create');
  if (createOp) {
    await offlineDB.syncQueue.update(createOp.id!, { data: { ...createOp.data, ...updates } });
    return;
  }

  const updateOp = await pendingStudyThreadEntryOp(userId, entryId, 'update');
  if (updateOp) {
    await offlineDB.syncQueue.update(updateOp.id!, { data: { ...updateOp.data, ...updates } });
    return;
  }

  await enqueueMutation(userId, {
    operation: 'update',
    entityType: 'studyThreadEntry',
    entityId: entryId,
    data: updates,
  });
}

/** Delete a study-thread highlight entry offline. */
export async function deleteStudyThreadEntryOffline(userId: string, entryId: string): Promise<void> {
  if (!isOfflineModeEnabled()) {
    throw new Error('Offline mode is disabled. Please enable the offline-mode-enabled feature flag.');
  }

  const createOp = await pendingStudyThreadEntryOp(userId, entryId, 'create');
  if (createOp) {
    const queued = await offlineDB.syncQueue
      .where('userId')
      .equals(userId)
      .filter((op) => op.entityType === 'studyThreadEntry' && op.entityId === entryId)
      .toArray();
    for (const op of queued) {
      await offlineDB.syncQueue.delete(op.id!);
    }
    return;
  }

  await enqueueMutation(userId, {
    operation: 'delete',
    entityType: 'studyThreadEntry',
    entityId: entryId,
    data: {},
  });
}

/** Toggle note pin offline via note update sync op. */
export async function pinNoteOffline(
  userId: string,
  noteId: string,
  isPinned: boolean,
  seed: OfflineNoteSeed & { title?: string | null },
): Promise<void> {
  await updateNoteOffline(userId, noteId, { isPinned }, seed);
}

/** Connect two notes in the study-thread graph offline. */
export async function connectNotesOffline(
  userId: string,
  data: { fromNoteId: string; toNoteId: string; spaceId: string | null },
): Promise<string> {
  if (!isOfflineModeEnabled()) {
    throw new Error('Offline mode is disabled. Please enable the offline-mode-enabled feature flag.');
  }

  const existing = (
    await offlineDB.noteConnections.where('userId').equals(userId).toArray()
  ).find((edge) => edge.fromNoteId === data.fromNoteId && edge.toNoteId === data.toNoteId);
  if (existing && existing.syncStatus !== 'deleted') {
    return existing.id;
  }

  const localId = `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const now = Date.now();
  await offlineDB.noteConnections.add(
    ensureUserPartition(
      {
        id: localId,
        fromNoteId: data.fromNoteId,
        toNoteId: data.toNoteId,
        spaceId: data.spaceId,
        syncStatus: 'pending',
        lastModified: now,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      userId,
    ),
  );

  await enqueueMutation(userId, {
    operation: 'create',
    entityType: 'noteConnection',
    entityId: localId,
    data: {
      fromNoteId: data.fromNoteId,
      toNoteId: data.toNoteId,
      spaceId: data.spaceId,
    },
  });
  return localId;
}

/** Disconnect two notes in the study-thread graph offline. */
export async function disconnectNotesOffline(
  userId: string,
  fromNoteId: string,
  toNoteId: string,
): Promise<void> {
  if (!isOfflineModeEnabled()) {
    throw new Error('Offline mode is disabled. Please enable the offline-mode-enabled feature flag.');
  }

  const edge = (
    await offlineDB.noteConnections.where('userId').equals(userId).toArray()
  ).find((row) => row.fromNoteId === fromNoteId && row.toNoteId === toNoteId);

  if (edge?.syncStatus === 'pending') {
    const pendingCreate = await offlineDB.syncQueue
      .where('userId')
      .equals(userId)
      .filter(
        (op) =>
          op.entityType === 'noteConnection' &&
          op.entityId === edge.id &&
          op.operation === 'create' &&
          op.retryCount < 5,
      )
      .first();
    if (pendingCreate?.id) {
      await offlineDB.syncQueue.delete(pendingCreate.id);
    }
    await offlineDB.noteConnections.delete(edge.id);
    return;
  }

  await enqueueMutation(userId, {
    operation: 'delete',
    entityType: 'noteConnection',
    entityId: edge?.id ?? `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    data: { fromNoteId, toNoteId },
  });

  if (edge) {
    await offlineDB.noteConnections.update(edge.id, {
      syncStatus: 'deleted',
      lastModified: Date.now(),
      updatedAt: new Date(),
    });
  }
}

/** Remove one note from a study-thread cluster offline (queues edge deletes). */
export async function removeNoteFromThreadClusterOffline(
  userId: string,
  data: {
    memberIds: string[];
    noteId: string;
    edges?: Array<{ fromNoteId: string; toNoteId: string }>;
  },
): Promise<void> {
  const memberSet = new Set(data.memberIds);
  const trimmedNoteId = data.noteId.trim();
  if (!trimmedNoteId || !memberSet.has(trimmedNoteId)) {
    throw new Error('noteId must be a member of memberIds');
  }

  const toRemove =
    data.edges && data.edges.length > 0
      ? filterThreadClusterEdgesForRemoval(data.edges, data.memberIds, trimmedNoteId)
      : data.memberIds
          .filter((id) => id !== trimmedNoteId)
          .flatMap((otherId) => [
            { fromNoteId: trimmedNoteId, toNoteId: otherId },
            { fromNoteId: otherId, toNoteId: trimmedNoteId },
          ]);

  for (const edge of toRemove) {
    await disconnectNotesOffline(userId, edge.fromNoteId, edge.toNoteId);
  }
}

