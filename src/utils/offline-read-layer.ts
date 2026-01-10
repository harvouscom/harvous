import { 
  offlineDB, 
  type OfflineSpace, 
  type OfflineThread, 
  type OfflineNote, 
  type OfflineNoteThread, 
  type OfflineUserMetadata, 
  type SyncStatus 
} from './offline-db';
import { isOfflineModeEnabled } from './posthog';
import { sortByLastVisited, sortThreadsByLastVisited, normalizeDate } from '@/utils/sorting';

/**
 * Dashboard snapshot - all data needed for initial dashboard render
 */
export interface DashboardSnapshot {
  spaces: Array<{
    id: string;
    title: string;
    description: string | null;
    color: string | null;
    backgroundGradient: string | null;
    isPublic: boolean;
    isActive: boolean;
    order: number;
    threadCount: number;
    standaloneNoteCount: number;
    totalNoteCount: number;
    createdAt: Date;
    updatedAt: Date | null;
  }>;
  threads: Array<{
    id: string;
    title: string;
    subtitle: string | null;
    color: string | null;
    spaceId: string | null;
    isPublic: boolean;
    isPinned: boolean;
    order: number;
    noteCount: number;
    lastVisited: Date | null;
    createdAt: Date;
    updatedAt: Date | null;
  }>;
  recentNotes: Array<{
    id: string;
    title: string | null;
    content: string;
    threadId: string;
    spaceId: string | null;
    simpleNoteId: number | null;
    noteType: 'default' | 'scripture' | 'resource';
    isPublic: boolean;
    isFeatured: boolean;
    createdAt: Date;
    updatedAt: Date | null;
    lastVisited: Date | null;
    syncStatus?: 'synced' | 'pending' | 'conflict' | 'deleted';
  }>;
  userMetadata: {
    highestSimpleNoteId: number;
    reservedSimpleNoteIdRange: { start: number; end: number } | null;
    userColor: string;
    firstName: string | null;
    lastName: string | null;
  } | null;
}

/**
 * Get dashboard snapshot from local IndexedDB
 * Returns null if no data exists (first load scenario) or if offline mode is disabled
 */
export async function getDashboardSnapshotLocal(userId: string): Promise<DashboardSnapshot | null> {
  if (!isOfflineModeEnabled()) {
    return null; // Offline mode disabled - return null to trigger server fetch
  }

  try {
    // Check if we have any data for this user
    const hasData = await offlineDB.notes.where('userId').equals(userId).count() > 0;
    if (!hasData) {
      return null; // No local data - need bootstrap
    }

    // Fetch all data in parallel
    const [spaces, threads, recentNotes, userMetadata] = await Promise.all([
      getSpacesLocal(userId),
      getThreadsLocal(userId),
      getRecentNotesLocal(userId, 20),
      getUserMetadataLocal(userId)
    ]);

    // Calculate counts for spaces and threads
    const spaceThreadCounts = await getThreadCountsForSpaces(userId, spaces.map(s => s.id));
    const threadNoteCounts = await getNoteCountsForThreads(userId, threads.map(t => t.id));
    const spaceNoteCounts = await getNoteCountsForSpaces(userId, spaces.map(s => s.id));

    // Build spaces with counts
    const spacesWithCounts = spaces.map(space => ({
      ...space,
      threadCount: spaceThreadCounts.get(space.id) || 0,
      standaloneNoteCount: spaceNoteCounts.standalone.get(space.id) || 0,
      totalNoteCount: spaceNoteCounts.total.get(space.id) || 0,
    }));

    // Build threads with counts
    const threadsWithCounts = threads.map(thread => ({
      ...thread,
      noteCount: threadNoteCounts.get(thread.id) || 0,
    }));

    return {
      spaces: spacesWithCounts,
      threads: threadsWithCounts,
      recentNotes: recentNotes.map(note => ({
        id: note.id,
        title: note.title,
        content: note.content,
        threadId: note.threadId,
        spaceId: note.spaceId,
        simpleNoteId: note.simpleNoteId,
        noteType: note.noteType,
        isPublic: note.isPublic,
        isFeatured: note.isFeatured,
        createdAt: note.createdAt,
        updatedAt: note.updatedAt,
        lastVisited: note.lastVisited,
        syncStatus: note.syncStatus,
      })),
      userMetadata: userMetadata ? {
        highestSimpleNoteId: userMetadata.highestSimpleNoteId,
        reservedSimpleNoteIdRange: userMetadata.reservedSimpleNoteIdRange,
        userColor: userMetadata.userColor,
        firstName: userMetadata.firstName,
        lastName: userMetadata.lastName,
      } : null,
    };
  } catch (error) {
    console.error('Error getting dashboard snapshot from local DB:', error);
    return null;
  }
}

