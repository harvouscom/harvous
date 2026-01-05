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
  type SyncState, 
  type SyncStatus, 
  ensureUserPartition 
} from './offline-db';

export interface SyncResult {
  success: boolean;
  error?: string;
  results?: Array<{ success: boolean; operationId?: number; error?: string }>;
  pulledCount?: number;
  pushedCount?: number;
}

/**
 * Apply bootstrap data to local IndexedDB
 */
export async function applyBootstrapData(userId: string, bootstrapData: any): Promise<void> {
  try {
    // Clear existing data for this user (fresh start)
    await Promise.all([
      offlineDB.spaces.where('userId').equals(userId).delete(),
      offlineDB.threads.where('userId').equals(userId).delete(),
      offlineDB.notes.where('userId').equals(userId).delete(),
      offlineDB.noteThreads.where('userId').equals(userId).delete(),
      offlineDB.tags.where('userId').equals(userId).delete(),
      offlineDB.noteTags.where('userId').equals(userId).delete(),
      offlineDB.userMetadata.where('userId').equals(userId).delete(),
    ]);

    // Insert spaces
    if (bootstrapData.spaces && bootstrapData.spaces.length > 0) {
      const spaces: OfflineSpace[] = bootstrapData.spaces.map((space: any) =>
        ensureUserPartition<OfflineSpace>({
          id: space.id,
          title: space.title,
          description: space.description,
          color: space.color,
          backgroundGradient: space.backgroundGradient,
          isPublic: space.isPublic,
          isActive: space.isActive,
          order: space.order,
          syncStatus: 'synced',
          lastModified: new Date(space.updatedAt || space.createdAt).getTime(),
          serverVersion: new Date(space.updatedAt || space.createdAt).getTime(),
          createdAt: new Date(space.createdAt),
          updatedAt: space.updatedAt ? new Date(space.updatedAt) : null,
        }, userId)
      );
      await offlineDB.spaces.bulkPut(spaces);
    }

    // Insert threads
    if (bootstrapData.threads && bootstrapData.threads.length > 0) {
      const threads: OfflineThread[] = bootstrapData.threads.map((thread: any) =>
        ensureUserPartition<OfflineThread>({
          id: thread.id,
          title: thread.title,
          subtitle: thread.subtitle,
          spaceId: thread.spaceId,
          color: thread.color,
          isPublic: thread.isPublic,
          isPinned: thread.isPinned,
          order: thread.order,
          lastVisited: thread.lastVisited ? new Date(thread.lastVisited) : null,
          syncStatus: 'synced',
          lastModified: new Date(thread.updatedAt || thread.createdAt).getTime(),
          serverVersion: new Date(thread.updatedAt || thread.createdAt).getTime(),
          createdAt: new Date(thread.createdAt),
          updatedAt: thread.updatedAt ? new Date(thread.updatedAt) : null,
        }, userId)
      );
      await offlineDB.threads.bulkPut(threads);
    }

    // Insert notes
    if (bootstrapData.notes && bootstrapData.notes.length > 0) {
      const notes: OfflineNote[] = bootstrapData.notes.map((note: any) =>
        ensureUserPartition<OfflineNote>({
          id: note.id,
          title: note.title,
          content: note.content,
          threadId: note.threadId,
          spaceId: note.spaceId,
          simpleNoteId: note.simpleNoteId,
          noteType: note.noteType,
          addedBy: note.addedBy,
          isPublic: note.isPublic,
          isFeatured: note.isFeatured,
          order: note.order,
          lastVisited: note.lastVisited ? new Date(note.lastVisited) : null,
          syncStatus: 'synced',
          lastModified: new Date(note.updatedAt || note.createdAt).getTime(),
          serverVersion: new Date(note.updatedAt || note.createdAt).getTime(),
          createdAt: new Date(note.createdAt),
          updatedAt: note.updatedAt ? new Date(note.updatedAt) : null,
        }, userId)
      );
      await offlineDB.notes.bulkPut(notes);
    }

    // Insert noteThreads
    if (bootstrapData.noteThreads && bootstrapData.noteThreads.length > 0) {
      const noteThreads: OfflineNoteThread[] = bootstrapData.noteThreads.map((nt: any) =>
        ensureUserPartition<OfflineNoteThread>({
          id: nt.id,
          noteId: nt.noteId,
          threadId: nt.threadId,
          syncStatus: 'synced',
          lastModified: new Date(nt.createdAt).getTime(),
          serverVersion: new Date(nt.createdAt).getTime(),
          createdAt: new Date(nt.createdAt),
          updatedAt: null,
        }, userId)
      );
      await offlineDB.noteThreads.bulkPut(noteThreads);
    }

    // Insert tags
    if (bootstrapData.tags && bootstrapData.tags.length > 0) {
      const tags: OfflineTag[] = bootstrapData.tags.map((tag: any) =>
        ensureUserPartition<OfflineTag>({
          id: tag.id,
          name: tag.name,
          color: tag.color,
          category: tag.category,
          isSystem: tag.isSystem,
          syncStatus: 'synced',
          lastModified: new Date(tag.updatedAt || tag.createdAt).getTime(),
          serverVersion: new Date(tag.updatedAt || tag.createdAt).getTime(),
          createdAt: new Date(tag.createdAt),
          updatedAt: tag.updatedAt ? new Date(tag.updatedAt) : null,
        }, userId)
      );
      await offlineDB.tags.bulkPut(tags);
    }

    // Insert noteTags
    if (bootstrapData.noteTags && bootstrapData.noteTags.length > 0) {
      const noteTags: OfflineNoteTag[] = bootstrapData.noteTags.map((nt: any) =>
        ensureUserPartition<OfflineNoteTag>({
          id: nt.id,
          noteId: nt.noteId,
          tagId: nt.tagId,
          isAutoGenerated: nt.isAutoGenerated,
          confidence: nt.confidence,
          syncStatus: 'synced',
          lastModified: new Date(nt.createdAt).getTime(),
          serverVersion: new Date(nt.createdAt).getTime(),
          createdAt: new Date(nt.createdAt),
          updatedAt: null,
        }, userId)
      );
      await offlineDB.noteTags.bulkPut(noteTags);
    }

    // Insert/update userMetadata
    if (bootstrapData.userMetadata) {
      const um = bootstrapData.userMetadata;
      const userMetadata: OfflineUserMetadata = ensureUserPartition<OfflineUserMetadata>({
        id: um.id,
        highestSimpleNoteId: um.highestSimpleNoteId,
        reservedSimpleNoteIdRange: um.reservedSimpleNoteIdRange || null,
        usedReservedIds: [], // Initialize empty - will track as IDs are used
        userColor: um.userColor,
        firstName: um.firstName,
        lastName: um.lastName,
        email: um.email,
        profileImageUrl: um.profileImageUrl,
        clerkDataUpdatedAt: um.clerkDataUpdatedAt ? new Date(um.clerkDataUpdatedAt) : null,
        churchName: um.churchName,
        churchCity: um.churchCity,
        churchState: um.churchState,
        churchCountry: um.churchCountry,
        currentSeason: um.currentSeason,
        lastMonthlyVisit: um.lastMonthlyVisit ? new Date(um.lastMonthlyVisit) : null,
        churchAddedAt: um.churchAddedAt ? new Date(um.churchAddedAt) : null,
        syncStatus: 'synced',
        lastModified: new Date(um.updatedAt || um.createdAt).getTime(),
        serverVersion: new Date(um.updatedAt || um.createdAt).getTime(),
        createdAt: new Date(um.createdAt),
        updatedAt: um.updatedAt ? new Date(um.updatedAt) : null,
      }, userId);
      await offlineDB.userMetadata.put(userMetadata);
    }

    // Update sync state
    await updateSyncState(userId, {
      lastSyncCursor: bootstrapData.cursor,
      lastSyncTimestamp: Date.now(),
      lastBootstrapTimestamp: Date.now(),
      isSyncing: false,
      syncError: null,
    });
  } catch (error) {
    console.error('Error applying bootstrap data:', error);
    throw error;
  }
}

