/**
 * Programmatic offline health scenarios — mirrors e2e/offline-mode-health.spec.ts
 * logic without requiring Clerk browser auth.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createNoteOffline,
  createThreadOffline,
  createStudyThreadEntryOffline,
  connectNotesOffline,
  deleteNoteOffline,
  pinNoteOffline,
  updateNoteOffline,
} from '../offline-mutations';
import { offlineDB } from '../offline-db';

vi.mock('../sync-manager', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../sync-manager')>();
  return {
    ...actual,
    enqueueMutation: vi.fn(actual.enqueueMutation),
    triggerImmediateSync: vi.fn(),
  };
});

const testUserId = 'offline-health-user';

describe('offline health scenarios (programmatic)', () => {
  beforeEach(async () => {
    await offlineDB.spaces.clear();
    await offlineDB.threads.clear();
    await offlineDB.notes.clear();
    await offlineDB.noteThreads.clear();
    await offlineDB.noteConnections.clear();
    await offlineDB.syncQueue.clear();
    vi.clearAllMocks();
  });

  it('thread+note offline queues note and noteThread create ops', async () => {
    const threadId = 'local_health_th_1';
    const noteId = 'local_health_thread_1';
    const spaceId = 'space_test';

    await createThreadOffline(testUserId, { id: threadId, title: 'Health thread', spaceId });
    await createNoteOffline(testUserId, {
      id: noteId,
      title: 'Thread member',
      content: '<p>offline</p>',
      spaceId,
      threadId,
    });

    const queued = await offlineDB.syncQueue.where('userId').equals(testUserId).toArray();
    expect(queued.some((op) => op.entityType === 'note' && op.operation === 'create')).toBe(true);
    expect(queued.some((op) => op.entityType === 'noteThread' && op.operation === 'create')).toBe(true);
  });

  it('folder move offline queues collection fields on note update', async () => {
    const noteId = 'local_health_folder_1';
    const spaceId = 'space_test';

    await createNoteOffline(testUserId, {
      id: noteId,
      title: 'Folder gap',
      content: '<p>folder</p>',
      spaceId,
    });

    await updateNoteOffline(testUserId, noteId, {
      title: 'Folder gap',
      content: '<p>folder</p>',
      primaryCollection: 'HealthCheckFolder',
      secondaryCollections: [],
      collectionUserOverride: true,
    });

    const noteOp = await offlineDB.syncQueue
      .where('userId')
      .equals(testUserId)
      .filter((op) => op.entityType === 'note')
      .first();
    expect(noteOp).toBeTruthy();
    const data = (noteOp!.data ?? {}) as Record<string, unknown>;
    expect(data.primaryCollection).toBe('HealthCheckFolder');
    expect(data.collectionUserOverride).toBe(true);
  });

  it('delete-before-sync cancels orphaned noteThread create ops', async () => {
    const threadId = 'local_health_race_th';
    const noteId = 'local_health_race_note';
    const spaceId = 'space_test';

    await createThreadOffline(testUserId, { id: threadId, title: 'Race', spaceId });
    await createNoteOffline(testUserId, {
      id: noteId,
      title: 'Race note',
      content: '<p>race</p>',
      spaceId,
      threadId,
    });
    await deleteNoteOffline(testUserId, noteId);

    const queued = await offlineDB.syncQueue.where('userId').equals(testUserId).toArray();
    const noteOps = queued.filter((op) => op.entityType === 'note');
    const linkOps = queued.filter((op) => op.entityType === 'noteThread');
    expect(noteOps).toHaveLength(0);
    expect(linkOps.some((op) => op.operation === 'create')).toBe(false);
  });

  it('highlight create offline queues studyThreadEntry create op', async () => {
    const entryId = await createStudyThreadEntryOffline(testUserId, {
      parentNoteId: 'note_parent_1',
      entryKind: 'miniNote',
      sourceSnippet: 'grace',
      focusTitle: 'Grace',
    });
    expect(entryId.startsWith('local_')).toBe(true);
    const queued = await offlineDB.syncQueue.where('userId').equals(testUserId).toArray();
    expect(queued.some((op) => op.entityType === 'studyThreadEntry' && op.operation === 'create')).toBe(true);
  });

  it('pin offline queues isPinned on note update', async () => {
    const noteId = 'note_pin_1';
    await pinNoteOffline(testUserId, noteId, true, {
      content: '<p>pin me</p>',
      title: 'Pinned',
      spaceId: 'space_test',
    });
    const noteOp = await offlineDB.syncQueue
      .where('userId')
      .equals(testUserId)
      .filter((op) => op.entityType === 'note' && op.operation === 'update')
      .first();
    expect(noteOp).toBeTruthy();
    expect((noteOp!.data as Record<string, unknown>).isPinned).toBe(true);
  });

  it('connect notes offline queues noteConnection create op', async () => {
    const edgeId = await connectNotesOffline(testUserId, {
      fromNoteId: 'note_a',
      toNoteId: 'note_b',
      spaceId: 'space_test',
    });
    expect(edgeId.startsWith('local_')).toBe(true);
    const queued = await offlineDB.syncQueue.where('userId').equals(testUserId).toArray();
    expect(queued.some((op) => op.entityType === 'noteConnection' && op.operation === 'create')).toBe(true);
  });
});