/**
 * Get all spaces for a user from local DB
 */
export async function getSpacesLocal(userId: string): Promise<OfflineSpace[]> {
  if (!isOfflineModeEnabled()) {
    return []; // Offline mode disabled - return empty array
  }

  try {
    return await offlineDB.spaces
      .where('userId')
      .equals(userId)
      .filter(space => space.syncStatus !== 'deleted')
      .sortBy('order');
  } catch (error) {
    console.error('Error getting spaces from local DB:', error);
    return [];
  }
}

/**
 * Get all threads for a user from local DB
 * Sorted by isPinned (pinned first), then lastVisited/updatedAt/createdAt (newest first)
 * This matches the server-side sorting in getAllThreadsWithCounts
 */
export async function getThreadsLocal(userId: string): Promise<OfflineThread[]> {
  if (!isOfflineModeEnabled()) {
    return []; // Offline mode disabled - return empty array
  }

  try {
    const threads = await offlineDB.threads
      .where('userId')
      .equals(userId)
      .filter(thread => thread.syncStatus !== 'deleted' && thread.id !== 'thread_unorganized')
      .toArray();

    // Sort using shared sorting utility that matches server-side logic
    // isPinned first, then by lastVisited/updatedAt/createdAt, with ID tiebreaker
    return sortThreadsByLastVisited(threads.map(thread => ({
      ...thread,
      updatedAt: thread.updatedAt || thread.createdAt,
      id: thread.id
    })));
  } catch (error) {
    console.error('Error getting threads from local DB:', error);
    return [];
  }
}

/**
 * Get threads for a specific space from local DB
 * Sorted by isPinned (pinned first), then lastVisited/updatedAt/createdAt (newest first)
 * This matches the server-side sorting in getThreadsForSpace
 */
export async function getThreadsForSpaceLocal(userId: string, spaceId: string): Promise<OfflineThread[]> {
  try {
    const threads = await offlineDB.threads
      .where('[userId+spaceId]')
      .equals([userId, spaceId])
      .filter(thread => thread.syncStatus !== 'deleted')
      .toArray();

    // Sort using shared sorting utility that matches server-side logic
    // isPinned first, then by lastVisited/updatedAt/createdAt, with ID tiebreaker
    return sortThreadsByLastVisited(threads.map(thread => ({
      ...thread,
      updatedAt: thread.updatedAt || thread.createdAt,
      id: thread.id
    })));
  } catch (error) {
    console.error('Error getting threads for space from local DB:', error);
    return [];
  }
}

/**
 * Get a single note by ID from local DB
 */
export async function getNoteLocal(userId: string, noteId: string): Promise<OfflineNote | null> {
  if (!isOfflineModeEnabled()) {
    return null; // Offline mode disabled - return null to trigger server fetch
  }

  try {
    const note = await offlineDB.notes
      .where('[userId+id]')
      .equals([userId, noteId])
      .first();
    
    if (!note || note.syncStatus === 'deleted') {
      return null;
    }
    
    return note;
  } catch (error) {
    console.error('Error getting note from local DB:', error);
    return null;
  }
}

/**
 * Get a single thread by ID from local DB
 */
