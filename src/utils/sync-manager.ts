import { 
  offlineDB, 
  type OfflineSpace, 
  type OfflineThread, 
  type OfflineNote, 
  type OfflineNoteThread,
  type OfflineNoteConnection,
  type OfflineTag, 
  type OfflineNoteTag, 
  type OfflineUserMetadata, 
  type SyncOperation, 
  type SyncState, 
  type SyncStatus, 
  ensureUserPartition,
  ensureDatabaseOpen,
  retryIndexedDBOperation
} from './offline-db';
import { cacheHighestSimpleNoteId } from './offline-db';
import { getCurrentSeason } from './season-helpers';
import { THREAD_COLORS } from './colors';
import { safeFetch } from './safe-fetch';
import { extractIdFromPath, idToUrl } from './url-helpers';
import { dispatchRemoteSyncCompleted } from './harvous-remote-sync-event';
import { dispatchAppearanceAccountSync } from './harvous-appearance-account-event';
import { isPrototypeShellPath } from '@/lib/prototype-path';
import { MAX_NOTE_CREATES_PER_SYNC_PUSH } from '@/utils/rate-limit';

/** Pending ops above this threshold are treated as a stuck/unhealthy queue. */
export const SYNC_QUEUE_UNHEALTHY_THRESHOLD = 100;

export interface SyncResult {
  success: boolean;
  error?: string;
  results?: Array<{ success: boolean; operationId?: number; error?: string }>;
  pulledCount?: number;
  pushedCount?: number;
}

/**
 * Sync error types for classification
 */
export type SyncErrorType = 
  | 'transient'      // Network issues, timeouts - should retry
  | 'auth'           // 401/403 - user needs to re-authenticate
  | 'validation'     // 400 - data is invalid, won't succeed on retry
  | 'not_found'      // 404 - entity no longer exists
  | 'conflict'       // 409 - conflict with server data
  | 'server'         // 500+ - server error, may retry later
  | 'unknown';       // Unknown error

/**
 * Classify an error to determine retry behavior
 */
export function classifySyncError(error: string | number): SyncErrorType {
  // If it's an HTTP status code
  if (typeof error === 'number') {
    if (error === 401 || error === 403) return 'auth';
    if (error === 400) return 'validation';
    if (error === 404) return 'not_found';
    if (error === 409) return 'conflict';
    if (error >= 500) return 'server';
    return 'unknown';
  }

  // If it's a string error message
  const lowerError = error.toLowerCase();
  
  // Auth errors
  if (lowerError.includes('unauthorized') || lowerError.includes('401') || lowerError.includes('403')) {
    return 'auth';
  }
  
  // Validation errors
  if (lowerError.includes('invalid') || lowerError.includes('validation') || lowerError.includes('400')) {
    return 'validation';
  }
  
  // Not found errors
  if (lowerError.includes('not found') || lowerError.includes('404') || lowerError.includes('does not exist')) {
    return 'not_found';
  }
  
  // Conflict errors
  if (lowerError.includes('conflict') || lowerError.includes('409')) {
    return 'conflict';
  }
  
  // Network/transient errors
  if (lowerError.includes('network') || lowerError.includes('timeout') || lowerError.includes('fetch') ||
      lowerError.includes('offline') || lowerError.includes('connection') || lowerError.includes('econnrefused')) {
    return 'transient';
  }
  
  // Server errors
  if (lowerError.includes('500') || lowerError.includes('502') || lowerError.includes('503') ||
      lowerError.includes('server error') || lowerError.includes('internal server')) {
    return 'server';
  }
  
  return 'unknown';
}

/**
 * Normalize thread color from long format (blessed-blue) to short format (blue)
 * Ensures colors stored in IndexedDB are in the format expected by components
 */
function normalizeThreadColor(color: string | null | undefined): string | null {
  if (!color) return null;
  
  // Map long names to short names
  const colorMap: Record<string, string> = {
    "blessed-blue": "blue",
    "graceful-gold": "yellow",
    "mindful-mint": "green",
    "pleasant-peach": "orange",
    "peaceful-pink": "pink",
    "lovely-lavender": "purple",
  };
  
  const normalized = colorMap[color.toLowerCase()] || color;
  // Only return if it's a valid thread color
  if (THREAD_COLORS.includes(normalized as any)) {
    return normalized;
  }
  return null;
}

/**
 * Check if an error type should be retried
 */