/**
 * Apply incremental changes to local IndexedDB
 */
export async function applyIncrementalChanges(userId: string, changes: any): Promise<number> {
  let appliedCount = 0;

  try {
    // Apply spaces
    if (changes.spaces && changes.spaces.length > 0) {
      for (const space of changes.spaces) {
        const existing = await offlineDB.spaces.where('[userId+id]').equals([userId, space.id]).first();
        const lastModified = new Date(space.updatedAt || space.createdAt).getTime();
        
        // Conflict resolution: last-write-wins
        if (!existing || lastModified >= (existing.lastModified || 0)) {
          const offlineSpace: OfflineSpace = ensureUserPartition<OfflineSpace>({
            id: space.id,
            title: space.title,
            description: space.description,
            color: space.color,
            backgroundGradient: space.backgroundGradient,
            isPublic: space.isPublic,
            isActive: space.isActive,
            order: space.order,
            syncStatus: 'synced',
            lastModified,
            serverVersion: lastModified,
            createdAt: new Date(space.createdAt),
            updatedAt: space.updatedAt ? new Date(space.updatedAt) : null,
          }, userId);
          await offlineDB.spaces.put(offlineSpace);
          appliedCount++;
        }
      }
    }

    // Apply threads
    if (changes.threads && changes.threads.length > 0) {
      for (const thread of changes.threads) {
        const existing = await offlineDB.threads.where('[userId+id]').equals([userId, thread.id]).first();
        const lastModified = new Date(thread.updatedAt || thread.createdAt).getTime();
        
        if (!existing || lastModified >= (existing.lastModified || 0)) {
          const offlineThread: OfflineThread = ensureUserPartition<OfflineThread>({
            id: thread.id,
            title: thread.title,
            subtitle: thread.subtitle,
            spaceId: thread.spaceId,
            color: thread.color,
            isPublic: thread.isPublic,
            isPinned: thread.isPinned,
            order: thread.order,
            lastVisited: thread.lastVisited ? new Date(thread.lastVisited) : null,
            syncStatus: 'synced',
            lastModified,
            serverVersion: lastModified,
            createdAt: new Date(thread.createdAt),
            updatedAt: thread.updatedAt ? new Date(thread.updatedAt) : null,
          }, userId);
          await offlineDB.threads.put(offlineThread);
          appliedCount++;
        }
      }
    }

    // Apply notes
    if (changes.notes && changes.notes.length > 0) {
      for (const note of changes.notes) {
        const existing = await offlineDB.notes.where('[userId+id]').equals([userId, note.id]).first();
        const lastModified = new Date(note.updatedAt || note.createdAt).getTime();
        
        if (!existing || lastModified >= (existing.lastModified || 0)) {
          const offlineNote: OfflineNote = ensureUserPartition<OfflineNote>({
            id: note.id,
            title: note.title,
            content: note.content,
            threadId: note.threadId,
            spaceId: note.spaceId,
            simpleNoteId: note.simpleNoteId,
            noteType: note.noteType,
            addedBy: note.addedBy,
            isPublic: note.isPublic,
            isFeatured: note.isFeatured,
            order: note.order,
            lastVisited: note.lastVisited ? new Date(note.lastVisited) : null,
            syncStatus: 'synced',
            lastModified,
            serverVersion: lastModified,
            createdAt: new Date(note.createdAt),
            updatedAt: note.updatedAt ? new Date(note.updatedAt) : null,
          }, userId);
          await offlineDB.notes.put(offlineNote);
          appliedCount++;
        }
      }
    }

    // Apply noteThreads
    if (changes.noteThreads && changes.noteThreads.length > 0) {
      for (const nt of changes.noteThreads) {
        const existing = await offlineDB.noteThreads.where('[userId+id]').equals([userId, nt.id]).first();
        const lastModified = new Date(nt.createdAt).getTime();
        
        if (!existing || lastModified >= (existing.lastModified || 0)) {
          const offlineNoteThread: OfflineNoteThread = ensureUserPartition<OfflineNoteThread>({
            id: nt.id,
            noteId: nt.noteId,
            threadId: nt.threadId,
            syncStatus: 'synced',
            lastModified,
            serverVersion: lastModified,
            createdAt: new Date(nt.createdAt),
            updatedAt: null,
          }, userId);
          await offlineDB.noteThreads.put(offlineNoteThread);
          appliedCount++;
        }
      }
    }

    // Apply tags
    if (changes.tags && changes.tags.length > 0) {
      for (const tag of changes.tags) {
        const existing = await offlineDB.tags.where('[userId+id]').equals([userId, tag.id]).first();
        const lastModified = new Date(tag.updatedAt || tag.createdAt).getTime();
        
        if (!existing || lastModified >= (existing.lastModified || 0)) {
          const offlineTag: OfflineTag = ensureUserPartition<OfflineTag>({
            id: tag.id,
            name: tag.name,
            color: tag.color,
            category: tag.category,
            isSystem: tag.isSystem,
            syncStatus: 'synced',
            lastModified,
            serverVersion: lastModified,
            createdAt: new Date(tag.createdAt),
            updatedAt: tag.updatedAt ? new Date(tag.updatedAt) : null,
          }, userId);
          await offlineDB.tags.put(offlineTag);
          appliedCount++;
        }
      }
    }

    // Apply noteTags
    if (changes.noteTags && changes.noteTags.length > 0) {
      for (const nt of changes.noteTags) {
        const existing = await offlineDB.noteTags.where('[userId+id]').equals([userId, nt.id]).first();
        const lastModified = new Date(nt.createdAt).getTime();
        
        if (!existing || lastModified >= (existing.lastModified || 0)) {
          const offlineNoteTag: OfflineNoteTag = ensureUserPartition<OfflineNoteTag>({
            id: nt.id,
            noteId: nt.noteId,
            tagId: nt.tagId,
            isAutoGenerated: nt.isAutoGenerated,
            confidence: nt.confidence,
            syncStatus: 'synced',
            lastModified,
            serverVersion: lastModified,
            createdAt: new Date(nt.createdAt),
            updatedAt: null,
          }, userId);
          await offlineDB.noteTags.put(offlineNoteTag);
          appliedCount++;
        }
      }
    }

    // Apply userMetadata
    if (changes.userMetadata) {
      const um = changes.userMetadata;
      const lastModified = new Date(um.updatedAt || um.createdAt).getTime();
      const existing = await offlineDB.userMetadata.where('userId').equals(userId).first();
      
      if (!existing || lastModified >= (existing.lastModified || 0)) {
        const userMetadata: OfflineUserMetadata = ensureUserPartition<OfflineUserMetadata>({
          id: um.id,
          highestSimpleNoteId: um.highestSimpleNoteId,
          reservedSimpleNoteIdRange: um.reservedSimpleNoteIdRange || null,
          usedReservedIds: um.usedReservedIds || [],
          userColor: um.userColor,
          firstName: um.firstName,
          lastName: um.lastName,
          email: um.email,
          profileImageUrl: um.profileImageUrl,
          clerkDataUpdatedAt: um.clerkDataUpdatedAt ? new Date(um.clerkDataUpdatedAt) : null,
          churchName: um.churchName,
          churchCity: um.churchCity,
          churchState: um.churchState,
          churchCountry: um.churchCountry,
          currentSeason: um.currentSeason,
          lastMonthlyVisit: um.lastMonthlyVisit ? new Date(um.lastMonthlyVisit) : null,
          churchAddedAt: um.churchAddedAt ? new Date(um.churchAddedAt) : null,
          syncStatus: 'synced',
          lastModified,
          serverVersion: lastModified,
          createdAt: new Date(um.createdAt),
          updatedAt: um.updatedAt ? new Date(um.updatedAt) : null,
        }, userId);
        await offlineDB.userMetadata.put(userMetadata);
        appliedCount++;
      }
    }

    // Update sync state
    await updateSyncState(userId, {
      lastSyncCursor: changes.cursor,
      lastSyncTimestamp: Date.now(),
      isSyncing: false,
      syncError: null,
    });

    return appliedCount;
  } catch (error) {
    console.error('Error applying incremental changes:', error);
    await updateSyncState(userId, {
      isSyncing: false,
      syncError: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

/**
 * Pull changes from server (incremental sync)
 */
export async function pullChanges(userId: string): Promise<SyncResult> {
  if (!navigator.onLine) {
    return { success: false, error: 'Offline' };
  }

  try {
    const syncState = await getSyncState(userId);
    const sinceCursor = syncState?.lastSyncCursor || null;

    if (!sinceCursor) {
      // No sync state - need bootstrap
      return { success: false, error: 'Bootstrap required' };
    }

    const response = await fetch(`/api/sync/changes?since=${encodeURIComponent(sinceCursor)}`, {
      method: 'GET',
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`Sync failed: ${response.status} ${response.statusText}`);
    }

    const changes = await response.json();
    
    if (!changes.hasChanges) {
      return { success: true, pulledCount: 0 };
    }

    const appliedCount = await applyIncrementalChanges(userId, changes);

    return { success: true, pulledCount: appliedCount };
  } catch (error) {
    console.error('Error pulling changes:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Bootstrap sync (first load)
 */
export async function bootstrapSync(userId: string): Promise<SyncResult> {
  if (!navigator.onLine) {
    return { success: false, error: 'Bootstrap requires online connection' };
  }

  try {
    await updateSyncState(userId, { isSyncing: true, syncError: null });

    const response = await fetch('/api/sync/bootstrap', {
      method: 'GET',
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`Bootstrap failed: ${response.status} ${response.statusText}`);
    }

    const bootstrapData = await response.json();
    await applyBootstrapData(userId, bootstrapData);

    return { success: true, pulledCount: bootstrapData.notes?.length || 0 };
  } catch (error) {
    console.error('Error bootstrapping sync:', error);
    await updateSyncState(userId, {
      isSyncing: false,
      syncError: error instanceof Error ? error.message : String(error),
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Get sync state for a user
 */
export async function getSyncState(userId: string): Promise<SyncState | null> {
  try {
    return await offlineDB.syncState.where('userId').equals(userId).first() || null;
  } catch (error) {
    console.error('Error getting sync state:', error);
    return null;
  }
}

/**
 * Update sync state
 */
async function updateSyncState(userId: string, updates: Partial<SyncState>): Promise<void> {
  try {
    const existing = await offlineDB.syncState.where('userId').equals(userId).first();
    
    if (existing) {
      await offlineDB.syncState.update(userId, updates);
    } else {
      await offlineDB.syncState.add({
        userId,
        lastSyncCursor: null,
        lastSyncTimestamp: null,
        lastBootstrapTimestamp: null,
        isSyncing: false,
        syncError: null,
        ...updates,
      });
    }
  } catch (error) {
    console.error('Error updating sync state:', error);
  }
}

/**
 * Enqueue a mutation for sync
 */
export async function enqueueMutation(userId: string, operation: SyncOperation): Promise<void> {
  try {
    await offlineDB.syncQueue.add({
      ...operation,
      userId,
      timestamp: Date.now(),
      retryCount: 0,
    });
  } catch (error) {
    console.error('Error enqueuing mutation:', error);
    throw error;
  }
}

/**
 * Push queued mutations to server
 */
export async function pushQueue(userId: string): Promise<SyncResult> {
  if (!navigator.onLine) {
    return { success: false, error: 'Offline' };
  }

  try {
    // Get pending mutations (not deleted, retry count < 5)
    const pendingOps = await offlineDB.syncQueue
      .where('userId')
      .equals(userId)
      .filter(op => op.retryCount < 5)
      .toArray();

    if (pendingOps.length === 0) {
      return { success: true, pushedCount: 0 };
    }

    // Prepare mutations for batch push
    const mutations = pendingOps.map(op => ({
      operation: op.operation,
      entityType: op.entityType,
      entityId: op.entityId,
      data: op.data,
      operationId: op.id,
    }));

    // Send batch to server
    const response = await fetch('/api/sync/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mutations }),
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`Push failed: ${response.status} ${response.statusText}`);
    }

    const result = await response.json();
    const results = result.results || [];

    // Process results and update local state
    let pushedCount = 0;
    for (const res of results) {
      const op = pendingOps.find(o => o.id === res.operationId);
      if (!op) continue;

      if (res.success) {
        // Update entity with server ID if provided
        if (res.serverId && res.serverId !== op.entityId) {
          await updateEntityId(op.entityType, op.entityId, res.serverId, userId);
        }

        // Mark entity as synced
        await markEntitySynced(op.entityType, res.serverId || op.entityId, userId);

        // Remove from queue
        await offlineDB.syncQueue.delete(op.id!);
        pushedCount++;
      } else {
        // Increment retry count
        await offlineDB.syncQueue.update(op.id!, {
          retryCount: op.retryCount + 1,
          lastError: res.error || 'Unknown error',
        });
      }
    }

    return { success: true, pushedCount, results };
  } catch (error) {
    console.error('Error pushing queue:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Update entity ID after server assigns new ID
 */
async function updateEntityId(entityType: string, oldId: string, newId: string, userId: string): Promise<void> {
  try {
    switch (entityType) {
      case 'space':
        await offlineDB.spaces.where('[userId+id]').equals([userId, oldId]).modify({ id: newId });
        break;
      case 'thread':
        await offlineDB.threads.where('[userId+id]').equals([userId, oldId]).modify({ id: newId });
        break;
      case 'note':
        await offlineDB.notes.where('[userId+id]').equals([userId, oldId]).modify({ id: newId });
        break;
      case 'noteThread':
        await offlineDB.noteThreads.where('[userId+id]').equals([userId, oldId]).modify({ id: newId });
        break;
      case 'tag':
        await offlineDB.tags.where('[userId+id]').equals([userId, oldId]).modify({ id: newId });
        break;
      case 'noteTag':
        await offlineDB.noteTags.where('[userId+id]').equals([userId, oldId]).modify({ id: newId });
        break;
    }
  } catch (error) {
    console.error('Error updating entity ID:', error);
  }
}

/**
 * Mark entity as synced
 */
async function markEntitySynced(entityType: string, entityId: string, userId: string): Promise<void> {
  try {
    const now = Date.now();
    switch (entityType) {
      case 'space':
        await offlineDB.spaces.where('[userId+id]').equals([userId, entityId]).modify({
          syncStatus: 'synced',
          lastModified: now,
          serverVersion: now,
        });
        break;
      case 'thread':
        await offlineDB.threads.where('[userId+id]').equals([userId, entityId]).modify({
          syncStatus: 'synced',
          lastModified: now,
          serverVersion: now,
        });
        break;
      case 'note':
        await offlineDB.notes.where('[userId+id]').equals([userId, entityId]).modify({
          syncStatus: 'synced',
          lastModified: now,
          serverVersion: now,
        });
        break;
      case 'noteThread':
        await offlineDB.noteThreads.where('[userId+id]').equals([userId, entityId]).modify({
          syncStatus: 'synced',
          lastModified: now,
          serverVersion: now,
        });
        break;
      case 'tag':
        await offlineDB.tags.where('[userId+id]').equals([userId, entityId]).modify({
          syncStatus: 'synced',
          lastModified: now,
          serverVersion: now,
        });
        break;
      case 'noteTag':
        await offlineDB.noteTags.where('[userId+id]').equals([userId, entityId]).modify({
          syncStatus: 'synced',
          lastModified: now,
          serverVersion: now,
        });
        break;
    }
  } catch (error) {
    console.error('Error marking entity as synced:', error);
  }
}

/**
 * Sync now (pull + push)
 */
export async function syncNow(userId: string): Promise<SyncResult> {
  if (!navigator.onLine) {
    return { success: false, error: 'Offline' };
  }

  try {
    await updateSyncState(userId, { isSyncing: true, syncError: null });

    // Check if bootstrap needed
    if (await needsBootstrap(userId)) {
      const bootstrapResult = await bootstrapSync(userId);
      if (!bootstrapResult.success) {
        return bootstrapResult;
      }
    }

    // Pull changes
    const pullResult = await pullChanges(userId);
    if (!pullResult.success && pullResult.error !== 'Bootstrap required') {
      return pullResult;
    }

    // Push queue
    const pushResult = await pushQueue(userId);

    await updateSyncState(userId, { isSyncing: false });

    return {
      success: true,
      pulledCount: pullResult.pulledCount || 0,
      pushedCount: pushResult.pushedCount || 0,
    };
  } catch (error) {
    await updateSyncState(userId, {
      isSyncing: false,
      syncError: error instanceof Error ? error.message : String(error),
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Check if bootstrap is needed
 */
export async function needsBootstrap(userId: string): Promise<boolean> {
  try {
    const syncState = await getSyncState(userId);
    return !syncState || !syncState.lastBootstrapTimestamp;
  } catch (error) {
    return true;
  }
}

/**
 * Start background sync loop
 */
export function startBackgroundSync(userId: string, intervalMs: number = 30000): () => void {
  let syncInterval: number | null = null;

  const sync = async () => {
    if (navigator.onLine) {
      try {
        await syncNow(userId);
      } catch (error) {
        console.error('Background sync error:', error);
      }
    }
  };

  // Initial sync
  sync();

  // Set up interval
  syncInterval = window.setInterval(sync, intervalMs);

  // Also sync on online event
  const handleOnline = () => {
    sync();
  };
  window.addEventListener('online', handleOnline);

  // Return cleanup function
  return () => {
    if (syncInterval !== null) {
      clearInterval(syncInterval);
    }
    window.removeEventListener('online', handleOnline);
  };
}