export async function getThreadLocal(userId: string, threadId: string): Promise<OfflineThread | null> {
  if (!isOfflineModeEnabled()) {
    return null; // Offline mode disabled - return null to trigger server fetch
  }

  try {
    const thread = await offlineDB.threads
      .where('[userId+id]')
      .equals([userId, threadId])
      .first();
    
    if (!thread || thread.syncStatus === 'deleted') {
      return null;
    }
    
    return thread;
  } catch (error) {
    console.error('Error getting thread from local DB:', error);
    return null;
  }
}

/**
 * Get a single space by ID from local DB
 */
export async function getSpaceLocal(userId: string, spaceId: string): Promise<OfflineSpace | null> {
  if (!isOfflineModeEnabled()) {
    return null; // Offline mode disabled - return null to trigger server fetch
  }

  try {
    const space = await offlineDB.spaces
      .where('[userId+id]')
      .equals([userId, spaceId])
      .first();
    
    if (!space || space.syncStatus === 'deleted') {
      return null;
    }
    
    return space;
  } catch (error) {
    console.error('Error getting space from local DB:', error);
    return null;
  }
}

/**
 * Get recent notes from local DB (sorted by lastVisited/updatedAt/createdAt)
 */
export async function getRecentNotesLocal(userId: string, limit: number = 20): Promise<OfflineNote[]> {
  try {
    const notes = await offlineDB.notes
      .where('userId')
      .equals(userId)
      .filter(note => note.syncStatus !== 'deleted')
      .toArray();
    
    // Sort using shared sorting utility that matches server-side logic
    // Items with lastVisited come first, then items without (sorted by updatedAt/createdAt)
    const sorted = sortByLastVisited(notes.map(note => ({
      ...note,
      updatedAt: note.updatedAt || note.createdAt,
      id: note.id
    })));
    
    return sorted.slice(0, limit);
  } catch (error) {
    console.error('Error getting recent notes from local DB:', error);
    return [];
  }
}

/**
 * Get notes for a specific thread from local DB
 */
export async function getNotesForThreadLocal(userId: string, threadId: string, limit: number = 20, offset: number = 0): Promise<{ notes: OfflineNote[]; hasMore: boolean }> {
  try {
    // Get all note-thread relationships for this thread
    const noteThreads = await offlineDB.noteThreads
      .where('[userId+threadId]')
      .equals([userId, threadId])
      .toArray();
    
    const noteIds = noteThreads.map(nt => nt.noteId);
    
    if (noteIds.length === 0) {
      return { notes: [], hasMore: false };
    }
    
    // Get the actual notes
    const allNotes = await offlineDB.notes
      .where('userId')
      .equals(userId)
      .filter(note => noteIds.includes(note.id) && note.syncStatus !== 'deleted')
      .toArray();
    
    // Sort using shared sorting utility that matches server-side logic
    // Items with lastVisited come first, then items without (sorted by updatedAt/createdAt)
    const sorted = sortByLastVisited(allNotes.map(note => ({
      ...note,
      updatedAt: note.updatedAt || note.createdAt,
      id: note.id
    })));
    
    const hasMore = sorted.length > offset + limit;
    const notes = sorted.slice(offset, offset + limit);
    
    return { notes, hasMore };
  } catch (error) {
    console.error('Error getting notes for thread from local DB:', error);
    return { notes: [], hasMore: false };
  }
}

/**
 * Get notes for a specific space from local DB
 */
export async function getNotesForSpaceLocal(userId: string, spaceId: string, limit: number = 20, offset: number = 0): Promise<{ notes: OfflineNote[]; hasMore: boolean }> {
  try {
    const allNotes = await offlineDB.notes
      .where('[userId+spaceId]')
      .equals([userId, spaceId])
      .filter(note => note.syncStatus !== 'deleted')
      .toArray();
    
    // Sort using shared sorting utility that matches server-side logic
    // Items with lastVisited come first, then items without (sorted by updatedAt/createdAt)
    const sorted = sortByLastVisited(allNotes.map(note => ({
      ...note,
      updatedAt: note.updatedAt || note.createdAt,
      id: note.id
    })));
    
    const hasMore = sorted.length > offset + limit;
    const notes = sorted.slice(offset, offset + limit);
    
    return { notes, hasMore };
  } catch (error) {
    console.error('Error getting notes for space from local DB:', error);
    return { notes: [], hasMore: false };
  }
}