export function shouldRetryError(errorType: SyncErrorType): boolean {
  // Only retry transient and server errors
  // Don't retry: auth (need re-login), validation (data won't change), not_found, conflict
  return errorType === 'transient' || errorType === 'server';
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
      offlineDB.noteConnections.where('userId').equals(userId).delete(),
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
    } else {
    }

    // Insert threads
    if (bootstrapData.threads && bootstrapData.threads.length > 0) {
      const threads: OfflineThread[] = bootstrapData.threads.map((thread: any) =>
        ensureUserPartition<OfflineThread>({
          id: thread.id,
          title: thread.title,
          subtitle: thread.subtitle,
          spaceId: thread.spaceId,
          color: normalizeThreadColor(thread.color),
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
    } else {
    }

    // Insert notes
    if (bootstrapData.notes && bootstrapData.notes.length > 0) {
      const notes: OfflineNote[] = bootstrapData.notes.map((note: any) =>
        ensureUserPartition<OfflineNote>({
          id: note.id,
          title: note.title,
          content: note.content,
          contentEncrypted: note.contentEncrypted === true,
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
    } else {
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
    } else {
    }

    // Insert noteConnections
    if (bootstrapData.noteConnections && bootstrapData.noteConnections.length > 0) {
      const noteConnections: OfflineNoteConnection[] = bootstrapData.noteConnections.map((nc: any) =>
        ensureUserPartition<OfflineNoteConnection>({
          id: nc.id,
          fromNoteId: nc.fromNoteId,
          toNoteId: nc.toNoteId,
          spaceId: nc.spaceId ?? null,
          syncStatus: 'synced',
          lastModified: new Date(nc.createdAt).getTime(),
          serverVersion: new Date(nc.createdAt).getTime(),
          createdAt: new Date(nc.createdAt),
          updatedAt: null,
        }, userId)
      );
      await offlineDB.noteConnections.bulkPut(noteConnections);
    } else {
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
    } else {
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
    } else {
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
        currentSeason: um.currentSeason ?? getCurrentSeason(),
        lastMonthlyVisit: um.lastMonthlyVisit ? new Date(um.lastMonthlyVisit) : null,
        churchAddedAt: um.churchAddedAt ? new Date(um.churchAddedAt) : null,
        appearanceSettings: um.appearanceSettings ?? null,
        syncStatus: 'synced',
        lastModified: new Date(um.updatedAt || um.createdAt).getTime(),
        serverVersion: new Date(um.updatedAt || um.createdAt).getTime(),
        createdAt: new Date(um.createdAt),
        updatedAt: um.updatedAt ? new Date(um.updatedAt) : null,
      }, userId);
      await offlineDB.userMetadata.put(userMetadata);
      dispatchAppearanceAccountSync(um.appearanceSettings ?? null);

      // Cache highestSimpleNoteId in localStorage for instant offline access
      if (um.highestSimpleNoteId !== undefined) {
        cacheHighestSimpleNoteId(userId, um.highestSimpleNoteId);
      }
    } else {
    }

    // Update sync state
    const syncStateUpdate = {
      lastSyncCursor: bootstrapData.cursor,
      lastSyncTimestamp: Date.now(),
      lastBootstrapTimestamp: Date.now(),
      isSyncing: false,
      syncError: null,
    };
    await updateSyncState(userId, syncStateUpdate);

  } catch (error) {
    console.error('[applyBootstrapData] ❌ Error applying bootstrap data:', {
      error,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      userId
    });
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
            color: normalizeThreadColor(thread.color),
            isPublic: thread.isPublic,
            isPinned: thread.isPinned,
            order: thread.order,
            // Preserve local lastVisited if server value is null (prevents sync from wiping local visits)
            lastVisited: thread.lastVisited ? new Date(thread.lastVisited) : (existing?.lastVisited || null),
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
            contentEncrypted: (note as any).contentEncrypted === true,
            threadId: note.threadId,
            spaceId: note.spaceId,
            simpleNoteId: note.simpleNoteId,
            noteType: note.noteType,
            addedBy: note.addedBy,
            isPublic: note.isPublic,
            isFeatured: note.isFeatured,
            order: note.order,
            // Preserve local lastVisited if server value is null (prevents sync from wiping local visits)
            lastVisited: note.lastVisited ? new Date(note.lastVisited) : (existing?.lastVisited || null),
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

    // Apply noteConnections
    if (changes.noteConnections && changes.noteConnections.length > 0) {
      for (const nc of changes.noteConnections) {
        const existing = await offlineDB.noteConnections.where('[userId+id]').equals([userId, nc.id]).first();
        const lastModified = new Date(nc.createdAt).getTime();

        if (!existing || lastModified >= (existing.lastModified || 0)) {
          const offlineConnection: OfflineNoteConnection = ensureUserPartition<OfflineNoteConnection>({
            id: nc.id,
            fromNoteId: nc.fromNoteId,
            toNoteId: nc.toNoteId,
            spaceId: nc.spaceId ?? null,
            syncStatus: 'synced',
            lastModified,
            serverVersion: lastModified,
            createdAt: new Date(nc.createdAt),
            updatedAt: null,
          }, userId);
          await offlineDB.noteConnections.put(offlineConnection);
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
          currentSeason: um.currentSeason ?? getCurrentSeason(),
          lastMonthlyVisit: um.lastMonthlyVisit ? new Date(um.lastMonthlyVisit) : null,
          churchAddedAt: um.churchAddedAt ? new Date(um.churchAddedAt) : null,
          appearanceSettings: um.appearanceSettings ?? null,
          syncStatus: 'synced',
          lastModified,
          serverVersion: lastModified,
          createdAt: new Date(um.createdAt),
          updatedAt: um.updatedAt ? new Date(um.updatedAt) : null,
        }, userId);
        await offlineDB.userMetadata.put(userMetadata);
        dispatchAppearanceAccountSync(um.appearanceSettings ?? null);

        // Cache highestSimpleNoteId in localStorage for instant offline access
        if (um.highestSimpleNoteId !== undefined) {
          cacheHighestSimpleNoteId(userId, um.highestSimpleNoteId);
        }

        appliedCount++;
      }
    }

    // Apply deletions after upserts so server tombstones always win.
    if (Array.isArray(changes.deletedNoteIds) && changes.deletedNoteIds.length > 0) {
      for (const noteId of changes.deletedNoteIds as string[]) {
        await offlineDB.notes.where('[userId+id]').equals([userId, noteId]).delete();
        const noteThreadRows = await offlineDB.noteThreads.where('[userId+noteId]').equals([userId, noteId]).toArray();
        for (const row of noteThreadRows) {
          await offlineDB.noteThreads.delete(row.id);
        }
        const noteTagRows = await offlineDB.noteTags.where('[userId+noteId]').equals([userId, noteId]).toArray();
        for (const row of noteTagRows) {
          await offlineDB.noteTags.delete(row.id);
        }
      }
      appliedCount += changes.deletedNoteIds.length;
    }

    if (Array.isArray(changes.deletedThreadIds) && changes.deletedThreadIds.length > 0) {
      for (const threadId of changes.deletedThreadIds as string[]) {
        await offlineDB.threads.where('[userId+id]').equals([userId, threadId]).delete();
        const threadLinks = await offlineDB.noteThreads.where('[userId+threadId]').equals([userId, threadId]).toArray();
        for (const link of threadLinks) {
          await offlineDB.noteThreads.delete(link.id);
        }
      }
      appliedCount += changes.deletedThreadIds.length;
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

/** Advance cursor when a changes page has no upserts (still moves the incremental window forward). */
async function advanceSyncCursorOnly(userId: string, cursor: string): Promise<void> {
  await updateSyncState(userId, {
    lastSyncCursor: cursor,
    lastSyncTimestamp: Date.now(),
    isSyncing: false,
    syncError: null,
  });
}

/**
 * Pull changes from server (incremental sync)
 */
export async function pullChanges(userId: string): Promise<SyncResult> {
  if (!navigator.onLine) {
    return { success: false, error: 'Offline' };
  }

  try {
    let totalApplied = 0;
    let remoteChanged = false;
    let hasMore = true;

    while (hasMore) {
      const syncState = await getSyncState(userId);
      const sinceCursor = syncState?.lastSyncCursor || null;

      if (!sinceCursor) {
        return { success: false, error: 'Bootstrap required' };
      }

      const response = await safeFetch(`/api/sync/changes?since=${encodeURIComponent(sinceCursor)}`, {
        method: 'GET',
        retries: 3,
        retryDelay: 1000,
        timeout: 45000,
      });

      if (!response) {
        return { success: false, error: 'Sync failed: Request failed after retries' };
      }

      if (!response.ok) {
        const errorType = classifySyncError(response.status);
        const errorMessage = `Sync failed: ${response.status} ${response.statusText}`;

        if (errorType !== 'server' && errorType !== 'transient') {
          console.error('Error pulling changes:', errorMessage);
        }

        return {
          success: false,
          error: errorMessage,
        };
      }

      const changes = await response.json();
      hasMore = changes.hasMore === true;

      if (!changes.hasChanges) {
        if (typeof changes.cursor === 'string' && changes.cursor.length > 0) {
          await advanceSyncCursorOnly(userId, changes.cursor);
        }
        continue;
      }

      totalApplied += await applyIncrementalChanges(userId, changes);
      remoteChanged = true;
    }

    if (remoteChanged) {
      dispatchRemoteSyncCompleted();
    }

    return { success: true, pulledCount: totalApplied };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorType = classifySyncError(errorMessage);
    
    // Completely suppress logging for server/transient errors
    // These are expected during retries and safeFetch already handles logging
    if (errorType !== 'server' && errorType !== 'transient') {
      console.error('Error pulling changes:', error);
    }
    // For server/transient errors, don't log anything
    
    return {
      success: false,
      error: errorMessage,
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
      const errorText = await response.text().catch(() => 'Could not read error response');
      console.error('[bootstrapSync] ❌ Bootstrap API failed:', {
        status: response.status,
        statusText: response.statusText,
        errorText
      });
      throw new Error(`Bootstrap failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    // Check Content-Type before parsing to avoid HTML parsing errors
    const contentType = response.headers.get('Content-Type');
    if (!contentType || !contentType.includes('application/json')) {
      const responseText = await response.text().catch(() => 'Could not read response');
      console.error('[bootstrapSync] ❌ Expected JSON but got:', {
        contentType,
        responsePreview: responseText.slice(0, 200)
      });
      // This is likely an auth redirect - return a silent auth error
      throw new Error('AUTH_NOT_READY');
    }

    const bootstrapData = await response.json();

    await applyBootstrapData(userId, bootstrapData);

    // Clear isSyncing flag on success
    await updateSyncState(userId, { isSyncing: false });

    const pulledCount = bootstrapData.notes?.length || 0;
    return {
      success: true,
      pulledCount,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    console.error('[bootstrapSync] ❌ Error bootstrapping sync:', {
      error,
      message: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
      userId
    });

    // Don't save AUTH_NOT_READY errors to sync state (no user-facing error)
    const syncError = errorMessage === 'AUTH_NOT_READY' ? null : errorMessage;

    await updateSyncState(userId, {
      isSyncing: false,
      syncError,
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
    // Ensure database is open before querying
    await ensureDatabaseOpen();
    
    return await retryIndexedDBOperation(async () => {
      return await offlineDB.syncState.where('userId').equals(userId).first() || null;
    });
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
    // Ensure database is open before operations
    await ensureDatabaseOpen();
    
    await retryIndexedDBOperation(async () => {
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
    });
  } catch (error) {
    console.error('[updateSyncState] ❌ Error updating sync state:', {
      error,
      message: error instanceof Error ? error.message : String(error),
      userId,
      updates
    });
  }
}

/**
 * Update cache timestamp in sync state
 * Called after service worker cache is updated
 */
export async function updateCacheTimestamp(userId: string): Promise<void> {
  try {
    await updateSyncState(userId, {
      lastCacheUpdate: Date.now()
    });
  } catch (error) {
    console.error('[updateCacheTimestamp] Error updating cache timestamp:', error);
  }
}

/**
 * Enqueue a mutation for sync
 */
export async function enqueueMutation(userId: string, operation: Omit<SyncOperation, 'userId' | 'id' | 'timestamp' | 'retryCount' | 'clientMutationId'>): Promise<void> {
  try {
    await offlineDB.syncQueue.add({
      ...operation,
      userId,
      timestamp: Date.now(),
      retryCount: 0,
      clientMutationId: crypto.randomUUID(),
    });
    // Immediately push changes instead of waiting for next poll interval
    triggerImmediateSync(userId);
  } catch (error) {
    console.error('Error enqueuing mutation:', error);
    throw error;
  }
}

/**
 * Reflect a push-only outcome in sync state. Connection-level failures set syncError;
 * successful pushes clear stale errors. Per-op failures are surfaced via the queue's failed count.
 */
export async function recordPushQueueOutcome(userId: string, pushResult: SyncResult): Promise<void> {
  await updateSyncState(userId, {
    isSyncing: false,
    syncError: pushResult.success ? null : pushResult.error ?? 'Sync failed',
  });
}

/** Push the offline queue and update sync state (prototype push-only paths). */
export async function flushPushQueue(userId: string): Promise<SyncResult> {
  const result = await pushQueue(userId);
  await recordPushQueueOutcome(userId, result);
  return result;
}

/**
 * Clear a stale `isSyncing` flag when the queue is empty (e.g. interrupted classic sync).
 * Safe to call offline — does not attempt a network push.
 */
export async function clearStaleSyncingIfIdle(userId: string): Promise<void> {
  await ensureDatabaseOpen();
  const pending = await retryIndexedDBOperation(async () =>
    offlineDB.syncQueue
      .where('userId')
      .equals(userId)
      .filter((op) => op.retryCount < 5)
      .count(),
  );
  if (pending === 0) {
    await recordPushQueueOutcome(userId, { success: true, pushedCount: 0 });
  }
}

/**
 * Prototype is online-first — a bloated local queue cannot drain and blocks the sync chip.
 * Clears the entire queue when pending exceeds the unhealthy threshold (server data is authoritative).
 */
export async function recoverPrototypeSyncQueueIfBloated(userId: string): Promise<number> {
  if (typeof window === 'undefined' || !isPrototypeShellPath(window.location.pathname)) {
    return 0;
  }

  await ensureDatabaseOpen();

  const pending = await retryIndexedDBOperation(async () =>
    offlineDB.syncQueue
      .where('userId')
      .equals(userId)
      .filter((op) => op.retryCount < 5)
      .count(),
  );

  if (pending <= SYNC_QUEUE_UNHEALTHY_THRESHOLD) {
    return 0;
  }

  console.warn('[Sync] Clearing bloated prototype sync queue', { pending, userId });
  return clearStuckSyncQueue(userId, { entireQueue: true });
}

/** Prototype online-first: drop stale note update/delete ops the server no longer has. */
export function shouldDropStalePrototypeQueueOp(
  op: Pick<SyncOperation, 'entityType' | 'operation'>,
  errorType: SyncErrorType,
): boolean {
  if (typeof window === 'undefined') return false;
  if (!isPrototypeShellPath(window.location.pathname)) return false;
  if (errorType !== 'not_found') return false;
  return op.entityType === 'note' && (op.operation === 'update' || op.operation === 'delete');
}

/**
 * Push queued mutations to server
 */
export async function pushQueue(userId: string): Promise<SyncResult> {
  if (!navigator.onLine) {
    return { success: false, error: 'Offline' };
  }

  try {
    // Cap in-memory work — never load hundreds of thousands of rows (see recoverPrototypeSyncQueueIfBloated).
    const fetchCap = MAX_NOTE_CREATES_PER_SYNC_PUSH * 3;
    const pendingCandidates = await offlineDB.syncQueue
      .where('userId')
      .equals(userId)
      .filter((op) => op.retryCount < 5)
      .limit(fetchCap)
      .toArray();

    if (pendingCandidates.length === 0) {
      return { success: true, pushedCount: 0 };
    }

    // Sort mutations by dependency order to ensure dependencies are processed first
    const sortedOps = pendingCandidates
      .sort((a, b) => {
        const order: Record<string, number> = { space: 1, thread: 2, note: 3, noteThread: 4, tag: 5, noteTag: 6 };
        return (order[a.entityType] || 99) - (order[b.entityType] || 99);
      })
      .slice(0, MAX_NOTE_CREATES_PER_SYNC_PUSH);

    // Prepare mutations for batch push
    const mutations = sortedOps.map(op => ({
      operation: op.operation,
      entityType: op.entityType,
      entityId: op.entityId,
      data: op.data,
      operationId: op.id,
      clientMutationId: op.clientMutationId,
    }));

    // Send batch to server
    const response = await fetch('/api/sync/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mutations }),
      credentials: 'include',
    });


    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Sync] Push failed with error response:', errorText);
      throw new Error(`Push failed: ${response.status} ${response.statusText}`);
    }

    const pushPayload = await response.json();
    const results = pushPayload.results || [];

    // Process results and update local state
    let pushedCount = 0;
    for (const res of results) {
      const op = sortedOps.find(o => o.id === res.operationId);
      if (!op) {
        console.warn('[Sync] Could not find operation in pendingOps for ID:', res.operationId);
        continue;
      }

      if (res.success) {
        
        // Update entity with server ID if provided
        if (res.serverId && res.serverId !== op.entityId) {
          await updateEntityId(op.entityType, op.entityId, res.serverId, userId);
        }

        const targetEntityId = res.serverId || op.entityId;
        if (op.operation === 'delete') {
          await removeEntityLocally(op.entityType, targetEntityId, userId);
        } else {
          // Mark entity as synced with potential server data (like color)
          if (res.data) {
            await markEntitySynced(op.entityType, targetEntityId, userId, res.data);
          } else {
            await markEntitySynced(op.entityType, targetEntityId, userId);
          }
        }
        
        // Remove from queue
        await offlineDB.syncQueue.delete(op.id!);
        pushedCount++;
      } else {
        const errorMessage = res.error || 'Unknown error';
        const errorType = classifySyncError(errorMessage);
        const shouldRetry = shouldRetryError(errorType);
        
        console.error(`[Sync] Operation ${res.operationId} failed on server:`, {
          error: errorMessage,
          errorType,
          shouldRetry,
          currentRetryCount: op.retryCount
        });
        
        if (shouldRetry) {
          // Transient/server errors - increment retry count
          await offlineDB.syncQueue.update(op.id!, {
            retryCount: op.retryCount + 1,
            lastError: errorMessage,
          });
        } else if (shouldDropStalePrototypeQueueOp(op, errorType)) {
          // Prototype reads from the server; a queued edit for a missing note will never apply.
          await offlineDB.syncQueue.delete(op.id!);
        } else {
          // Permanent errors - mark with high retry count to stop retrying
          // but keep in queue so user can see it failed
          await offlineDB.syncQueue.update(op.id!, {
            retryCount: 999, // High count to prevent further retries
            lastError: `[${errorType}] ${errorMessage}`,
          });
        }
      }
    }

    const pushResult: SyncResult = { success: true, pushedCount, results };
    if (pendingCandidates.length > sortedOps.length) {
      triggerImmediateSync(userId);
    }
    return pushResult;
  } catch (error) {
    console.error('[Sync] Error pushing queue:', error);
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
    // Update the entity ID in IndexedDB
    switch (entityType) {
      case 'space':
        await offlineDB.spaces.where('[userId+id]').equals([userId, oldId]).modify({ id: newId });
        break;
      case 'thread':
        await offlineDB.threads.where('[userId+id]').equals([userId, oldId]).modify({ id: newId });
        
        // Update any pending note mutations that reference this threadId
        const threadOps = await offlineDB.syncQueue
          .where('userId')
          .equals(userId)
          .filter(op => 
            (op.entityType === 'note' || op.entityType === 'noteThread') &&
            op.data?.threadId === oldId &&
            op.retryCount < 5
          )
          .toArray();
        
        for (const op of threadOps) {
          await offlineDB.syncQueue.update(op.id!, {
            data: { ...op.data, threadId: newId }
          });
        }
        break;
      case 'note':
        await offlineDB.notes.where('[userId+id]').equals([userId, oldId]).modify({ id: newId });
        
        // Update any pending NoteThread mutations that reference this noteId
        const noteThreadOps = await offlineDB.syncQueue
          .where('userId')
          .equals(userId)
          .filter(op => 
            op.entityType === 'noteThread' && 
            op.data?.noteId === oldId &&
            op.retryCount < 5
          )
          .toArray();
        
        for (const op of noteThreadOps) {
          await offlineDB.syncQueue.update(op.id!, {
            data: { ...op.data, noteId: newId }
          });
        }
        break;
      case 'noteThread':
        await offlineDB.noteThreads.where('[userId+id]').equals([userId, oldId]).modify({ id: newId });
        break;
      case 'tag':
        await offlineDB.tags.where('[userId+id]').equals([userId, oldId]).modify({ id: newId });

        // Update any pending noteTag mutations that reference this (newly server-assigned) tagId,
        // so a tag created offline + assigned in the same batch links to the real tag id on push.
        const tagNoteTagOps = await offlineDB.syncQueue
          .where('userId')
          .equals(userId)
          .filter(op =>
            op.entityType === 'noteTag' &&
            op.data?.tagId === oldId &&
            op.retryCount < 5
          )
          .toArray();

        for (const op of tagNoteTagOps) {
          await offlineDB.syncQueue.update(op.id!, {
            data: { ...op.data, tagId: newId }
          });
        }
        break;
      case 'noteTag':
        await offlineDB.noteTags.where('[userId+id]').equals([userId, oldId]).modify({ id: newId });
        break;
    }
    
    // Update navigation state if we're in the browser
    if (typeof window !== 'undefined') {
      const currentPath = window.location.pathname;
      const currentItemId = extractIdFromPath(currentPath);

      // Always notify reconciliation listeners (e.g. the prototype SPA's React Query
      // cache bridge) of a local→server id swap, even when the swapped item is not the
      // one currently on screen — list/detail caches elsewhere still hold the local id.
      window.dispatchEvent(new CustomEvent('harvous:entityIdReconciled', {
        detail: { oldId, newId, entityType },
      }));

      // If user is currently viewing this item, update the URL (both DB ids)
      if (currentItemId === oldId) {
        const newUrl = idToUrl(newId);
        // Use replace to avoid adding to history
        window.history.replaceState({}, '', newUrl);
        
        // Dispatch event to notify components of ID change
        window.dispatchEvent(new CustomEvent('entityIdChanged', {
          detail: { oldId, newId, entityType }
        }));
      }
      
      // Update navigation history if it exists
      try {
        const navHistoryStr = sessionStorage.getItem('harvous-navigation-history');
        if (navHistoryStr) {
          const navHistory = JSON.parse(navHistoryStr);
          const updated = navHistory.map((item: any) => 
            item.id === oldId ? { ...item, id: newId } : item
          );
          sessionStorage.setItem('harvous-navigation-history', JSON.stringify(updated));
        }
      } catch (e) {
        console.warn('[updateEntityId] Failed to update navigation history:', e);
      }
      
      // Update persistent navigation if it exists
      try {
        const persistentNavStr = localStorage.getItem('harvous-persistent-navigation');
        if (persistentNavStr) {
          const persistentNav = JSON.parse(persistentNavStr);
          const updated = persistentNav.map((item: any) => 
            item.id === oldId ? { ...item, id: newId } : item
          );
          localStorage.setItem('harvous-persistent-navigation', JSON.stringify(updated));
        }
      } catch (e) {
        console.warn('[updateEntityId] Failed to update persistent navigation:', e);
      }
      
      // Update recently created items in sessionStorage
      try {
        // Update recentlyCreatedNotes
        const recentNotesStr = sessionStorage.getItem('recentlyCreatedNotes');
        if (recentNotesStr && entityType === 'note') {
          const recentNotes = JSON.parse(recentNotesStr);
          const updated = recentNotes.map((item: any) => 
            item.id === oldId ? { ...item, id: newId } : item
          );
          sessionStorage.setItem('recentlyCreatedNotes', JSON.stringify(updated));
        }
        
        // Update recentlyCreatedThreads
        const recentThreadsStr = sessionStorage.getItem('recentlyCreatedThreads');
        if (recentThreadsStr && entityType === 'thread') {
          const recentThreads = JSON.parse(recentThreadsStr);
          const updated = recentThreads.map((item: any) => 
            item.id === oldId ? { ...item, id: newId } : item
          );
          sessionStorage.setItem('recentlyCreatedThreads', JSON.stringify(updated));
        }
      } catch (e) {
        console.warn('[updateEntityId] Failed to update recently created items:', e);
      }
      
      // Update thread context references in localStorage
      if (entityType === 'thread') {
        try {
          const referrerThreadId = localStorage.getItem('harvous-referrer-thread-context');
          if (referrerThreadId === oldId) {
            localStorage.setItem('harvous-referrer-thread-context', newId);
          }
          
          const currentThreadId = localStorage.getItem('harvous-current-thread-context');
          if (currentThreadId === oldId) {
            localStorage.setItem('harvous-current-thread-context', newId);
          }
          
          const newNoteThread = localStorage.getItem('newNoteThread');
          if (newNoteThread === oldId) {
            localStorage.setItem('newNoteThread', newId);
          }
          
          // REMOVED: harvous-pending-thread is no longer used
          // Navigation history is now managed solely by NavigationContext.handleNoteCreated
        } catch (e) {
          console.warn('[updateEntityId] Failed to update thread context references:', e);
        }
      }
    }
  } catch (error) {
    console.error('Error updating entity ID:', error);
  }
}

/**
 * Mark entity as synced
 */
async function markEntitySynced(entityType: string, entityId: string, userId: string, data?: any): Promise<void> {
  try {
    const now = Date.now();
    const updateData: { syncStatus: SyncStatus; lastModified: number; serverVersion: number; [key: string]: any } = {
      syncStatus: 'synced' as SyncStatus,
      lastModified: now,
      serverVersion: now,
    };

    // Include any additional data returned from the server (e.g. assigned color)
    if (data) {
      Object.assign(updateData, data);
    }

    switch (entityType) {
      case 'space':
        await offlineDB.spaces.where('[userId+id]').equals([userId, entityId]).modify(updateData);
        break;
      case 'thread':
        // Get thread before modifying to verify color is preserved
        const threadBefore = await offlineDB.threads.where('[userId+id]').equals([userId, entityId]).first();

        await offlineDB.threads.where('[userId+id]').equals([userId, entityId]).modify(updateData);

        // Verify color is still there after modify
        const threadAfter = await offlineDB.threads.where('[userId+id]').equals([userId, entityId]).first();
        break;
      case 'note':
        await offlineDB.notes.where('[userId+id]').equals([userId, entityId]).modify(updateData);
        break;
      case 'noteThread':
        await offlineDB.noteThreads.where('[userId+id]').equals([userId, entityId]).modify(updateData);
        break;
      case 'tag':
        await offlineDB.tags.where('[userId+id]').equals([userId, entityId]).modify(updateData);
        break;
      case 'noteTag':
        await offlineDB.noteTags.where('[userId+id]').equals([userId, entityId]).modify(updateData);
        break;
    }
  } catch (error) {
    console.error('Error marking entity as synced:', error);
  }
}

async function removeEntityLocally(entityType: string, entityId: string, userId: string): Promise<void> {
  switch (entityType) {
    case 'space':
      await offlineDB.spaces.where('[userId+id]').equals([userId, entityId]).delete();
      break;
    case 'thread':
      await offlineDB.threads.where('[userId+id]').equals([userId, entityId]).delete();
      {
        const links = await offlineDB.noteThreads.where('[userId+threadId]').equals([userId, entityId]).toArray();
        for (const link of links) await offlineDB.noteThreads.delete(link.id);
      }
      break;
    case 'note':
      await offlineDB.notes.where('[userId+id]').equals([userId, entityId]).delete();
      {
        const links = await offlineDB.noteThreads.where('[userId+noteId]').equals([userId, entityId]).toArray();
        for (const link of links) await offlineDB.noteThreads.delete(link.id);
        const tags = await offlineDB.noteTags.where('[userId+noteId]').equals([userId, entityId]).toArray();
        for (const tag of tags) await offlineDB.noteTags.delete(tag.id);
      }
      break;
    case 'noteThread':
      await offlineDB.noteThreads.where('[userId+id]').equals([userId, entityId]).delete();
      break;
    case 'tag':
      await offlineDB.tags.where('[userId+id]').equals([userId, entityId]).delete();
      break;
    case 'noteTag':
      await offlineDB.noteTags.where('[userId+id]').equals([userId, entityId]).delete();
      break;
  }
}

/**
 * Re-queue stuck mutations (retryCount >= 5) and flush. Mirrors native retryStuckNotes:
 * reset exhausted/permanent failures so pushQueue will pick them up again.
 */
/**
 * Remove stuck or bloated sync-queue rows for one user. Server notes are untouched.
 * @param entireQueue When true, deletes every queued op (use for unhealthy/bloated queues).
 */
export async function clearStuckSyncQueue(
  userId: string,
  opts?: { entireQueue?: boolean },
): Promise<number> {
  await ensureDatabaseOpen();

  if (opts?.entireQueue) {
    const removed = await retryIndexedDBOperation(async () => {
      const count = await offlineDB.syncQueue.where('userId').equals(userId).count();
      await offlineDB.syncQueue.where('userId').equals(userId).delete();
      return count;
    });
    await updateSyncState(userId, { syncError: null });
    return removed;
  }

  const stuck = await retryIndexedDBOperation(async () =>
    offlineDB.syncQueue
      .where('userId')
      .equals(userId)
      .filter((op) => op.retryCount >= 5)
      .toArray(),
  );

  for (const op of stuck) {
    await offlineDB.syncQueue.delete(op.id!);
  }
  if (stuck.length > 0) {
    await updateSyncState(userId, { syncError: null });
  }
  return stuck.length;
}

export async function retryStuckQueue(userId: string): Promise<SyncResult> {
  if (!navigator.onLine) {
    return { success: false, error: 'Offline' };
  }

  try {
    await ensureDatabaseOpen();

    const stuckOps = await retryIndexedDBOperation(async () =>
      offlineDB.syncQueue
        .where('userId')
        .equals(userId)
        .filter((op) => op.retryCount >= 5)
        .toArray(),
    );

    for (const op of stuckOps) {
      await offlineDB.syncQueue.update(op.id!, {
        retryCount: 0,
        lastError: undefined,
      });
    }

    await updateSyncState(userId, { syncError: null });

    const onPrototype =
      typeof window !== 'undefined' && isPrototypeShellPath(window.location.pathname);

    if (onPrototype) {
      return flushPushQueue(userId);
    }

    return syncNow(userId);
  } catch (error) {
    console.error('[Sync] retryStuckQueue error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
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
    const needsBoot = await needsBootstrap(userId);
    if (needsBoot) {
      const bootstrapResult = await bootstrapSync(userId);
      if (!bootstrapResult.success) {
        // Clear isSyncing flag before returning
        await updateSyncState(userId, { isSyncing: false });
        return bootstrapResult;
      }
    }

    // Pull changes
    const pullResult = await pullChanges(userId);
    
    // Completely suppress logging for transient/server errors - safeFetch already handled retries
    const pullErrorType = pullResult.error ? classifySyncError(pullResult.error) : null;
    if (pullResult.success || (pullErrorType !== 'server' && pullErrorType !== 'transient')) {
      // Only log non-transient errors or successful results
    }
    // For transient/server errors, don't log anything - completely silent
    
    if (!pullResult.success && pullResult.error !== 'Bootstrap required') {
      // For transient/server errors, don't mark sync as failed - it will retry later
      if (pullErrorType === 'server' || pullErrorType === 'transient') {
        // Clear isSyncing flag but don't set syncError for transient issues
        await updateSyncState(userId, { isSyncing: false });
        return {
          success: false,
          error: pullResult.error,
        };
      }
      
      // Clear isSyncing flag before returning
      await updateSyncState(userId, { isSyncing: false });
      return pullResult;
    }

    // Push queue
    const pushResult = await pushQueue(userId);
    await recordPushQueueOutcome(userId, pushResult);

    return {
      success: pushResult.success,
      error: pushResult.error,
      pulledCount: pullResult.pulledCount || 0,
      pushedCount: pushResult.pushedCount || 0,
    };
  } catch (error) {
    console.error('[Sync] syncNow error:', error);
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
    const needsBoot = !syncState || !syncState.lastBootstrapTimestamp;
    return needsBoot;
  } catch (error) {
    console.error('[needsBootstrap] ❌ Error checking bootstrap status:', error);
    return true; // Default to needing bootstrap on error
  }
}

// Module-level state for managing the background sync loop
let _bgSyncInterval: number | null = null;
let _bgSyncIntervalMs: number = 300000;
let _bgSyncFn: (() => Promise<void>) | null = null;
let _bgSyncCleanup: (() => void) | null = null;
let _immediateSyncTimeout: ReturnType<typeof setTimeout> | null = null;

/**
 * Trigger a debounced push-only sync after mutations.
 *
 * Instead of calling syncNow() (pull + push = 2 API calls) on every single
 * enqueueMutation, this debounces with a 2-second window and only pushes
 * (1 API call). Pulls happen on the next background interval or tab visibility change.
 *
 * Example: creating a note fires 2 enqueueMutation calls (note + noteThread).
 * Without debounce: 2 full syncNow() = 4 API calls.
 * With debounce: 1 pushQueue() after 2s = 1 API call.
 */
export function triggerImmediateSync(userId: string): void {
  if (!navigator.onLine || document.visibilityState === 'hidden') return;

  // Debounce: batch mutations within 2 seconds into a single push
  if (_immediateSyncTimeout) {
    clearTimeout(_immediateSyncTimeout);
  }

  _immediateSyncTimeout = setTimeout(async () => {
    _immediateSyncTimeout = null;
    try {
      // Push-only (1 API call) instead of syncNow which does pull+push (2 API calls)
      // Pull happens on the next background interval or when tab becomes visible
      const pushResult = await flushPushQueue(userId);
      if (pushResult.success && (pushResult.pushedCount ?? 0) > 0) {
        dispatchRemoteSyncCompleted();
      }
    } catch (err) {
      console.error('[triggerImmediateSync] Error:', err);
    }
    // Reset background interval timer so next poll is a full interval from now
    if (_bgSyncInterval !== null && _bgSyncFn) {
      clearInterval(_bgSyncInterval);
      _bgSyncInterval = window.setInterval(_bgSyncFn, _bgSyncIntervalMs);
    }
  }, 2000);
}

/**
 * Start background sync loop
 */
export function startBackgroundSync(
  userId: string,
  intervalMs: number = 300000,
  options?: { pushOnly?: boolean },
): () => void {
  // Clean up any existing sync loop to prevent duplicates
  if (_bgSyncCleanup) {
    _bgSyncCleanup();
  }

  _bgSyncIntervalMs = intervalMs;

  // The prototype shell reads from React Query (the server), not the IndexedDB mirror,
  // so its loop only flushes the local mutation queue (push) and never pulls/bootstraps —
  // pulling would hydrate the read mirror this surface deliberately avoids.
  const sync = async () => {
    // Skip sync when tab is not visible to save serverless invocations
    if (document.visibilityState === 'hidden') return;
    if (navigator.onLine) {
      try {
        if (options?.pushOnly) {
          await flushPushQueue(userId);
        } else {
          await syncNow(userId);
        }
      } catch (error) {
        console.error('Background sync error:', error);
      }
    }
  };

  _bgSyncFn = sync;

  // Initial sync
  sync();

  // Set up interval
  _bgSyncInterval = window.setInterval(sync, intervalMs);

  // Sync when tab becomes visible again (user returns to the app)
  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible' && navigator.onLine) {
      sync();
      // Reset interval so next poll is a full interval from now
      if (_bgSyncInterval !== null) {
        clearInterval(_bgSyncInterval);
        _bgSyncInterval = window.setInterval(sync, intervalMs);
      }
    }
  };
  document.addEventListener('visibilitychange', handleVisibilityChange);

  // Also sync on online event - with delay to ensure connection is stable
  let onlineTimeout: ReturnType<typeof setTimeout> | null = null;
  const handleOnline = () => {
    // Clear any pending timeout to debounce rapid online/offline toggling
    if (onlineTimeout) {
      clearTimeout(onlineTimeout);
    }
    // Wait 1 second before syncing to ensure connection is stable
    onlineTimeout = setTimeout(() => {
      if (navigator.onLine) {
        sync();
      }
    }, 1000);
  };
  window.addEventListener('online', handleOnline);

  // Return cleanup function
  const cleanup = () => {
    if (_bgSyncInterval !== null) {
      clearInterval(_bgSyncInterval);
      _bgSyncInterval = null;
    }
    if (onlineTimeout) {
      clearTimeout(onlineTimeout);
    }
    window.removeEventListener('online', handleOnline);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
    if (_immediateSyncTimeout) {
      clearTimeout(_immediateSyncTimeout);
      _immediateSyncTimeout = null;
    }
    _bgSyncFn = null;
    _bgSyncCleanup = null;
  };

  _bgSyncCleanup = cleanup;
  return cleanup;
}

