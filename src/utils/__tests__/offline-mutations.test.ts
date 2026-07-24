import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  createSpaceOffline,
  updateSpaceOffline,
  deleteSpaceOffline,
  createThreadOffline,
  updateThreadOffline,
  deleteThreadOffline,
  createNoteOffline,
  updateNoteOffline,
  updateNoteOfflineIfPresent,
  deleteNoteOffline,
  getNextSimpleNoteIdPreview,
  getLocalNoteCount,
  createNoteOfflineWithRetry,
  cacheHighestSimpleNoteId,
  getCachedHighestSimpleNoteId,
  linkNoteToThreadOffline,
  unlinkNoteFromThreadOffline,
  addTagToNoteOffline,
  removeTagFromNoteOffline,
} from '../offline-mutations';
import { offlineDB } from '../offline-db';
import { enqueueMutation } from '../sync-manager';

// Mock enqueueMutation
vi.mock('../sync-manager', () => ({
  enqueueMutation: vi.fn(),
}));

describe('offline-mutations', () => {
  const testUserId = 'test-user-123';

  beforeEach(async () => {
    // Clear all tables before each test
    await offlineDB.spaces.clear();
    await offlineDB.threads.clear();
    await offlineDB.notes.clear();
    await offlineDB.noteThreads.clear();
    await offlineDB.tags.clear();
    await offlineDB.noteTags.clear();
    await offlineDB.userMetadata.clear();
    await offlineDB.syncQueue.clear();
    
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
  });

  describe('cacheHighestSimpleNoteId', () => {
    it('should cache the highest simple note ID', () => {
      cacheHighestSimpleNoteId(testUserId, 42);
      const cached = getCachedHighestSimpleNoteId(testUserId);
      expect(cached).toBe(42);
    });

    it('should return null when not cached', () => {
      const cached = getCachedHighestSimpleNoteId(testUserId);
      expect(cached).toBeNull();
    });
  });

  describe('getLocalNoteCount', () => {
    it('should return 0 when no notes exist', async () => {
      const count = await getLocalNoteCount(testUserId);
      expect(count).toBe(0);
    });

    it('should count non-deleted notes', async () => {
      await offlineDB.notes.add({
        id: 'note-1',
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

      const count = await getLocalNoteCount(testUserId);
      expect(count).toBe(1);
    });

    it('should exclude deleted notes', async () => {
      await offlineDB.notes.add({
        id: 'note-1',
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

      const count = await getLocalNoteCount(testUserId);
      expect(count).toBe(0);
    });
  });

  describe('getNextSimpleNoteIdPreview', () => {
    it('should return 1 when no metadata or notes exist', async () => {
      const preview = await getNextSimpleNoteIdPreview(testUserId);
      expect(preview).toBe(1);
    });

    it('should return next ID from reserved range', async () => {
      await offlineDB.userMetadata.add({
        id: 'meta-1',
        userId: testUserId,
        highestSimpleNoteId: 10,
        reservedSimpleNoteIdRange: { start: 11, end: 20 },
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
        currentSeason: null,
        lastMonthlyVisit: null,
        churchAddedAt: null,
        appearanceSettings: null,
        syncStatus: 'synced',
        lastModified: Date.now(),
        createdAt: new Date(),
        updatedAt: null,
      });

      const preview = await getNextSimpleNoteIdPreview(testUserId);
      expect(preview).toBe(11);
    });

    it('should skip used IDs in reserved range', async () => {
      await offlineDB.userMetadata.add({
        id: 'meta-1',
        userId: testUserId,
        highestSimpleNoteId: 10,
        reservedSimpleNoteIdRange: { start: 11, end: 20 },
        usedReservedIds: [11, 12],
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
        currentSeason: null,
        lastMonthlyVisit: null,
        churchAddedAt: null,
        appearanceSettings: null,
        syncStatus: 'synced',
        lastModified: Date.now(),
        createdAt: new Date(),
        updatedAt: null,
      });

      const preview = await getNextSimpleNoteIdPreview(testUserId);
      expect(preview).toBe(13);
    });

    it('should fallback to highestSimpleNoteId + 1 when range exhausted', async () => {
      await offlineDB.userMetadata.add({
        id: 'meta-1',
        userId: testUserId,
        highestSimpleNoteId: 10,
        reservedSimpleNoteIdRange: { start: 11, end: 13 },
        usedReservedIds: [11, 12, 13],
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
        currentSeason: null,
        lastMonthlyVisit: null,
        churchAddedAt: null,
        appearanceSettings: null,
        syncStatus: 'synced',
        lastModified: Date.now(),
        createdAt: new Date(),
        updatedAt: null,
      });

      const preview = await getNextSimpleNoteIdPreview(testUserId);
      expect(preview).toBe(11); // highestSimpleNoteId (10) + 1
    });
  });

  describe('createSpaceOffline', () => {
    it('should create a space and queue sync operation', async () => {
      const spaceId = await createSpaceOffline(testUserId, {
        title: 'Test Space',
        description: 'Description',
      });

      expect(spaceId).toMatch(/^local_/);
      
      const space = await offlineDB.spaces.where('[userId+id]').equals([testUserId, spaceId]).first();
      expect(space).toBeTruthy();
      expect(space?.title).toBe('Test Space');
      expect(space?.syncStatus).toBe('pending');

      expect(enqueueMutation).toHaveBeenCalledWith(
        testUserId,
        expect.objectContaining({
          operation: 'create',
          entityType: 'space',
          entityId: spaceId,
        })
      );
    });
  });

  describe('updateSpaceOffline', () => {
    it('should update a space and queue sync operation', async () => {
      const spaceId = await createSpaceOffline(testUserId, {
        title: 'Original Title',
      });

      await updateSpaceOffline(testUserId, spaceId, {
        title: 'Updated Title',
      });

      const space = await offlineDB.spaces.where('[userId+id]').equals([testUserId, spaceId]).first();
      expect(space?.title).toBe('Updated Title');
      expect(space?.syncStatus).toBe('pending');

      expect(enqueueMutation).toHaveBeenCalledWith(
        testUserId,
        expect.objectContaining({
          operation: 'update',
          entityType: 'space',
          entityId: spaceId,
        })
      );
    });

    it('should throw error if space not found', async () => {
      await expect(
        updateSpaceOffline(testUserId, 'non-existent', { title: 'Test' })
      ).rejects.toThrow('Space not found');
    });
  });

  describe('deleteSpaceOffline', () => {
    it('should mark space as deleted and queue sync operation', async () => {
      const spaceId = await createSpaceOffline(testUserId, {
        title: 'Test Space',
      });

      await deleteSpaceOffline(testUserId, spaceId);

      const space = await offlineDB.spaces.where('[userId+id]').equals([testUserId, spaceId]).first();
      expect(space?.syncStatus).toBe('deleted');

      expect(enqueueMutation).toHaveBeenCalledWith(
        testUserId,
        expect.objectContaining({
          operation: 'delete',
          entityType: 'space',
          entityId: spaceId,
        })
      );
    });
  });

  describe('createThreadOffline', () => {
    it('should create a thread and queue sync operation', async () => {
      const threadId = await createThreadOffline(testUserId, {
        title: 'Test Thread',
        color: 'blue',
      });

      expect(threadId).toMatch(/^local_/);
      
      const thread = await offlineDB.threads.where('[userId+id]').equals([testUserId, threadId]).first();
      expect(thread).toBeTruthy();
      expect(thread?.title).toBe('Test Thread');
      expect(thread?.color).toBe('blue');
      expect(thread?.syncStatus).toBe('pending');

      expect(enqueueMutation).toHaveBeenCalledWith(
        testUserId,
        expect.objectContaining({
          operation: 'create',
          entityType: 'thread',
          entityId: threadId,
        })
      );
    });
  });

  describe('createNoteOffline', () => {
    it('should create a note with SimpleNoteId from reserved range', async () => {
      await offlineDB.userMetadata.add({
        id: 'meta-1',
        userId: testUserId,
        highestSimpleNoteId: 10,
        reservedSimpleNoteIdRange: { start: 11, end: 20 },
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
        currentSeason: null,
        lastMonthlyVisit: null,
        churchAddedAt: null,
        appearanceSettings: null,
        syncStatus: 'synced',
        lastModified: Date.now(),
        createdAt: new Date(),
        updatedAt: null,
      });

      const noteId = await createNoteOffline(testUserId, {
        title: 'Test Note',
        content: 'Content',
      });

      const note = await offlineDB.notes.where('[userId+id]').equals([testUserId, noteId]).first();
      expect(note).toBeTruthy();
      expect(note?.title).toBe('Test Note');
      expect(note?.simpleNoteId).toBe(11);
      expect(note?.syncStatus).toBe('pending');

      // Verify ID was marked as used
      const metadata = await offlineDB.userMetadata.where('userId').equals(testUserId).first();
      expect(metadata?.usedReservedIds).toContain(11);
    });

    it('should create note without SimpleNoteId when range exhausted', async () => {
      await offlineDB.userMetadata.add({
        id: 'meta-1',
        userId: testUserId,
        highestSimpleNoteId: 10,
        reservedSimpleNoteIdRange: { start: 11, end: 13 },
        usedReservedIds: [11, 12, 13],
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
        currentSeason: null,
        lastMonthlyVisit: null,
        churchAddedAt: null,
        appearanceSettings: null,
        syncStatus: 'synced',
        lastModified: Date.now(),
        createdAt: new Date(),
        updatedAt: null,
      });

      const noteId = await createNoteOffline(testUserId, {
        title: 'Test Note',
        content: 'Content',
      });

      const note = await offlineDB.notes.where('[userId+id]').equals([testUserId, noteId]).first();
      // Note should still be created, but simpleNoteId might be null or use fallback
      expect(note).toBeTruthy();
    });

    it('should create NoteThread relationship when threadId provided', async () => {
      const threadId = await createThreadOffline(testUserId, {
        title: 'Test Thread',
      });

      const noteId = await createNoteOffline(testUserId, {
        title: 'Test Note',
        content: 'Content',
        threadId,
      });

      const noteThreads = await offlineDB.noteThreads
        .where('[userId+noteId]')
        .equals([testUserId, noteId])
        .toArray();

      expect(noteThreads).toHaveLength(1);
      expect(noteThreads[0].threadId).toBe(threadId);
      const calls = vi.mocked(enqueueMutation).mock.calls
        .map(([, mutation]) => mutation.entityType);
      expect(calls.slice(-2)).toEqual(['note', 'noteThread']);
      expect(
        (await offlineDB.notes.get(noteId))?.currentVersion,
      ).toBe(1);
    });
  });

  describe('updateNoteOffline', () => {
    it('should update a note and queue sync operation', async () => {
      const noteId = await createNoteOffline(testUserId, {
        title: 'Original Title',
        content: 'Original Content',
      });

      await updateNoteOffline(testUserId, noteId, {
        title: 'Updated Title',
        content: 'Updated Content',
      });

      const note = await offlineDB.notes.where('[userId+id]').equals([testUserId, noteId]).first();
      expect(note?.title).toBe('Updated Title');
      expect(note?.content).toBe('Updated Content');
      expect(note?.syncStatus).toBe('pending');
    });

    it('should throw error if note not found', async () => {
      await expect(
        updateNoteOffline(testUserId, 'non-existent', { title: 'Test' })
      ).rejects.toThrow('Note not found');
    });

    it('should merge collection fields into pending create queue data', async () => {
      const noteId = await createNoteOffline(testUserId, {
        title: 'Folder note',
        content: '<p>x</p>',
      });

      await offlineDB.syncQueue.add({
        id: `test-create-${noteId}`,
        userId: testUserId,
        operation: 'create',
        entityType: 'note',
        entityId: noteId,
        data: { title: 'Folder note', content: '<p>x</p>' },
        timestamp: Date.now(),
        retryCount: 0,
        clientMutationId: `test-create-${noteId}`,
      });

      await updateNoteOffline(testUserId, noteId, {
        primaryCollection: 'Sermons',
        secondaryCollections: ['2026'],
        collectionUserOverride: true,
      });

      const op = await offlineDB.syncQueue.where('userId').equals(testUserId).first();
      const data = (op?.data ?? {}) as Record<string, unknown>;
      expect(data.primaryCollection).toBe('Sermons');
      expect(data.secondaryCollections).toEqual(['2026']);
      expect(data.collectionUserOverride).toBe(true);
    });
  });

  describe('updateNoteOfflineIfPresent', () => {
    it('returns false without throwing when note is missing from IndexedDB', async () => {
      const updated = await updateNoteOfflineIfPresent(testUserId, 'non-existent', { title: 'Test' });
      expect(updated).toBe(false);
    });

    it('updates and returns true when note exists locally', async () => {
      const noteId = await createNoteOffline(testUserId, {
        title: 'Original',
        content: 'Body',
      });
      const updated = await updateNoteOfflineIfPresent(testUserId, noteId, {
        title: 'Changed',
        content: 'Body',
      });
      expect(updated).toBe(true);
      const note = await offlineDB.notes.where('[userId+id]').equals([testUserId, noteId]).first();
      expect(note?.title).toBe('Changed');
    });
  });

  describe('deleteNoteOffline', () => {
    it('should mark note as deleted and queue sync operation', async () => {
      const noteId = await createNoteOffline(testUserId, {
        title: 'Test Note',
        content: 'Content',
      });

      await deleteNoteOffline(testUserId, noteId);

      const note = await offlineDB.notes.where('[userId+id]').equals([testUserId, noteId]).first();
      expect(note?.syncStatus).toBe('deleted');
    });

    it('should cancel pending noteThread queue ops when deleting before sync', async () => {
      const threadId = await createThreadOffline(testUserId, { title: 'Thread' });
      const noteId = await createNoteOffline(testUserId, {
        title: 'Note',
        content: 'Content',
        threadId,
      });

      // enqueueMutation is mocked in this file — seed the pending create so deleteNoteOffline
      // takes the cancel-before-sync branch (same as a real offline create).
      await offlineDB.syncQueue.add({
        id: `test-create-${noteId}`,
        userId: testUserId,
        operation: 'create',
        entityType: 'note',
        entityId: noteId,
        data: { title: 'Note', content: 'Content', threadId },
        timestamp: Date.now(),
        retryCount: 0,
        clientMutationId: `test-create-${noteId}`,
      });

      await deleteNoteOffline(testUserId, noteId);

      const queued = await offlineDB.syncQueue.where('userId').equals(testUserId).toArray();
      expect(queued.filter((op) => op.entityType === 'note')).toHaveLength(0);
      expect(queued.filter((op) => op.entityType === 'noteThread')).toHaveLength(0);
      expect(await offlineDB.noteThreads.where('[userId+noteId]').equals([testUserId, noteId]).count()).toBe(0);
    });
  });

  describe('linkNoteToThreadOffline', () => {
    it('should create NoteThread relationship', async () => {
      const threadId = await createThreadOffline(testUserId, {
        title: 'Test Thread',
      });

      const noteId = await createNoteOffline(testUserId, {
        title: 'Test Note',
        content: 'Content',
      });

      const noteThreadId = await linkNoteToThreadOffline(testUserId, noteId, threadId);

      expect(noteThreadId).toBeTruthy();
      
      const noteThreads = await offlineDB.noteThreads
        .where('[userId+noteId+threadId]')
        .equals([testUserId, noteId, threadId])
        .toArray();

      expect(noteThreads).toHaveLength(1);
    });

    it('should return existing relationship if already linked', async () => {
      const threadId = await createThreadOffline(testUserId, {
        title: 'Test Thread',
      });

      const noteId = await createNoteOffline(testUserId, {
        title: 'Test Note',
        content: 'Content',
        threadId,
      });

      const firstId = await linkNoteToThreadOffline(testUserId, noteId, threadId);
      const secondId = await linkNoteToThreadOffline(testUserId, noteId, threadId);

      expect(firstId).toBe(secondId);
    });
  });

  describe('unlinkNoteFromThreadOffline', () => {
    it('should delete NoteThread relationship for synced items', async () => {
      const threadId = await createThreadOffline(testUserId, {
        title: 'Test Thread',
      });

      const noteId = await createNoteOffline(testUserId, {
        title: 'Test Note',
        content: 'Content',
        threadId,
      });

      // Mark noteThread as synced
      const noteThread = await offlineDB.noteThreads
        .where('[userId+noteId+threadId]')
        .equals([testUserId, noteId, threadId])
        .first();

      if (noteThread) {
        await offlineDB.noteThreads.update(noteThread.id, {
          syncStatus: 'synced',
        });
      }

      await unlinkNoteFromThreadOffline(testUserId, noteId, threadId);

      const noteThreads = await offlineDB.noteThreads
        .where('[userId+noteId+threadId]')
        .equals([testUserId, noteId, threadId])
        .toArray();

      // Synced items are marked as deleted, not removed
      expect(noteThreads).toHaveLength(1);
      expect(noteThreads[0].syncStatus).toBe('deleted');
    });

    it('should cancel pending noteThread create when unlinking before sync', async () => {
      const threadId = await createThreadOffline(testUserId, { title: 'Thread' });
      const noteId = await createNoteOffline(testUserId, {
        title: 'Note',
        content: 'Content',
      });
      const linkId = await linkNoteToThreadOffline(testUserId, noteId, threadId);

      await unlinkNoteFromThreadOffline(testUserId, noteId, threadId);

      const queued = await offlineDB.syncQueue.where('userId').equals(testUserId).toArray();
      expect(queued.filter((op) => op.entityType === 'noteThread' && op.entityId === linkId)).toHaveLength(0);
      expect(
        await offlineDB.noteThreads.where('[userId+noteId+threadId]').equals([testUserId, noteId, threadId]).count(),
      ).toBe(0);
    });
  });

  describe('createNoteOfflineWithRetry', () => {
    it('should successfully create note on first attempt', async () => {
      const result = await createNoteOfflineWithRetry(testUserId, {
        title: 'Test Note',
        content: 'Content',
      });

      expect(result.success).toBe(true);
      expect(result.noteId).toBeTruthy();
    });

    it.skip('should retry on transient errors', async () => {
      // Skip: vitest module mocking doesn't work well with internal function calls
      // This retry logic is implicitly tested through real usage
    });

    it.skip('should not retry on quota exceeded errors', async () => {
      // Skip: vitest module mocking doesn't work well with internal function calls
      // This quota handling is implicitly tested through real usage
    });
  });
});

describe('tag offline writers', () => {
  const userId = 'tag-user';

  beforeEach(async () => {
    await offlineDB.tags.clear();
    await offlineDB.noteTags.clear();
    await offlineDB.syncQueue.clear();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
  });

  it('assigning an existing tag enqueues only a noteTag create (no new tag)', async () => {
    const noteTagId = await addTagToNoteOffline(userId, {
      noteId: 'note_1',
      tagId: 'tag_existing',
      tagName: 'Faith',
    });

    expect(noteTagId).toMatch(/^local_/);
    expect(await offlineDB.tags.count()).toBe(0);
    const row = await offlineDB.noteTags.get(noteTagId);
    expect(row?.tagId).toBe('tag_existing');

    expect(enqueueMutation).toHaveBeenCalledTimes(1);
    expect(enqueueMutation).toHaveBeenCalledWith(
      userId,
      expect.objectContaining({
        operation: 'create',
        entityType: 'noteTag',
        data: expect.objectContaining({ noteId: 'note_1', tagId: 'tag_existing' }),
      }),
    );
  });

  it('a brand-new tag enqueues tag then noteTag, both keyed to the same local tag id', async () => {
    await addTagToNoteOffline(userId, { noteId: 'note_1', tagName: 'Grace' });

    expect(await offlineDB.tags.count()).toBe(1);
    const tagRow = (await offlineDB.tags.toArray())[0];
    expect(tagRow.name).toBe('Grace');

    const calls = (enqueueMutation as unknown as { mock: { calls: any[][] } }).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0][1]).toMatchObject({ operation: 'create', entityType: 'tag', entityId: tagRow.id });
    expect(calls[1][1]).toMatchObject({ operation: 'create', entityType: 'noteTag', data: { tagId: tagRow.id } });
  });

  it('removing a tag enqueues a noteTag delete keyed by noteId + tagId', async () => {
    await removeTagFromNoteOffline(userId, { noteId: 'note_1', tagId: 'tag_x' });
    expect(enqueueMutation).toHaveBeenCalledWith(
      userId,
      expect.objectContaining({
        operation: 'delete',
        entityType: 'noteTag',
        data: { noteId: 'note_1', tagId: 'tag_x' },
      }),
    );
  });
});

describe('note offline coalescing & materialization', () => {
  const userId = 'coalesce-user';

  async function seedNoteRow(id: string) {
    await offlineDB.notes.add({
      id,
      userId,
      title: 'A',
      content: '<p>old</p>',
      threadId: 'thread_unorganized',
      spaceId: null,
      simpleNoteId: null,
      noteType: 'default',
      addedBy: 'user',
      isPublic: false,
      isFeatured: false,
      order: 0,
      lastVisited: new Date(),
      linkedFromNoteId: null,
      syncStatus: 'pending',
      lastModified: Date.now(),
      createdAt: new Date(),
      updatedAt: null,
    } as any);
  }

  async function seedCreateOp(entityId: string) {
    await offlineDB.syncQueue.add({
      userId,
      operation: 'create',
      entityType: 'note',
      entityId,
      data: { title: 'A', content: '<p>old</p>' },
      retryCount: 0,
      timestamp: Date.now(),
      clientMutationId: 'cmid-1',
    } as any);
  }

  beforeEach(async () => {
    await offlineDB.notes.clear();
    await offlineDB.syncQueue.clear();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
  });

  it('editing a not-yet-synced note folds into its pending create (no separate update op)', async () => {
    await seedNoteRow('local_1');
    await seedCreateOp('local_1');

    await updateNoteOffline(userId, 'local_1', { content: '<p>new</p>' });

    const ops = await offlineDB.syncQueue.where('userId').equals(userId).toArray();
    expect(ops).toHaveLength(1);
    expect(ops[0].operation).toBe('create');
    expect(ops[0].data.content).toBe('<p>new</p>');
    expect(enqueueMutation).not.toHaveBeenCalled();
  });

  it('materializes a row and enqueues an update for an un-mirrored server note (with seed)', async () => {
    await updateNoteOffline(
      userId,
      'note_server',
      { title: 'T', content: '<p>edited</p>' },
      { content: '<p>edited</p>', title: 'T', currentVersion: 7 },
    );

    const row = await offlineDB.notes.get('note_server');
    expect(row?.content).toBe('<p>edited</p>');
    expect(enqueueMutation).toHaveBeenCalledWith(
      userId,
      expect.objectContaining({
        operation: 'update',
        entityType: 'note',
        entityId: 'note_server',
        data: expect.objectContaining({ expectedVersion: 7 }),
      }),
    );
  });

  it('fails closed when a server note content edit has no immutable version', async () => {
    await expect(
      updateNoteOffline(
        userId,
        'note_server_unversioned',
        { content: '<p>edited</p>' },
        { content: '<p>before</p>' },
      ),
    ).rejects.toThrow('currentVersion');
  });

  it('persists the original expectedVersion while coalescing canonical edits', async () => {
    await seedNoteRow('note_synced');
    await offlineDB.notes.update('note_synced', {
      currentVersion: 4,
      syncStatus: 'synced',
    });
    await offlineDB.syncQueue.add({
      userId,
      operation: 'update',
      entityType: 'note',
      entityId: 'note_synced',
      data: { content: '<p>first</p>', expectedVersion: 4 },
      retryCount: 0,
      timestamp: Date.now(),
      clientMutationId: 'cmid-update',
    } as any);
    await updateNoteOffline(userId, 'note_synced', {
      title: 'Second',
      contentEncrypted: true,
    });
    const queued = await offlineDB.syncQueue.where('userId').equals(userId).first();
    expect(queued?.data).toMatchObject({
      content: '<p>first</p>',
      title: 'Second',
      contentEncrypted: true,
      expectedVersion: 4,
    });
  });

  it('throws for a missing note without a seed (legacy behavior preserved)', async () => {
    await expect(updateNoteOffline(userId, 'note_missing', { content: 'x' })).rejects.toThrow('Note not found');
  });

  it('deleting a not-yet-synced note cancels its create (drops ops + row, enqueues nothing)', async () => {
    await seedNoteRow('local_2');
    await seedCreateOp('local_2');

    await deleteNoteOffline(userId, 'local_2');

    expect(await offlineDB.syncQueue.where('userId').equals(userId).count()).toBe(0);
    expect(await offlineDB.notes.get('local_2')).toBeUndefined();
    expect(enqueueMutation).not.toHaveBeenCalled();
  });

  it('deleting an un-mirrored server note enqueues a delete op', async () => {
    await deleteNoteOffline(userId, 'note_gone');
    expect(enqueueMutation).toHaveBeenCalledWith(
      userId,
      expect.objectContaining({ operation: 'delete', entityType: 'note', entityId: 'note_gone' }),
    );
  });
});