/**
 * Get user metadata from local DB
 */
export async function getUserMetadataLocal(userId: string): Promise<OfflineUserMetadata | null> {
  try {
    return await offlineDB.userMetadata
      .where('userId')
      .equals(userId)
      .first() || null;
  } catch (error) {
    console.error('Error getting user metadata from local DB:', error);
    return null;
  }
}

/**
 * Helper: Get thread counts for multiple spaces
 */
async function getThreadCountsForSpaces(userId: string, spaceIds: string[]): Promise<Map<string, number>> {
  if (spaceIds.length === 0) {
    return new Map();
  }
  
  try {
    const threads = await offlineDB.threads
      .where('userId')
      .equals(userId)
      .filter(thread => spaceIds.includes(thread.spaceId || '') && thread.syncStatus !== 'deleted')
      .toArray();
    
    const counts = new Map<string, number>();
    for (const thread of threads) {
      if (thread.spaceId) {
        counts.set(thread.spaceId, (counts.get(thread.spaceId) || 0) + 1);
      }
    }
    
    return counts;
  } catch (error) {
    console.error('Error getting thread counts for spaces:', error);
    return new Map();
  }
}

/**
 * Helper: Get note counts for multiple threads
 */
async function getNoteCountsForThreads(userId: string, threadIds: string[]): Promise<Map<string, number>> {
  if (threadIds.length === 0) {
    return new Map();
  }
  
  try {
    const noteThreads = await offlineDB.noteThreads
      .where('userId')
      .equals(userId)
      .filter(nt => threadIds.includes(nt.threadId))
      .toArray();
    
    const counts = new Map<string, number>();
    for (const nt of noteThreads) {
      counts.set(nt.threadId, (counts.get(nt.threadId) || 0) + 1);
    }
    
    return counts;
  } catch (error) {
    console.error('Error getting note counts for threads:', error);
    return new Map();
  }
}

/**
 * Helper: Get note counts for multiple spaces (standalone + total)
 */
async function getNoteCountsForSpaces(userId: string, spaceIds: string[]): Promise<{ standalone: Map<string, number>; total: Map<string, number> }> {
  if (spaceIds.length === 0) {
    return { standalone: new Map(), total: new Map() };
  }
  
  try {
    // Get all notes in these spaces
    const notes = await offlineDB.notes
      .where('userId')
      .equals(userId)
      .filter(note => spaceIds.includes(note.spaceId || '') && note.syncStatus !== 'deleted')
      .toArray();
    
    // Get all note-thread relationships for these notes
    const noteIds = notes.map(n => n.id);
    const noteThreads = await offlineDB.noteThreads
      .where('userId')
      .equals(userId)
      .filter(nt => noteIds.includes(nt.noteId))
      .toArray();
    
    const notesWithThreads = new Set(noteThreads.map(nt => nt.noteId));
    
    const standaloneCounts = new Map<string, number>();
    const totalCounts = new Map<string, number>();
    
    for (const note of notes) {
      if (note.spaceId) {
        // Total count
        totalCounts.set(note.spaceId, (totalCounts.get(note.spaceId) || 0) + 1);
        
        // Standalone count (no thread relationships)
        if (!notesWithThreads.has(note.id)) {
          standaloneCounts.set(note.spaceId, (standaloneCounts.get(note.spaceId) || 0) + 1);
        }
      }
    }
    
    return { standalone: standaloneCounts, total: totalCounts };
  } catch (error) {
    console.error('Error getting note counts for spaces:', error);
    return { standalone: new Map(), total: new Map() };
  }
}

