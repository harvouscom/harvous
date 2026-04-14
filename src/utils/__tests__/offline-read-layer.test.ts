import { describe, it, expect, beforeEach } from 'vitest';
import {
  getDashboardSnapshotLocal,
  getSpacesLocal,
  getThreadsLocal,
  getThreadsForSpaceLocal,
  getNoteLocal,
  getThreadLocal,
  getSpaceLocal,
  getRecentNotesLocal,
  getNotesForThreadLocal,
  getNotesForSpaceLocal,
  getUserMetadataLocal,
} from '../offline-read-layer';
import { offlineDB } from '../offline-db';

describe('offline-read-layer', () => {
  const testUserId = 'test-user-123';
  const otherUserId = 'other-user-456';

  beforeEach(async () => {
    // Clear all tables before each test
    await offlineDB.spaces.clear();
    await offlineDB.threads.clear();
    await offlineDB.notes.clear();
    await offlineDB.noteThreads.clear();
    await offlineDB.tags.clear();
    await offlineDB.noteTags.clear();
    await offlineDB.userMetadata.clear();
  });

  describe('getSpacesLocal', () => {
    it('should return empty array when no spaces exist', async () => {
      const spaces = await getSpacesLocal(testUserId);
      expect(spaces).toEqual([]);
    });

    it('should return spaces for user, excluding deleted', async () => {
      await offlineDB.spaces.add({
        id: 'space-1',
        userId: testUserId,
        title: 'Test Space',
        description: null,
        color: null,
        backgroundGradient: null,
        isPublic: false,
        isActive: true,
        order: 0,
        syncStatus: 'synced',
        lastModified: Date.now(),
        createdAt: new Date(),
        updatedAt: null,
      });

      await offlineDB.spaces.add({
        id: 'space-2',
        userId: testUserId,
        title: 'Deleted Space',
        description: null,
        color: null,
        backgroundGradient: null,
        isPublic: false,
        isActive: true,
        order: 1,
        syncStatus: 'deleted',
        lastModified: Date.now(),
        createdAt: new Date(),
        updatedAt: null,
      });

      const spaces = await getSpacesLocal(testUserId);
      expect(spaces).toHaveLength(1);
      expect(spaces[0].title).toBe('Test Space');
    });

    it('should not return spaces for other users', async () => {
      await offlineDB.spaces.add({
        id: 'space-1',
        userId: otherUserId,
        title: 'Other User Space',
        description: null,
        color: null,
        backgroundGradient: null,
        isPublic: false,
        isActive: true,
        order: 0,
        syncStatus: 'synced',
        lastModified: Date.now(),
        createdAt: new Date(),
        updatedAt: null,
      });

      const spaces = await getSpacesLocal(testUserId);
      expect(spaces).toHaveLength(0);
    });
  });

  describe('getThreadsLocal', () => {
    it('should return threads excluding unorganized and deleted', async () => {
      await offlineDB.threads.add({
        id: 'thread-1',
        userId: testUserId,
        title: 'Test Thread',
        subtitle: null,
        spaceId: null,
        color: 'blue',
        isPublic: false,
        isPinned: false,
        order: 0,
        lastVisited: null,
        syncStatus: 'synced',
        lastModified: Date.now(),
        createdAt: new Date(),
        updatedAt: null,
      });

      await offlineDB.threads.add({
        id: 'thread_unorganized',
        userId: testUserId,
        title: 'My Pile',
        subtitle: null,
        spaceId: null,
        color: null,
        isPublic: false,
        isPinned: false,
        order: 0,
        lastVisited: null,
        syncStatus: 'synced',
        lastModified: Date.now(),
        createdAt: new Date(),
        updatedAt: null,
      });

      const threads = await getThreadsLocal(testUserId);
      expect(threads).toHaveLength(1);
      expect(threads[0].title).toBe('Test Thread');
    });
  });

  describe('getThreadsForSpaceLocal', () => {
    it('should return threads for a specific space', async () => {
      const spaceId = 'space-1';

      await offlineDB.threads.add({
        id: 'thread-1',
        userId: testUserId,
        title: 'Thread in Space',
        subtitle: null,
        spaceId,
        color: null,
        isPublic: false,
        isPinned: false,
        order: 0,
        lastVisited: null,
        syncStatus: 'synced',
        lastModified: Date.now(),
        createdAt: new Date(),
        updatedAt: null,
      });

      await offlineDB.threads.add({
        id: 'thread-2',
        userId: testUserId,
        title: 'Thread Not in Space',
        subtitle: null,
        spaceId: null,
        color: null,
        isPublic: false,
        isPinned: false,
        order: 0,
        lastVisited: null,
        syncStatus: 'synced',
        lastModified: Date.now(),
        createdAt: new Date(),
        updatedAt: null,
      });

      const threads = await getThreadsForSpaceLocal(testUserId, spaceId);
      expect(threads).toHaveLength(1);
      expect(threads[0].title).toBe('Thread in Space');
    });
  });

  describe('getNoteLocal', () => {
    it('should return note by ID', async () => {
      const noteId = 'note-1';
      await offlineDB.notes.add({
        id: noteId,
        userId: testUserId,
        title: 'Test Note',
        content: 'Content',
        threadId: 'thread_unorganized',
        spaceId: null,
        simpleNoteId: 1,
        noteType: 'default',
        addedBy: 'user',
        isPublic: false,
        isFeatured: false,
        order: 0,
        lastVisited: null,
        syncStatus: 'synced',
        lastModified: Date.now(),
        createdAt: new Date(),
        updatedAt: null,
      });

      const note = await getNoteLocal(testUserId, noteId);
      expect(note).toBeTruthy();
      expect(note?.title).toBe('Test Note');
    });

    it('should return null for deleted note', async () => {
      const noteId = 'note-1';
      await offlineDB.notes.add({
        id: noteId,
        userId: testUserId,
        title: 'Test Note',
        content: 'Content',
        threadId: 'thread_unorganized',
        spaceId: null,
        simpleNoteId: 1,
        noteType: 'default',
        addedBy: 'user',
        isPublic: false,
        isFeatured: false,
        order: 0,
        lastVisited: null,
        syncStatus: 'deleted',
        lastModified: Date.now(),
        createdAt: new Date(),
        updatedAt: null,
      });

      const note = await getNoteLocal(testUserId, noteId);
      expect(note).toBeNull();
    });

    it('should return null for non-existent note', async () => {
      const note = await getNoteLocal(testUserId, 'non-existent');
      expect(note).toBeNull();
    });
  });

  describe('getThreadLocal', () => {
    it('should return thread by ID', async () => {
      const threadId = 'thread-1';
      await offlineDB.threads.add({
        id: threadId,
        userId: testUserId,
        title: 'Test Thread',
        subtitle: null,
        spaceId: null,
        color: 'blue',
        isPublic: false,
        isPinned: false,
        order: 0,
        lastVisited: null,
        syncStatus: 'synced',
        lastModified: Date.now(),
        createdAt: new Date(),
        updatedAt: null,
      });

      const thread = await getThreadLocal(testUserId, threadId);
      expect(thread).toBeTruthy();
      expect(thread?.title).toBe('Test Thread');
    });

    it('should return null for deleted thread', async () => {
      const threadId = 'thread-1';
      await offlineDB.threads.add({
        id: threadId,
        userId: testUserId,
        title: 'Test Thread',
        subtitle: null,
        spaceId: null,
        color: null,
        isPublic: false,
        isPinned: false,
        order: 0,
        lastVisited: null,
        syncStatus: 'deleted',
        lastModified: Date.now(),
        createdAt: new Date(),
        updatedAt: null,
      });

      const thread = await getThreadLocal(testUserId, threadId);
      expect(thread).toBeNull();
    });
  });

  describe('getSpaceLocal', () => {
    it('should return space by ID', async () => {
      const spaceId = 'space-1';
      await offlineDB.spaces.add({
        id: spaceId,
        userId: testUserId,
        title: 'Test Space',
        description: null,
        color: null,
        backgroundGradient: null,
        isPublic: false,
        isActive: true,
        order: 0,
        syncStatus: 'synced',
        lastModified: Date.now(),
        createdAt: new Date(),
        updatedAt: null,
      });

      const space = await getSpaceLocal(testUserId, spaceId);
      expect(space).toBeTruthy();
      expect(space?.title).toBe('Test Space');
    });
  });

  describe('getRecentNotesLocal', () => {
    it('should return notes sorted by lastVisited/updatedAt/createdAt', async () => {
      const now = Date.now();
      
      await offlineDB.notes.add({
        id: 'note-1',
        userId: testUserId,
        title: 'Old Note',
        content: 'Content',
        threadId: 'thread_unorganized',
        spaceId: null,
        simpleNoteId: 1,
        noteType: 'default',
        addedBy: 'user',
        isPublic: false,
        isFeatured: false,
        order: 0,
        lastVisited: new Date(now - 10000),
        syncStatus: 'synced',
        lastModified: now - 10000,
        createdAt: new Date(now - 10000),
        updatedAt: null,
      });

      await offlineDB.notes.add({
        id: 'note-2',
        userId: testUserId,
        title: 'Recent Note',
        content: 'Content',
        threadId: 'thread_unorganized',
        spaceId: null,
        simpleNoteId: 2,
        noteType: 'default',
        addedBy: 'user',
        isPublic: false,
        isFeatured: false,
        order: 0,
        lastVisited: new Date(now),
        syncStatus: 'synced',
        lastModified: now,
        createdAt: new Date(now),
        updatedAt: null,
      });

      const notes = await getRecentNotesLocal(testUserId, 20);
      expect(notes).toHaveLength(2);
      expect(notes[0].title).toBe('Recent Note'); // Most recent first
    });

    it('should respect limit parameter', async () => {
      // Create 5 notes
      for (let i = 0; i < 5; i++) {
        await offlineDB.notes.add({
          id: `note-${i}`,
          userId: testUserId,
          title: `Note ${i}`,
          content: 'Content',
          threadId: 'thread_unorganized',
          spaceId: null,
          simpleNoteId: i + 1,
          noteType: 'default',
          addedBy: 'user',
          isPublic: false,
          isFeatured: false,
          order: 0,
          lastVisited: null,
          syncStatus: 'synced',
          lastModified: Date.now() - i * 1000,
          createdAt: new Date(Date.now() - i * 1000),
          updatedAt: null,
        });
      }

      const notes = await getRecentNotesLocal(testUserId, 3);
      expect(notes).toHaveLength(3);
    });
  });

  describe('getNotesForThreadLocal', () => {
    it('should return notes linked to a thread', async () => {
      const threadId = 'thread-1';
      const noteId = 'note-1';

      await offlineDB.notes.add({
        id: noteId,
        userId: testUserId,
        title: 'Test Note',
        content: 'Content',
        threadId: 'thread_unorganized',
        spaceId: null,
        simpleNoteId: 1,
        noteType: 'default',
        addedBy: 'user',
        isPublic: false,
        isFeatured: false,
        order: 0,
        lastVisited: null,
        syncStatus: 'synced',
        lastModified: Date.now(),
        createdAt: new Date(),
        updatedAt: null,
      });

      await offlineDB.noteThreads.add({
        id: 'nt-1',
        userId: testUserId,
        noteId,
        threadId,
        syncStatus: 'synced',
        lastModified: Date.now(),
        createdAt: new Date(),
        updatedAt: null,
      });

      const result = await getNotesForThreadLocal(testUserId, threadId, 20, 0);
      expect(result.notes).toHaveLength(1);
      expect(result.notes[0].id).toBe(noteId);
    });

    it('should return hasMore when there are more notes', async () => {
      const threadId = 'thread-1';

      // Create 5 notes linked to thread
      for (let i = 0; i < 5; i++) {
        const noteId = `note-${i}`;
        await offlineDB.notes.add({
          id: noteId,
          userId: testUserId,
          title: `Note ${i}`,
          content: 'Content',
          threadId: 'thread_unorganized',
          spaceId: null,
          simpleNoteId: i + 1,
          noteType: 'default',
          addedBy: 'user',
          isPublic: false,
          isFeatured: false,
          order: 0,
          lastVisited: null,
          syncStatus: 'synced',
          lastModified: Date.now() - i * 1000,
          createdAt: new Date(Date.now() - i * 1000),
          updatedAt: null,
        });

        await offlineDB.noteThreads.add({
          id: `nt-${i}`,
          userId: testUserId,
          noteId,
          threadId,
          syncStatus: 'synced',
          lastModified: Date.now(),
          createdAt: new Date(),
          updatedAt: null,
        });
      }

      const result = await getNotesForThreadLocal(testUserId, threadId, 3, 0);
      expect(result.notes).toHaveLength(3);
      expect(result.hasMore).toBe(true);
      // No lastVisited: sortByLastVisited uses createdAt among unvisited (newest first)
      expect(result.notes.map((n) => n.id)).toEqual(['note-0', 'note-1', 'note-2']);
    });

    it('should order onboarding thread oldest-first', async () => {
      const threadId = `thread_onboarding_${testUserId}`;

      for (let i = 0; i < 5; i++) {
        const noteId = `note-${i}`;
        await offlineDB.notes.add({
          id: noteId,
          userId: testUserId,
          title: `Note ${i}`,
          content: 'Content',
          threadId: 'thread_unorganized',
          spaceId: null,
          simpleNoteId: i + 1,
          noteType: 'default',
          addedBy: 'user',
          isPublic: false,
          isFeatured: false,
          order: 0,
          lastVisited: null,
          syncStatus: 'synced',
          lastModified: Date.now() - i * 1000,
          createdAt: new Date(Date.now() - i * 1000),
          updatedAt: null,
        });

        await offlineDB.noteThreads.add({
          id: `nt-onb-${i}`,
          userId: testUserId,
          noteId,
          threadId,
          syncStatus: 'synced',
          lastModified: Date.now(),
          createdAt: new Date(),
          updatedAt: null,
        });
      }

      const result = await getNotesForThreadLocal(testUserId, threadId, 3, 0);
      // simpleNoteId 1..5 matches pack order (not createdAt — all notes could share one timestamp)
      expect(result.notes.map((n) => n.id)).toEqual(['note-0', 'note-1', 'note-2']);
    });
  });

  describe('getNotesForSpaceLocal', () => {
    it('should return notes in a space', async () => {
      const spaceId = 'space-1';
      const noteId = 'note-1';

      await offlineDB.notes.add({
        id: noteId,
        userId: testUserId,
        title: 'Test Note',
        content: 'Content',
        threadId: 'thread_unorganized',
        spaceId,
        simpleNoteId: 1,
        noteType: 'default',
        addedBy: 'user',
        isPublic: false,
        isFeatured: false,
        order: 0,
        lastVisited: null,
        syncStatus: 'synced',
        lastModified: Date.now(),
        createdAt: new Date(),
        updatedAt: null,
      });

      const result = await getNotesForSpaceLocal(testUserId, spaceId, 20, 0);
      expect(result.notes).toHaveLength(1);
      expect(result.notes[0].id).toBe(noteId);
    });
  });

  describe('getUserMetadataLocal', () => {
    it('should return user metadata', async () => {
      await offlineDB.userMetadata.add({
        id: 'meta-1',
        userId: testUserId,
        highestSimpleNoteId: 10,
        reservedSimpleNoteIdRange: { start: 11, end: 20 },
        usedReservedIds: [],
        userColor: 'blue',
        firstName: 'John',
        lastName: 'Doe',
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
        syncStatus: 'synced',
        lastModified: Date.now(),
        createdAt: new Date(),
        updatedAt: null,
      });

      const metadata = await getUserMetadataLocal(testUserId);
      expect(metadata).toBeTruthy();
      expect(metadata?.highestSimpleNoteId).toBe(10);
      expect(metadata?.firstName).toBe('John');
    });

    it('should return null when no metadata exists', async () => {
      const metadata = await getUserMetadataLocal(testUserId);
      expect(metadata).toBeNull();
    });
  });

  describe('getDashboardSnapshotLocal', () => {
    it('should return null when no data exists', async () => {
      const snapshot = await getDashboardSnapshotLocal(testUserId);
      expect(snapshot).toBeNull();
    });

    it('should return complete dashboard snapshot', async () => {
      // Create space
      await offlineDB.spaces.add({
        id: 'space-1',
        userId: testUserId,
        title: 'Test Space',
        description: null,
        color: null,
        backgroundGradient: null,
        isPublic: false,
        isActive: true,
        order: 0,
        syncStatus: 'synced',
        lastModified: Date.now(),
        createdAt: new Date(),
        updatedAt: null,
      });

      // Create thread
      await offlineDB.threads.add({
        id: 'thread-1',
        userId: testUserId,
        title: 'Test Thread',
        subtitle: null,
        spaceId: 'space-1',
        color: 'blue',
        isPublic: false,
        isPinned: false,
        order: 0,
        lastVisited: null,
        syncStatus: 'synced',
        lastModified: Date.now(),
        createdAt: new Date(),
        updatedAt: null,
      });

      // Create note
      await offlineDB.notes.add({
        id: 'note-1',
        userId: testUserId,
        title: 'Test Note',
        content: 'Content',
        threadId: 'thread_unorganized',
        spaceId: 'space-1',
        simpleNoteId: 1,
        noteType: 'default',
        addedBy: 'user',
        isPublic: false,
        isFeatured: false,
        order: 0,
        lastVisited: null,
        syncStatus: 'synced',
        lastModified: Date.now(),
        createdAt: new Date(),
        updatedAt: null,
      });

      // Create user metadata
      await offlineDB.userMetadata.add({
        id: 'meta-1',
        userId: testUserId,
        highestSimpleNoteId: 1,
        reservedSimpleNoteIdRange: { start: 2, end: 201 },
        usedReservedIds: [],
        userColor: 'blue',
        firstName: 'John',
        lastName: 'Doe',
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
        syncStatus: 'synced',
        lastModified: Date.now(),
        createdAt: new Date(),
        updatedAt: null,
      });

      const snapshot = await getDashboardSnapshotLocal(testUserId);
      expect(snapshot).toBeTruthy();
      expect(snapshot?.spaces).toHaveLength(1);
      expect(snapshot?.threads).toHaveLength(1);
      expect(snapshot?.recentNotes).toHaveLength(1);
      expect(snapshot?.userMetadata).toBeTruthy();
      expect(snapshot?.spaces[0].threadCount).toBe(1);
      expect(snapshot?.threads[0].noteCount).toBe(0); // No notes linked via NoteThreads
    });
  });
});

